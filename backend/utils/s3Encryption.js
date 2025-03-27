// backend/utils/s3-encryption.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

/**
 * Utility for encrypting files before uploading to S3
 */
class S3Encryption {
  /**
   * Encrypts a file with a randomly generated key
   * @param {string} filePath - Path to the file to encrypt
   * @returns {Promise<Object>} - Contains paths to encrypted file and key file
   */
  static async encryptFile(filePath) {
    try {
      // Generate a random encryption key and initialization vector
      const key = crypto.randomBytes(32); // 256 bits for AES-256
      const iv = crypto.randomBytes(16);  // 128 bits for AES
      
      // Get original filename and create paths for encrypted file and key file
      const originalFileName = path.basename(filePath);
      const encryptedFilePath = `${filePath}.encrypted`;
      const keyFilePath = `${filePath}.key`;
      
      // Create cipher with AES-256-CBC (widely compatible)
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      // Create read and write streams
      const readStream = fs.createReadStream(filePath);
      const writeStream = fs.createWriteStream(encryptedFilePath);
      
      // Pipe the file through the cipher to encrypt it
      await pipeline(
        readStream,
        cipher,
        writeStream
      );
      
      // Save the encryption key and metadata to a separate file
      const keyData = {
        algorithm: 'aes-256-cbc',
        key: key.toString('hex'),
        iv: iv.toString('hex'),
        originalFileName,
        encryptedFileName: path.basename(encryptedFilePath),
        encryptedAt: new Date().toISOString(),
        fileSize: fs.statSync(filePath).size,
        // Include a checksum of the original file for verification
        originalMD5: this._calculateMD5(filePath)
      };
      
      // Write the key data to a file
      fs.writeFileSync(keyFilePath, JSON.stringify(keyData, null, 2));
      
      console.log(`File encrypted successfully: ${filePath} -> ${encryptedFilePath}`);
      
      return {
        encryptedFilePath,
        keyFilePath,
        originalFileName
      };
    } catch (error) {
      console.error('Error encrypting file:', error);
      throw error;
    }
  }
  
  /**
   * Decrypts a file using the provided key file
   * @param {string} encryptedFilePath - Path to the encrypted file
   * @param {string} keyFilePath - Path to the key file
   * @returns {Promise<string>} - Path to the decrypted file
   */
  static async decryptFile(encryptedFilePath, keyFilePath) {
    try {
      // Read the key data file
      const keyData = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
      
      // Validate the key data
      if (!keyData.key || !keyData.iv || !keyData.algorithm) {
        throw new Error('Invalid key file. Missing required encryption parameters.');
      }
      
      // Convert hex strings back to buffers
      const key = Buffer.from(keyData.key, 'hex');
      const iv = Buffer.from(keyData.iv, 'hex');
      
      // Create path for the decrypted file
      let outputPath;
      if (keyData.originalFileName) {
        // Use the original file name if available
        const outputDir = path.dirname(encryptedFilePath);
        outputPath = path.join(outputDir, `decrypted_${keyData.originalFileName}`);
      } else {
        // Otherwise just replace .encrypted extension
        outputPath = encryptedFilePath.replace('.encrypted', '.decrypted');
      }
      
      // Create decipher with the same algorithm used for encryption
      const decipher = crypto.createDecipheriv(keyData.algorithm, key, iv);
      
      // Create read and write streams
      const readStream = fs.createReadStream(encryptedFilePath);
      const writeStream = fs.createWriteStream(outputPath);
      
      // Pipe the file through the decipher to decrypt it
      await pipeline(
        readStream,
        decipher,
        writeStream
      );
      
      console.log(`File decrypted successfully: ${encryptedFilePath} -> ${outputPath}`);
      
      // Verify file integrity if original MD5 is available
      if (keyData.originalMD5) {
        const decryptedMD5 = this._calculateMD5(outputPath);
        if (decryptedMD5 !== keyData.originalMD5) {
          console.warn('WARNING: Decrypted file checksum does not match original file.');
        }
      }
      
      return outputPath;
    } catch (error) {
      console.error('Error decrypting file:', error);
      throw error;
    }
  }
  
  /**
   * Calculate MD5 hash of a file
   * @param {string} filePath - Path to the file
   * @returns {string} - MD5 hash as hex string
   * @private
   */
  static _calculateMD5(filePath) {
    try {
      const fileData = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(fileData).digest('hex');
    } catch (error) {
      console.error('Error calculating MD5:', error);
      return null;
    }
  }
  
  /**
   * Encrypt a small piece of data (like a password or key)
   * @param {string|Buffer} data - Data to encrypt
   * @param {string|Buffer} masterKey - Master key for encryption
   * @returns {Object} - Encrypted data object with hex strings
   */
  static encryptData(data, masterKey) {
    // Create a key from the master key if it's a string
    const key = typeof masterKey === 'string' 
      ? crypto.createHash('sha256').update(masterKey).digest()
      : masterKey;
      
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    // Convert data to Buffer if it's a string
    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    
    // Encrypt the data
    const encrypted = Buffer.concat([
      cipher.update(dataBuffer),
      cipher.final()
    ]);
    
    return {
      algorithm: 'aes-256-cbc',
      iv: iv.toString('hex'),
      data: encrypted.toString('hex')
    };
  }
  
  /**
   * Decrypt a small piece of data (like a password or key)
   * @param {Object} encryptedData - Encrypted data object with hex strings
   * @param {string|Buffer} masterKey - Master key for decryption
   * @returns {Buffer} - Decrypted data as Buffer
   */
  static decryptData(encryptedData, masterKey) {
    // Create a key from the master key if it's a string
    const key = typeof masterKey === 'string' 
      ? crypto.createHash('sha256').update(masterKey).digest()
      : masterKey;
      
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const data = Buffer.from(encryptedData.data, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    // Decrypt the data
    return Buffer.concat([
      decipher.update(data),
      decipher.final()
    ]);
  }
}

module.exports = S3Encryption;