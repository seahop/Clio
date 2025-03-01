// lib/redis.js
const Redis = require('redis');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const RedisEncryption = require('./redisEncryption');

const encryptionKey = process.env.REDIS_ENCRYPTION_KEY;
const redisPassword = process.env.REDIS_PASSWORD;
const REDIS_SSL = process.env.REDIS_SSL === 'true';
const DEBUG = process.env.REDIS_DEBUG === 'true';

if (!encryptionKey || !redisPassword) {
  throw new Error('Required environment variables are missing');
}

const encryption = new RedisEncryption(encryptionKey);

// Override Node.js TLS settings
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Create Redis client with TLS configured at the socket level
const createClient = () => {
  console.log('Creating Redis client with secure configuration');
  
  return Redis.createClient({
    url: 'rediss://redis:6379', // Use rediss:// for TLS
    socket: {
      tls: true,
      rejectUnauthorized: false,
      reconnectStrategy: (retries) => {
        const maxRetries = parseInt(process.env.REDIS_RETRY_ATTEMPTS) || 20;
        if (retries >= maxRetries) {
          console.error('Max Redis reconnection attempts reached');
          return new Error('Max Redis reconnection attempts reached');
        }
        const delay = Math.min(1000 + (retries * 100), 3000);
        console.log(`Reconnecting to Redis in ${delay}ms... (attempt ${retries + 1}/${maxRetries})`);
        return delay;
      },
      connectTimeout: 10000,
      keepAlive: 5000
    },
    password: redisPassword,
    commandTimeout: 5000
  });
};

// Initialize Redis client
let redisClient;
try {
  redisClient = createClient();
} catch (error) {
  console.error('Failed to create Redis client:', error);
  throw error;
}

// Create a promisified wrapper for Redis operations with connection management
const secureRedis = {
  isConnected: false,
  connectionPromise: null,

  async connect() {
    if (this.connectionPromise) {
      if (DEBUG) console.log('Using existing connection promise');
      return this.connectionPromise;
    }

    this.connectionPromise = (async () => {
      try {
        if (!this.isConnected) {
          if (DEBUG) console.log('Attempting to connect to Redis with TLS...');
          console.log('Connecting to Redis with TLS configuration');
          await redisClient.connect();
          this.isConnected = true;
          console.log('Redis TLS connection established');
        }
      } catch (error) {
        this.isConnected = false;
        this.connectionPromise = null;
        if (DEBUG) console.error('Redis TLS connection error:', error);
        throw error;
      }
    })();

    return this.connectionPromise;
  },

  async ensureConnection() {
    let retries = parseInt(process.env.REDIS_RETRY_ATTEMPTS) || 5;
    while (retries > 0) {
      try {
        await this.connect();
        // Test the connection with a PING
        if (DEBUG) console.log('Testing Redis connection with PING...');
        await redisClient.ping();
        if (DEBUG) console.log('Redis PING successful');
        return;
      } catch (error) {
        console.error(`Redis connection attempt failed (${retries} retries left):`, error);
        this.isConnected = false;
        this.connectionPromise = null;
        retries--;
        if (retries > 0) {
          if (DEBUG) console.log(`Waiting 1s before retry... (${retries} attempts remaining)`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw new Error('Failed to establish Redis connection after retries');
        }
      }
    }
  },

  async withRetry(operation, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.ensureConnection();
        const result = await operation();
        if (DEBUG) console.log(`Operation successful on attempt ${i + 1}`);
        return result;
      } catch (error) {
        console.error(`Operation failed (${maxRetries - i - 1} retries left):`, error);
        lastError = error;
        if (i < maxRetries - 1) {
          if (DEBUG) console.log('Waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    throw lastError;
  },

  // Wrap Redis operations with retry logic
  async set(key, value, options) {
    if (DEBUG) console.log(`Setting key: ${key}`);
    return this.withRetry(async () => {
      const encrypted = encryption.encrypt(value);
      return await redisClient.set(key, JSON.stringify(encrypted), options);
    });
  },

  async get(key) {
    if (DEBUG) console.log(`Getting key: ${key}`);
    return this.withRetry(async () => {
      const result = await redisClient.get(key);
      if (!result) {
        if (DEBUG) console.log(`No value found for key: ${key}`);
        return null;
      }
      
      try {
        const parsed = JSON.parse(result);
        if (parsed.encrypted && parsed.iv && parsed.authTag) {
          if (DEBUG) console.log(`Decrypting value for key: ${key}`);
          return encryption.decrypt(parsed);
        }
        return parsed;
      } catch (error) {
        if (DEBUG) console.log(`Parse error for key ${key}, returning raw result`);
        return result;
      }
    });
  },

  async setEx(key, seconds, value) {
    if (DEBUG) console.log(`Setting key with expiration: ${key} (${seconds}s)`);
    return this.withRetry(async () => {
      const encrypted = encryption.encrypt(value);
      return await redisClient.setEx(key, seconds, JSON.stringify(encrypted));
    });
  },

  async del(key) {
    if (DEBUG) console.log(`Deleting key: ${key}`);
    return this.withRetry(async () => redisClient.del(key));
  },

  async keys(pattern) {
    if (DEBUG) console.log(`Searching keys with pattern: ${pattern}`);
    return this.withRetry(async () => redisClient.keys(pattern));
  },

  async sAdd(key, value) {
    if (DEBUG) console.log(`Adding to set ${key}: ${value}`);
    return this.withRetry(async () => redisClient.sAdd(key, value));
  },

  async sRem(key, value) {
    if (DEBUG) console.log(`Removing from set ${key}: ${value}`);
    return this.withRetry(async () => redisClient.sRem(key, value));
  },

  async exists(key) {
    if (DEBUG) console.log(`Checking existence of key: ${key}`);
    return this.withRetry(async () => redisClient.exists(key));
  }
};

// Event handlers
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
  secureRedis.isConnected = false;
  secureRedis.connectionPromise = null;
});

redisClient.on('connect', () => {
  console.log('Redis Client Connected');
});

redisClient.on('reconnecting', () => {
  console.log('Redis Client Reconnecting...');
  secureRedis.isConnected = false;
  secureRedis.connectionPromise = null;
});

redisClient.on('ready', () => {
  console.log('Redis Client Ready');
  secureRedis.isConnected = true;
});

redisClient.on('end', () => {
  console.log('Redis Client Connection Ended');
  secureRedis.isConnected = false;
  secureRedis.connectionPromise = null;
});

// Initial connection function
const connectRedis = async () => {
  try {
    await secureRedis.connect();
    // Verify connection with a ping
    await redisClient.ping();
    if (DEBUG) console.log('Initial Redis connection verified with PING');
    return true;
  } catch (err) {
    console.error('Redis connection error:', err);
    throw err;
  }
};

module.exports = { 
  redisClient: secureRedis,
  connectRedis 
};