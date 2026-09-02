// backend/controllers/encryption.controller.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const eventLogger = require('../lib/eventLogger');

/**
 * Simple implementation of file encryption for S3 upload with modified file naming
 */
const encryptForS3 = async (req, res) => {
  try {
    const { filePath, filename } = req.body;
    
    console.log('Encryption request received:', { filePath, filename });
    
    if (!filePath) {
      console.error('No file path provided in request');
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Find the exact file path by checking multiple locations
    const possibleLocations = [
      // Try app-relative paths
      path.join(__dirname, '../exports', path.basename(filePath || '')),
      path.join(__dirname, '../exports', filename || ''),
      // Try directly in exports
      '/app/exports/' + path.basename(filePath || ''),
      '/app/exports/' + (filename || '')
    ];
    
    console.log('Checking possible file locations:', possibleLocations);
    
    // Find the first path that exists
    let sourceFilePath = null;
    for (const location of possibleLocations) {
      if (fs.existsSync(location)) {
        sourceFilePath = location;
        console.log(`Found file at: ${sourceFilePath}`);
        break;
      }
    }
    
    if (!sourceFilePath) {
      console.error('File not found in any location');
      return res.status(404).json({ 
        error: 'File not found',
        detail: 'Could not find the file to encrypt'
      });
    }
    
    // Get filename without path
    const sourceFileName = path.basename(sourceFilePath);
    
    // Split the filename into base and extension
    const fileExt = path.extname(sourceFileName);
    const baseName = sourceFileName.slice(0, -fileExt.length);
    
    // Create new filenames with .encrypted and .key before the extension
    const encryptedFileName = `${baseName}.encrypted${fileExt}`;
    const keyFileName = `${baseName}.key${fileExt}`;

    // Create output path in the same directory as the source file.
    // The key material is NEVER written to disk — it is returned in the API
    // response only, so it can't be fetched from the shared /exports dir or
    // uploaded next to the ciphertext.
    const sourceDir = path.dirname(sourceFilePath);
    const encryptedFilePath = path.join(sourceDir, encryptedFileName);

    console.log('Using paths:', {
      sourceFilePath,
      encryptedFilePath,
      baseName,
      fileExt
    });
    
    // Generate encryption key and IV
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    
    // Read the source file
    const fileData = fs.readFileSync(sourceFilePath);
    console.log(`Read ${fileData.length} bytes from source file`);
    
    // Create cipher and encrypt
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encryptedData = Buffer.concat([
      cipher.update(fileData),
      cipher.final()
    ]);
    
    // Write encrypted file
    fs.writeFileSync(encryptedFilePath, encryptedData);
    console.log(`Wrote ${encryptedData.length} bytes to encrypted file`);
    
    // Key material with metadata — returned to the caller only, never persisted
    const keyData = {
      algorithm: 'aes-256-cbc',
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      originalFileName: sourceFileName,
      encryptedFileName: encryptedFileName,
      encryptedAt: new Date().toISOString(),
      fileSize: fileData.length
    };

    // Log the encryption (never log the key material itself)
    await eventLogger.logAuditEvent('encrypt_file_for_s3', req.user.username, {
      originalFile: sourceFileName,
      encryptedFile: encryptedFileName,
      keyFile: keyFileName,
      keyDelivery: 'api-response',
      timestamp: new Date().toISOString()
    });

    // Return web path for the encrypted file plus the key material for the
    // operator to save locally (the frontend triggers a browser download)
    const webPathPrefix = '/exports/';
    res.json({
      encryptedFilePath: webPathPrefix + encryptedFileName,
      originalFileName: sourceFileName,
      encryptedFileName: encryptedFileName,
      keyFileName: keyFileName,
      keyData: keyData
    });
  } catch (error) {
    console.error('Error encrypting file for S3:', error);
    res.status(500).json({ 
      error: 'Failed to encrypt file', 
      detail: error.message 
    });
  }
};

/**
 * Simple implementation of file decryption from S3 with modified file naming
 */
const decryptFromS3 = async (req, res) => {
  try {
    const { encryptedFilePath, keyFilePath } = req.body;
    
    if (!encryptedFilePath || !keyFilePath) {
      return res.status(400).json({ error: 'Encrypted file path and key file path are required' });
    }
    
    // Extract filenames from paths
    const encryptedFile = path.basename(encryptedFilePath);
    const keyFile = path.basename(keyFilePath);
    
    // Construct server paths
    const exportDir = path.join(__dirname, '../exports');
    const serverEncryptedPath = path.join(exportDir, encryptedFile);
    const serverKeyPath = path.join(exportDir, keyFile);
    
    console.log('Decryption paths:', {
      encryptedPath: serverEncryptedPath,
      keyPath: serverKeyPath
    });
    
    // Check if files exist
    if (!fs.existsSync(serverEncryptedPath) || !fs.existsSync(serverKeyPath)) {
      console.error('Files not found for decryption:', {
        encryptedExists: fs.existsSync(serverEncryptedPath),
        keyExists: fs.existsSync(serverKeyPath)
      });
      return res.status(404).json({ error: 'Encrypted file or key file not found' });
    }
    
    // Read key file
    const keyData = JSON.parse(fs.readFileSync(serverKeyPath, 'utf8'));
    
    // Read encrypted file
    const encryptedData = fs.readFileSync(serverEncryptedPath);
    
    // Extract key and IV
    const key = Buffer.from(keyData.key, 'hex');
    const iv = Buffer.from(keyData.iv, 'hex');
    
    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(keyData.algorithm, key, iv);
    const decryptedData = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    // Get original filename from key data
    const originalFileName = keyData.originalFileName;
    const decryptedFilePath = path.join(exportDir, `decrypted_${originalFileName}`);
    
    // Write decrypted file
    fs.writeFileSync(decryptedFilePath, decryptedData);
    console.log(`File decrypted successfully: ${decryptedFilePath}`);
    
    // Log the decryption
    await eventLogger.logAuditEvent('decrypt_file_from_s3', req.user.username, {
      encryptedFile,
      keyFile,
      decryptedFile: path.basename(decryptedFilePath),
      timestamp: new Date().toISOString()
    });
    
    res.json({
      decryptedFilePath: `/exports/${path.basename(decryptedFilePath)}`,
      originalFileName: originalFileName
    });
  } catch (error) {
    console.error('Error decrypting file from S3:', error);
    res.status(500).json({ error: 'Failed to decrypt file', detail: error.message });
  }
};

module.exports = {
  encryptForS3,
  decryptFromS3
};