// lib/redisEncryption.js
const crypto = require('crypto');

class RedisEncryption {
  constructor(encryptionKey) {
    // If the key is in hex format (64 characters), convert it to bytes
    if (encryptionKey.length === 64 && /^[0-9a-fA-F]+$/.test(encryptionKey)) {
      this.encryptionKey = Buffer.from(encryptionKey, 'hex');
    } else {
      this.encryptionKey = Buffer.from(encryptionKey);
    }

    if (this.encryptionKey.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (or 64 hex characters)');
    }
  }

  encrypt(data) {
    try {
      // Generate a random IV for each encryption
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      
      // Convert data to string if it's not already
      const stringData = typeof data === 'string' ? data : JSON.stringify(data);
      
      // Encrypt the data
      let encrypted = cipher.update(stringData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get the auth tag
      const authTag = cipher.getAuthTag();
      
      // Return everything needed for decryption
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(data) {
    try {
      const { encrypted, iv, authTag } = data;
      
      // Convert hex strings back to buffers
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(iv, 'hex')
      );
      
      // Set auth tag
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      // Decrypt
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Parse JSON if the original data was an object
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }
}

module.exports = RedisEncryption;