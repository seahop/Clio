// backend/lib/logRotation.js
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { createWriteStream } = require('fs');
const { format } = require('date-fns');
const eventLogger = require('./eventLogger');

/**
 * Log Rotation Module
 * Handles automatic rotation of application logs
 */
class LogRotationManager {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../data');
    this.archiveDir = options.archiveDir || path.join(this.dataDir, 'archives');
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
  }

  /**
   * Initialize the log rotation system
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Ensure archive directory exists
      await this.ensureDirectoryExists(this.archiveDir);
      
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
    try {
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
        return {
          success: true,
          rotatedFiles: rotations,
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        success: true,
        rotatedFiles: [],
        message: 'No logs needed rotation',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Log rotation check failed:', error);
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
   */
  async rotateLogs(logFiles) {
    try {
      // Current date for naming archives
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const timestamp = Date.now();
      const archiveFileName = `logs_${dateStr}_${timestamp}.zip`;
      const archivePath = path.join(this.archiveDir, archiveFileName);
      
      // Create a zip archive
      await this.createArchive(logFiles, archivePath);
      
      // Reset each log file
      const resets = [];
      for (const logFile of logFiles) {
        resets.push(this.resetLogFile(logFile));
      }
      
      await Promise.all(resets);
      
      // Log the rotation event
      await eventLogger.logSystemEvent('log_rotation_completed', {
        rotatedFiles: logFiles,
        archiveFile: archiveFileName,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Log rotation completed. ${logFiles.length} files archived to ${archiveFileName}`);
      
      return {
        success: true,
        rotatedFiles: logFiles,
        archiveFile: archiveFileName
      };
    } catch (error) {
      console.error('Log rotation failed:', error);
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
   */
  async forceRotation() {
    console.log('Manual log rotation triggered');
    return this.rotateLogs(this.logFiles);
  }
}

// Create a singleton instance
const logRotationManager = new LogRotationManager();

module.exports = logRotationManager;