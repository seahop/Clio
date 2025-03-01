//config/security.js
const crypto = require('crypto');

const generateSecurePassword = (length = 16) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const randomBytes = crypto.randomBytes(length * 2);
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes[i] % charset.length;
    password += charset[randomIndex];
  }
  
  return password;
};

const hashPassword = async (password) => {
  return new Promise((resolve, reject) => {
    // Generate a random salt
    const salt = crypto.randomBytes(32);
    
    // Use PBKDF2 with high iteration count
    crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      
      // Combine salt and hash into a single string
      const combined = Buffer.concat([salt, derivedKey])
        .toString('base64');
      resolve(combined);
    });
  });
};

// Generate passwords and their hashes
const plainAdminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();
const plainUserPassword = process.env.USER_PASSWORD || generateSecurePassword();

// Initialize empty hashed passwords - will be set after async initialization
let hashedAdminPassword = null;
let hashedUserPassword = null;

const security = {
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  ADMIN_SECRET: crypto.randomBytes(64).toString('hex'),
  SERVER_INSTANCE_ID: crypto.randomBytes(32).toString('hex'),
  
  // Methods to access the passwords
  getPlainAdminPassword: () => plainAdminPassword,
  getPlainUserPassword: () => plainUserPassword,
  getHashedAdminPassword: () => hashedAdminPassword,
  getHashedUserPassword: () => hashedUserPassword,
  
  // Method to verify a password against a hash
  verifyPassword: (password, hashedPassword) => {
    return new Promise((resolve, reject) => {
      try {
        // Decode the combined salt:hash string
        const combined = Buffer.from(hashedPassword, 'base64');
        
        // Extract salt and hash
        const salt = combined.slice(0, 32);
        const hash = combined.slice(32);
        
        // Hash the input password with the same salt
        crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, derivedKey) => {
          if (err) reject(err);
          
          // Compare the hashes using a timing-safe comparison
          const match = crypto.timingSafeEqual(hash, derivedKey);
          resolve(match);
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Initialize the hashed passwords
  initialize: async () => {
    hashedAdminPassword = await hashPassword(plainAdminPassword);
    hashedUserPassword = await hashPassword(plainUserPassword);
    
    // Log the plain passwords for development use
    console.log('\x1b[31m%s\x1b[0m', `Generated Admin Password: ${plainAdminPassword}`);
    console.log('\x1b[33m%s\x1b[0m', `Generated User Password: ${plainUserPassword}`);
  }
};

module.exports = security;