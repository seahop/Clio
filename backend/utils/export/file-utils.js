// backend/utils/export/file-utils.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Ensure a directory exists
 * @param {String} dirPath - Directory path
 * @returns {Promise<void>}
 */
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(dirPath, { recursive: true });
  }
};

/**
 * Generate a unique filename with timestamp
 * @param {String} prefix - Filename prefix
 * @param {String} extension - File extension (without dot)
 * @returns {String} Generated filename
 */
const generateUniqueFilename = (prefix, extension) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomStr = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${randomStr}.${extension}`;
};

/**
 * Safely delete a file
 * @param {String} filePath - Path to the file
 * @returns {Promise<boolean>} Success status
 */
const safelyDeleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
    return false;
  }
};

/**
 * Validate a filename to prevent path traversal
 * @param {String} filename - Filename to validate
 * @returns {Boolean} Is valid
 */
const isValidFilename = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  
  // Check for path traversal attempts
  if (filename.includes('..') || 
      filename.includes('/') || 
      filename.includes('\\')) {
    return false;
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(filename)) {
    return false;
  }
  
  return true;
};

/**
 * Get absolute path to the export directory
 * @returns {String} Export directory path
 */
const getExportDirectory = () => {
  return path.join(__dirname, '../../exports');
};

/**
 * Clean up temporary directories
 * @param {String} dirPath - Directory to clean up
 * @param {Number} delayMs - Delay in milliseconds before cleanup
 * @returns {Promise<void>}
 */
const scheduleCleanup = (dirPath, delayMs = 5000) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`Cleaned up directory: ${dirPath}`);
        resolve();
      } catch (err) {
        console.error(`Error cleaning up directory ${dirPath}:`, err);
        resolve(); // Resolve anyway to prevent hanging
      }
    }, delayMs);
  });
};

module.exports = {
  ensureDirectoryExists,
  generateUniqueFilename,
  safelyDeleteFile,
  isValidFilename,
  getExportDirectory,
  scheduleCleanup
};