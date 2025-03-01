#!/usr/bin/env node
// backend/tools/testRedisTLS.js
const Redis = require('redis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper function to verify TLS is being used
async function verifyTlsConnection(client) {
  // Generate a random key
  const testKey = `tls-test-${crypto.randomBytes(8).toString('hex')}`;
  const testValue = `value-${Date.now()}`;
  
  try {
    // Set a value
    await client.set(testKey, testValue);
    console.log('✅ Successfully wrote data to Redis');
    
    // Get the value back
    const retrievedValue = await client.get(testKey);
    console.log('✅ Successfully read data from Redis:', retrievedValue);
    
    // Verify the value matches
    if (retrievedValue === testValue) {
      console.log('✅ Data integrity verified');
      
      // Clean up the test key
      await client.del(testKey);
      console.log('✅ Successfully deleted test key');
      
      return true;
    } else {
      console.error('❌ Data integrity check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ TLS verification operation failed:', error);
    return false;
  }
}

async function testRedisTLS() {
  console.log('Redis TLS Connection Test Tool');
  console.log('===============================');
  
  // Load environment variables
  const redisPassword = process.env.REDIS_PASSWORD;
  if (!redisPassword) {
    console.error('Redis password not found in environment variables');
    process.exit(1);
  }
  
  try {
    // Find SSL certificates - prioritize container paths
    let certPath, keyPath, caPath;
    const containerCertPath = path.join(__dirname, '../certs/redis.crt');
    const containerKeyPath = path.join(__dirname, '../certs/redis.key');
    const containerCaPath = path.join(__dirname, '../certs/server.crt');
    
    if (fs.existsSync(containerCertPath) && fs.existsSync(containerKeyPath)) {
      console.log('Found certificates in container path');
      certPath = containerCertPath;
      keyPath = containerKeyPath;
      caPath = containerCaPath;
    } else {
      // Fall back to project root
      const rootCertPath = path.join(__dirname, '../../certs/redis.crt');
      const rootKeyPath = path.join(__dirname, '../../certs/redis.key');
      const rootCaPath = path.join(__dirname, '../../certs/server.crt');
      
      if (fs.existsSync(rootCertPath) && fs.existsSync(rootKeyPath)) {
        console.log('Found certificates in project root');
        certPath = rootCertPath;
        keyPath = rootKeyPath;
        caPath = rootCaPath;
      } else {
        console.error('SSL certificates not found');
        process.exit(1);
      }
    }
    
    console.log('Creating Redis client with TLS configuration');
    const client = Redis.createClient({
      socket: {
        host: 'localhost', // Use redis for Docker connections
        port: 6379,
        tls: {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
          ca: fs.readFileSync(caPath),
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.3'
        }
      },
      password: redisPassword
    });
    
    // Register event handlers
    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });
    
    client.on('connect', () => {
      console.log('✅ Redis client connected');
    });
    
    client.on('ready', async () => {
      console.log('✅ Redis client ready');
      const verified = await verifyTlsConnection(client);
      
      if (verified) {
        console.log('===============================');
        console.log('✅ Redis TLS connection is working properly!');
        console.log('===============================');
      } else {
        console.log('===============================');
        console.error('❌ Redis TLS connection verification failed!');
        console.log('===============================');
      }
      
      await client.quit();
      console.log('Redis client disconnected');
    });
    
    // Connect to Redis
    console.log('Connecting to Redis...');
    await client.connect();
  } catch (error) {
    console.error('Fatal error during Redis TLS test:', error);
    process.exit(1);
  }
}

// Run the test
testRedisTLS().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});