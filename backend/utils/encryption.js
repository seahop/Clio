// backend/utils/encryption.js
const crypto = require('crypto');

/**
 * Utility for encrypting and decrypting sensitive fields
 */
class FieldEncryption {
  constructor(options = {}) {
    // Use provided key or get from environment variables
    this.encryptionKey = options.encryptionKey || process.env.FIELD_ENCRYPTION_KEY;
    
    if (!this.encryptionKey) {
      throw new Error('Encryption key is required. Set FIELD_ENCRYPTION_KEY in your environment.');
    }
    
    // Convert hex key to Buffer if needed
    if (typeof this.encryptionKey === 'string' && this.encryptionKey.length === 64) {
      this.encryptionKey = Buffer.from(this.encryptionKey, 'hex');
    } else if (typeof this.encryptionKey === 'string') {
      // If string key is provided but not in hex format, derive a proper key using PBKDF2
      const salt = crypto.createHash('sha256').update('field-encryption-salt').digest();
      this.encryptionKey = crypto.pbkdf2Sync(this.encryptionKey, salt, 10000, 32, 'sha256');
    }
    
    // Validate key length
    if (this.encryptionKey.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (256 bits)');
    }
    
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Encrypt a string or object value
   * @param {string|object} value - The value to encrypt
   * @returns {object|null} - The encrypted data object or null if value is null/undefined
   */
  encrypt(value) {
    if (value === null || value === undefined) {
      return null;
    }
    
    try {
      // Convert object to string if needed
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      
      // Generate a random initialization vector
      const iv = crypto.randomBytes(16);
      
      // Create cipher with key, IV, and algorithm
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      // Encrypt the value
      let encrypted = cipher.update(valueStr, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get the auth tag for GCM mode
      const authTag = cipher.getAuthTag();
      
      // Return the encrypted data with all necessary components for decryption
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        type: typeof value,
        algorithm: this.algorithm
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt value');
    }
  }

  /**
   * Decrypt an encrypted value
   * @param {object} encryptedData - The object containing encrypted data
   * @returns {string|object|null} - The decrypted value or null if input is null/undefined
   */
  decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
      return encryptedData; // Return as is if not in the expected format
    }
    
    try {
      const { encrypted, iv, authTag, type, algorithm } = encryptedData;
      
      // Ensure we're using the right algorithm
      if (algorithm !== this.algorithm) {
        throw new Error(`Algorithm mismatch: expected ${this.algorithm}, got ${algorithm}`);
      }
      
      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        Buffer.from(iv, 'hex')
      );
      
      // Set auth tag from encrypted data
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      // Decrypt
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Convert back to original type if needed
      if (type === 'object') {
        return JSON.parse(decrypted);
      }
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      // Return placeholder on error rather than failing
      return '[Decryption failed]';
    }
  }

  /**
   * Check if a value appears to be encrypted data
   * @param {any} value - The value to check
   * @returns {boolean} - True if the value appears to be encrypted data
   */
  isEncrypted(value) {
    return (
      value !== null &&
      typeof value === 'object' &&
      value.encrypted &&
      value.iv &&
      value.authTag &&
      value.algorithm
    );
  }
}

// Export a singleton instance for reuse
const fieldEncryption = new FieldEncryption();

module.exports = fieldEncryption;