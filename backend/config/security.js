//config/security.js
const crypto = require('crypto');

// Use environment variables strictly for passwords
const plainAdminPassword = process.env.ADMIN_PASSWORD;
const plainUserPassword = process.env.USER_PASSWORD;
const redisPassword = process.env.REDIS_PASSWORD;
const redisEncryptionKey = process.env.REDIS_ENCRYPTION_KEY;

if (!plainAdminPassword || !plainUserPassword || !redisPassword || !redisEncryptionKey) {
  throw new Error('Required environment variables are missing. Please ensure ADMIN_PASSWORD, USER_PASSWORD, REDIS_PASSWORD, and REDIS_ENCRYPTION_KEY are set.');
}

// Initialize these variables at the module level
let hashedAdminPassword = null;
let hashedUserPassword = null;
const SERVER_INSTANCE_ID = process.env.SERVER_INSTANCE_ID || crypto.randomBytes(32).toString('hex');
const ADMIN_SECRET = crypto.randomBytes(64).toString('hex');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Helper function to hash passwords
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    // Generate a random salt
    const salt = crypto.randomBytes(32);
    
    // Use PBKDF2 with high iteration count
    crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      
      // Combine salt and hash into a single string
      const combined = Buffer.concat([salt, derivedKey]).toString('base64');
      resolve(combined);
    });
  });
}

// Helper function to verify passwords
async function verifyPassword(password, hashedPassword) {
  return new Promise((resolve, reject) => {
    try {
      // Decode the combined salt:hash string
      const combined = Buffer.from(hashedPassword, 'base64');
      
      // Extract salt and stored hash
      const salt = combined.slice(0, 32);
      const storedHash = combined.slice(32);
      
      // Hash the input password with the same salt
      crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        
        try {
          // Compare the hashes using a timing-safe comparison
          const match = crypto.timingSafeEqual(storedHash, derivedKey);
          resolve(match);
        } catch (error) {
          console.error('Error in password comparison:', error);
          resolve(false);
        }
      });
    } catch (error) {
      console.error('Error in password verification:', error);
      resolve(false);
    }
  });
}

// Initialize the Redis client lazily
let redisClient = null;
function getRedisClient() {
  if (!redisClient) {
    redisClient = require('../lib/redis').redisClient;
  }
  return redisClient;
}

// User password management functions
async function getUserPassword(username) {
  try {
    const client = getRedisClient();
    const prefix = 'user:password:';
    return await client.get(`${prefix}${username}`);
  } catch (error) {
    console.error('Error getting user password:', error);
    return null;
  }
}

async function setUserPassword(username, password) {
  const hashedPassword = await hashPassword(password);
  const client = getRedisClient();
  const prefix = 'user:password:';
  await client.set(`${prefix}${username}`, hashedPassword);
}

async function getAdminPassword(username) {
  try {
    const client = getRedisClient();
    const prefix = 'admin:password:';
    return await client.get(`${prefix}${username}`);
  } catch (error) {
    console.error('Error getting admin password:', error);
    return null;
  }
}

async function setAdminPassword(username, password) {
  const hashedPassword = await hashPassword(password);
  const client = getRedisClient();
  const prefix = 'admin:password:';
  await client.set(`${prefix}${username}`, hashedPassword);
}

async function isFirstTimeLogin(username) {
  try {
    const client = getRedisClient();
    const prefix = 'user:password:';
    return !(await client.exists(`${prefix}${username}`));
  } catch (error) {
    console.error('Error checking first time login:', error);
    return true;
  }
}

async function isFirstTimeAdminLogin(username) {
  try {
    const client = getRedisClient();
    const prefix = 'admin:password:';
    return !(await client.exists(`${prefix}${username}`));
  } catch (error) {
    console.error('Error checking first time admin login:', error);
    return true;
  }
}

// Check if the password matches either the user's password or the initial password
async function verifyUserPassword(username, password) {
  try {
    // Get user's custom password if it exists
    const userPassword = await getUserPassword(username);
    
    if (userPassword) {
      // User has set their own password, check against that
      return await verifyPassword(password, userPassword);
    } else {
      // No custom password set, check against initial password
      return await verifyPassword(password, hashedUserPassword);
    }
  } catch (error) {
    console.error('Error in password verification:', error);
    return false;
  }
}

// Initialization function
async function initialize() {
  try {
    hashedAdminPassword = await hashPassword(plainAdminPassword);
    hashedUserPassword = await hashPassword(plainUserPassword);
    
    // Always show credentials on first initialization
    console.log('\n=== Authentication Credentials ===');
    console.log('\x1b[31m%s\x1b[0m', `Admin Password: ${plainAdminPassword}`);
    console.log('\x1b[33m%s\x1b[0m', `User Password: ${plainUserPassword}`);
    console.log('\x1b[36m%s\x1b[0m', `Server Instance ID: ${SERVER_INSTANCE_ID}`);
    console.log('===============================\n');
    
    // Additional development logging
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode additional information:');
      console.log('Redis Password:', redisPassword);
      console.log('JWT Secret:', JWT_SECRET);
    }
  } catch (error) {
    console.error('Error initializing security:', error);
    throw error;
  }
}

module.exports = {
  SERVER_INSTANCE_ID,
  ADMIN_SECRET,
  JWT_SECRET,
  initialize,
  getHashedAdminPassword: () => hashedAdminPassword,
  getHashedUserPassword: () => hashedUserPassword,
  verifyPassword,
  getUserPassword,
  setUserPassword,
  getAdminPassword,
  setAdminPassword,
  isFirstTimeLogin,
  isFirstTimeAdminLogin,
  verifyUserPassword,
  // Redis credentials
  redisPassword,
  redisEncryptionKey
};