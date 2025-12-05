// relation-service/src/services/fileStatusService.js
const FileStatusModel = require('../models/fileStatus');
const db = require('../db');
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

    // Fetch operation tags for all logs upfront
    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    // Process logs sequentially to ensure they're all processed
    for (const log of logs) {
      if (!log.filename || log.filename.trim() === '') {
        continue;
      }

      try {
        // Get operation tags for this log
        const operationTags = operationTagsMap.get(log.id) || [];

        // Get current file status if it exists - use hostname and IP for specific lookup
        const existingFile = await FileStatusModel.getFileByName(
          log.filename,
          log.hostname,
          log.internal_ip
        );
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
          hash_algorithm: log.hash_algorithm,
          hash_value: log.hash_value,
          timestamp: log.timestamp || new Date(),
          metadata: {
            domain: log.domain,
            command_type: this.categorizeCommand(log.command)
          },
          operation_tags: operationTags,
          source_log_ids: log.id ? [log.id] : []
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
          hash_algorithm: log.hash_algorithm,
          hash_value: log.hash_value,
          timestamp: log.timestamp || new Date(),
          operation_tags: operationTags
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
  static async getAllFileStatuses(operationTagId = null, isAdmin = false) {
    // Clear cache to ensure fresh data
    FileStatusModel.clearCache();
    return FileStatusModel.getAllFileStatuses(operationTagId, isAdmin);
  }

  /**
   * Get file statuses by status with optimized query
   */
  static async getFileStatusesByStatus(status, operationTagId = null, isAdmin = false) {
    return FileStatusModel.getFileStatusesByStatus(status, operationTagId, isAdmin);
  }

  /**
   * Get file by name with host/IP specification
   */
  static async getFileByName(filename, hostname = null, internal_ip = null, operationTagId = null, isAdmin = false) {
    const fileData = await FileStatusModel.getFileByName(filename, hostname, internal_ip, operationTagId, isAdmin);

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
   * Get all files with a specific name (multiple hosts)
   */
  static async getFilesByName(filename, operationTagId = null, isAdmin = false) {
    const filesData = await FileStatusModel.getFilesByName(filename, operationTagId, isAdmin);

    if (!filesData || filesData.length === 0) return [];

    // Ensure any secrets in history are redacted for each file
    return filesData.map(fileData => {
      if (fileData.history && fileData.history.length > 0) {
        fileData.history = fileData.history.map(entry => ({
          ...entry,
          secrets: entry.secrets ? '[REDACTED]' : null
        }));
      }
      return fileData;
    });
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

  /**
   * Fetch operation tags for a set of log IDs
   * @param {Array} logIds - Array of log IDs
   * @returns {Promise<Map>} Map of logId -> operation tag IDs
   * @private
   */
  static async _fetchOperationTags(logIds) {
    if (logIds.length === 0) {
      return new Map();
    }

    try {
      const result = await db.query(`
        SELECT
          lt.log_id,
          ARRAY_AGG(DISTINCT lt.tag_id) as tag_ids
        FROM log_tags lt
        WHERE lt.log_id = ANY($1)
        GROUP BY lt.log_id
      `, [logIds]);

      const tagMap = new Map();
      result.rows.forEach(row => {
        tagMap.set(row.log_id, row.tag_ids || []);
      });

      return tagMap;
    } catch (error) {
      console.error('Error fetching operation tags:', error);
      return new Map();
    }
  }
}

module.exports = FileStatusService;