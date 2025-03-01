// relation-service/src/services/fileStatusService.js
const FileStatusModel = require('../models/fileStatus');
const _ = require('lodash');

// Helper function to redact sensitive data
const redactSensitiveData = (data, fieldsToRedact = ['secrets']) => {
  if (typeof data !== 'object' || data === null) return data;
  
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, fieldsToRedact));
  }
  
  return Object.keys(data).reduce((redacted, key) => {
    // Check if current key should be redacted
    if (fieldsToRedact.includes(key)) {
      // If value exists, replace with redaction notice
      redacted[key] = data[key] ? '[REDACTED]' : null;
    } else if (typeof data[key] === 'object' && data[key] !== null) {
      // Recursively redact objects
      redacted[key] = redactSensitiveData(data[key], fieldsToRedact);
    } else {
      // Copy non-sensitive values as is
      redacted[key] = data[key];
    }
    return redacted;
  }, {});
};

class FileStatusService {
  /**
   * Process log entries for file status tracking
   * @param {Array} logs - Log entries from the main database
   */
  static async processLogEntries(logs) {
    try {
      console.log(`Processing ${logs.length} log entries for file status tracking`);
      let filesUpdated = 0;
  
      // Process logs sequentially to ensure they're all processed
      for (const log of logs) {
        if (!log.filename || log.filename.trim() === '') {
          continue;
        }
  
        try {
          // Get current file status if it exists
          const existingFile = await FileStatusModel.getFileByName(log.filename);
          const previousStatus = existingFile?.status || null;
      
          // Always update file status for logs with filenames
          // This ensures files are always showing in the UI
          await FileStatusModel.upsertFileStatus({
            filename: log.filename,
            status: log.status || 'UNKNOWN',  // Always provide a status
            hostname: log.hostname,
            internal_ip: log.internal_ip,
            external_ip: log.external_ip,
            username: log.username,
            analyst: log.analyst,
            timestamp: log.timestamp || new Date(),
            metadata: {
              domain: log.domain,
              command_type: this.categorizeCommand(log.command)
            }
          });
      
          // Add to history - ensure any secrets are properly redacted
          const safeHistory = {
            filename: log.filename,
            status: log.status || 'UNKNOWN',
            previous_status: previousStatus,
            hostname: log.hostname,
            internal_ip: log.internal_ip,
            external_ip: log.external_ip,
            username: log.username,
            analyst: log.analyst,
            notes: log.notes,
            command: log.command,
            // Handle the secrets field properly - redact it when storing
            secrets: log.secrets ? '[REDACTED]' : null,
            timestamp: log.timestamp || new Date()
          };
          
          await FileStatusModel.addStatusHistory(safeHistory);
      
          filesUpdated++;
        } catch (error) {
          console.error(`Error processing file status for ${log.filename}:`, error);
        }
      }
  
      // Clear the cache to ensure fresh data
      FileStatusModel.clearCache();
      
      console.log(`Updated status for ${filesUpdated} files`);
      return filesUpdated;
    } catch (error) {
      console.error('Error processing log entries for file status:', error);
      throw error;
    }
  }

  /**
   * Categorize a command to determine its purpose
   * @param {string} command - The command string to analyze
   * @returns {string} The command category
   */
  static categorizeCommand(command) {
    if (!command) return 'unknown';
    
    command = command.toLowerCase();
    
    if (command.includes('copy') || command.includes('cp ') || 
        command.includes('scp ') || command.includes('download')) {
      return 'file_transfer';
    }
    
    if (command.includes('rm ') || command.includes('del ') || 
        command.includes('remove') || command.includes('shred')) {
      return 'file_deletion';
    }
    
    if (command.includes('chmod') || command.includes('chown') || 
        command.includes('attrib ') || command.includes('cacls')) {
      return 'permission_change';
    }
    
    if (command.includes('execute') || command.includes('run ') || 
        command.includes('./') || command.includes('start ')) {
      return 'execution';
    }
    
    if (command.includes('openssl') || command.includes('encrypt') || 
        command.includes('gpg ') || command.includes('cipher')) {
      return 'encryption';
    }
    
    return 'other';
  }

  /**
   * Get all file statuses
   */
  static async getAllFileStatuses() {
    // Clear cache to ensure fresh data
    FileStatusModel.clearCache();
    return FileStatusModel.getAllFileStatuses();
  }

  /**
   * Get file statuses by status with optimized query
   */
  static async getFileStatusesByStatus(status) {
    return FileStatusModel.getFileStatusesByStatus(status);
  }

  /**
   * Get file details by name with optimized data loading
   */
  static async getFileByName(filename) {
    const fileData = await FileStatusModel.getFileByName(filename);
    
    if (!fileData) return null;
    
    // Ensure any secrets in history are redacted
    if (fileData.history && fileData.history.length > 0) {
      fileData.history = fileData.history.map(entry => ({
        ...entry,
        secrets: entry.secrets ? '[REDACTED]' : null
      }));
    }
    
    return fileData;
  }

  /**
   * Get file status statistics with caching optimization
   */
  static async getFileStatusStatistics() {
    return FileStatusModel.getFileStatusStatistics();
  }

  /**
   * Export file statuses for a particular file
   * This method ensures sensitive data like secrets are properly redacted
   */
  static async exportFileHistory(filename) {
    try {
      const fileData = await this.getFileByName(filename);
      
      if (!fileData) {
        throw new Error(`File ${filename} not found`);
      }
      
      // Ensure any secrets are redacted in the export
      const safeExport = {
        ...fileData,
        history: fileData.history.map(entry => redactSensitiveData(entry, ['secrets']))
      };
      
      return safeExport;
    } catch (error) {
      console.error(`Error exporting file history for ${filename}:`, error);
      throw error;
    }
  }
}

module.exports = FileStatusService;