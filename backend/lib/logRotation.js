// lib/logRotation.js
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { createWriteStream } = require('fs');
const { format } = require('date-fns');
const eventLogger = require('./eventLogger');

/**
 * Log Rotation Module
 * Handles automatic rotation of application logs
 * Now with S3 export capability and synchronization with event logger
 */
class LogRotationManager {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../data');
    this.archiveDir = options.archiveDir || path.join(this.dataDir, 'archives');
    this.exportDir = options.exportDir || path.join(__dirname, '../exports');
    this.logFiles = options.logFiles || [
      'security_logs.json',
      'data_logs.json',
      'system_logs.json',
      'audit_logs.json'
    ];
    this.rotationInterval = options.rotationInterval || 24 * 60 * 60 * 1000; // Default to daily rotation
    this.maxLogsPerFile = options.maxLogsPerFile || 10000; // Match eventLogger.js limit
    this.timer = null;
    this.isInitialized = false;
    this.s3Uploads = new Map(); // Track S3 upload status for archives
    this.isRotating = false; // Flag to track active rotation
  }

  /**
   * Initialize the log rotation system
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Ensure archive directory exists
      await this.ensureDirectoryExists(this.archiveDir);
      await this.ensureDirectoryExists(this.exportDir);
      
      // Perform initial check and schedule ongoing rotation
      await this.checkAndRotate();
      
      // Schedule periodic rotation
      this.timer = setInterval(() => {
        this.checkAndRotate().catch(error => {
          console.error('Scheduled log rotation failed:', error);
          eventLogger.logSystemEvent('log_rotation_error', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
      }, this.rotationInterval);
      
      this.isInitialized = true;
      console.log('Log rotation system initialized');
      
      await eventLogger.logSystemEvent('log_rotation_initialized', {
        rotationInterval: this.rotationInterval,
        maxLogsPerFile: this.maxLogsPerFile,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize log rotation system:', error);
      await eventLogger.logSystemEvent('log_rotation_init_error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }
  
  /**
   * Stop the rotation scheduler
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.isInitialized = false;
      console.log('Log rotation scheduler stopped');
    }
  }

  /**
   * Ensure a directory exists
   */
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Check if logs need to be rotated and perform rotation if necessary
   */
  async checkAndRotate() {
    // Check if rotation is already in progress
    if (this.isRotating) {
      console.log('Log rotation already in progress, skipping check');
      return {
        success: true,
        rotatedFiles: [],
        message: 'Log rotation already in progress',
        timestamp: new Date().toISOString()
      };
    }

    try {
      // Set the rotating flag to prevent concurrent rotations
      this.isRotating = true;

      // Check each log file's size
      const rotations = [];
      
      for (const logFile of this.logFiles) {
        const needsRotation = await this.checkLogFile(logFile);
        if (needsRotation) {
          rotations.push(logFile);
        }
      }
      
      // If any files need rotation, perform the rotation
      if (rotations.length > 0) {
        await this.rotateLogs(rotations);
        
        this.isRotating = false;  // Reset the flag
        
        return {
          success: true,
          rotatedFiles: rotations,
          timestamp: new Date().toISOString()
        };
      }
      
      this.isRotating = false;  // Reset the flag
      
      return {
        success: true,
        rotatedFiles: [],
        message: 'No logs needed rotation',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Log rotation check failed:', error);
      
      // Make sure to reset the rotation flag in case of error
      this.isRotating = false;
      
      await eventLogger.logSystemEvent('log_rotation_check_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Check if a log file needs rotation
   */
  async checkLogFile(fileName) {
    const filePath = path.join(this.dataDir, fileName);
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Read the current log file
      const data = await fs.readFile(filePath, 'utf8');
      let logs = [];
      
      try {
        logs = JSON.parse(data);
      } catch (parseError) {
        console.error(`Error parsing ${fileName}: ${parseError.message}`);
        
        // Create backup of corrupted file
        const backupPath = `${filePath}.corrupted.${Date.now()}`;
        await fs.writeFile(backupPath, data);
        console.log(`Corrupted log file backed up to ${backupPath}`);
        
        // Log the corruption event
        await eventLogger.logSystemEvent('log_file_corrupted', {
          file: fileName,
          backupPath,
          error: parseError.message,
          timestamp: new Date().toISOString()
        });
        
        // Start with empty logs but trigger rotation
        logs = [];
        return true;
      }
      
      // If logs is not an array, reset it
      if (!Array.isArray(logs)) {
        console.warn(`${fileName} does not contain a valid array, triggering rotation`);
        return true;
      }
      
      // Check if log count exceeds threshold
      if (logs.length >= this.maxLogsPerFile) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn(`${fileName} does not exist or cannot be read: ${error.message}`);
      return false;
    }
  }

  /**
   * Rotate the specified log files
   * @param {Array} logFiles - Array of log files to rotate
   * @param {Object} options - Options for rotation
   * @param {boolean} options.useS3 - Whether to mark for S3 export
   */
  async rotateLogs(logFiles, options = {}) {
    try {
      // Current date for naming archives
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const timestamp = Date.now();
      const archiveFileName = `logs_${dateStr}_${timestamp}.zip`;
      const archivePath = path.join(this.archiveDir, archiveFileName);
      
      // Also create a copy in the exports directory for frontend access
      const exportPath = path.join(this.exportDir, archiveFileName);
      
      // Get log type for each file (remove _logs.json suffix)
      const logTypes = logFiles.map(file => file.replace('_logs.json', ''));
      
      // Set rotation locks for each file to prevent race conditions
      for (const logType of logTypes) {
        await eventLogger.setRotationLock(logType, true);
      }
      
      // Wait a short time for any in-flight writes to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Create a zip archive
      await this.createArchive(logFiles, archivePath);
      
      console.log(`Copying archive to exports directory for frontend access: ${exportPath}`);
      // Create a copy in exports directory
      try {
        await fs.copyFile(archivePath, exportPath);
        console.log(`Successfully copied archive to exports directory at ${exportPath}`);
      } catch (copyError) {
        console.error(`Error copying archive to exports directory: ${copyError.message}`);
        // Continue execution even if copy fails
      }
      
      // Reset each log file
      const resets = [];
      for (const logFile of logFiles) {
        resets.push(this.resetLogFile(logFile));
      }
      
      await Promise.all(resets);
      
      // Release rotation locks - do this AFTER files have been reset
      for (const logType of logTypes) {
        await eventLogger.setRotationLock(logType, false);
      }
      
      // Set S3 upload status if requested
      if (options.useS3) {
        this.s3Uploads.set(archiveFileName, {
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }
      
      // Log the rotation event with S3 info if applicable
      await eventLogger.logSystemEvent('log_rotation_completed', {
        rotatedFiles: logFiles,
        archiveFile: archiveFileName,
        s3Export: options.useS3 ? 'requested' : 'not_requested',
        timestamp: new Date().toISOString()
      });
      
      console.log(`Log rotation completed. ${logFiles.length} files archived to ${archiveFileName}`);
      
      return {
        success: true,
        rotatedFiles: logFiles,
        archiveFile: archiveFileName,
        archivePath: archivePath,
        // Return the web-accessible path instead of the filesystem path
        exportPath: `/exports/${archiveFileName}`,  // Changed to return the web path
        s3Export: options.useS3 || false
      };
    } catch (error) {
      console.error('Log rotation failed:', error);
      
      // Make sure to release locks in case of error
      for (const logFile of logFiles) {
        const logType = logFile.replace('_logs.json', '');
        await eventLogger.setRotationLock(logType, false);
      }
      
      await eventLogger.logSystemEvent('log_rotation_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Create a zip archive of log files
   */
  createArchive(logFiles, outputPath) {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      output.on('close', () => {
        console.log(`Archive created: ${outputPath} (${archive.pointer()} bytes)`);
        resolve();
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      
      // Add each log file to the archive with timestamp in the name
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      
      for (const fileName of logFiles) {
        const filePath = path.join(this.dataDir, fileName);
        const archiveName = `${path.basename(fileName, '.json')}_${dateStr}.json`;
        archive.file(filePath, { name: archiveName });
      }
      
      archive.finalize();
    });
  }

  /**
   * Reset a log file to an empty array
   */
  async resetLogFile(fileName) {
    const filePath = path.join(this.dataDir, fileName);
    await fs.writeFile(filePath, JSON.stringify([], null, 2));
    console.log(`Reset ${fileName} to empty array`);
  }

  /**
   * Manually trigger log rotation
   * @param {Object} options - Options for rotation
   * @param {boolean} options.useS3 - Whether to mark for S3 export
   */
  async forceRotation(options = {}) {
    // Check if rotation is already in progress
    if (this.isRotating) {
      console.log('Log rotation already in progress, cannot force rotation');
      return {
        success: false,
        error: 'Log rotation already in progress',
        timestamp: new Date().toISOString()
      };
    }
    
    try {
      // Set the rotation flag
      this.isRotating = true;
      
      console.log('Manual log rotation triggered', options);
      const result = await this.rotateLogs(this.logFiles, options);
      
      // Reset the rotation flag
      this.isRotating = false;
      
      return result;
    } catch (error) {
      // Make sure to reset the flag in case of error
      this.isRotating = false;
      
      console.error('Forced log rotation failed:', error);
      throw error;
    }
  }

  /**
   * Update S3 upload status for an archive
   * @param {string} archiveFileName - The archive file name
   * @param {string} status - The new status (pending, success, failed)
   * @param {Object} details - Additional details
   */
  updateS3UploadStatus(archiveFileName, status, details = {}) {
    this.s3Uploads.set(archiveFileName, {
      status,
      ...details,
      updatedAt: new Date().toISOString()
    });

    console.log(`Updated S3 upload status for ${archiveFileName} to ${status}`);
  }

  /**
   * Get S3 upload status for an archive
   * @param {string} archiveFileName - The archive file name
   * @returns {Object|null} The upload status or null if not found
   */
  getS3UploadStatus(archiveFileName) {
    return this.s3Uploads.get(archiveFileName) || null;
  }

  /**
   * Get all S3 upload statuses
   * @returns {Array} Array of archive statuses
   */
  getAllS3UploadStatuses() {
    const statuses = [];
    for (const [archiveFileName, status] of this.s3Uploads.entries()) {
      statuses.push({
        archiveFileName,
        ...status
      });
    }
    return statuses;
  }
}

// Create a singleton instance
const logRotationManager = new LogRotationManager();

module.exports = logRotationManager;