// backend/lib/eventLogger.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { redactSensitiveData } = require('../utils/sanitize');

class EventLogger {
  constructor() {
    this.loggers = new Map();
    this.serverInstanceId = crypto.randomBytes(8).toString('hex');
    this.sensitiveFields = ['secrets', 'password', 'token', 'key', 'jwt_token'];
    
    // Add rotation lock flags to prevent race conditions
    this.rotationLocks = {
      security: false,
      data: false,
      system: false,
      audit: false
    };
    
    // Add a queue for pending log operations during rotation
    this.pendingLogs = {
      security: [],
      data: [],
      system: [],
      audit: []
    };
  }

  async initializeLogger(logType, filePath) {
    try {
      // Ensure the directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Initialize or verify the log file
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
      }

      this.loggers.set(logType, filePath);
    } catch (error) {
      console.error(`Failed to initialize ${logType} logger:`, error);
      throw error;
    }
  }

  async logEvent(logType, event) {
    if (!this.loggers.has(logType)) {
      console.error(`Logger type ${logType} not initialized`);
      return null; // Return null instead of throwing to prevent app crash
    }
  
    // Create the enriched event first
    const safeEvent = redactSensitiveData(event, this.sensitiveFields);
    
    const enrichedEvent = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: new Date().toISOString(),
      serverInstanceId: this.serverInstanceId,
      ...safeEvent
    };
  
    // Check if the log file is currently locked for rotation
    if (this.rotationLocks[logType]) {
      // If locked, add to pending queue instead of writing directly
      console.log(`Log file ${logType} is locked for rotation, queuing event`);
      this.pendingLogs[logType].push(enrichedEvent);
      
      // If this is a critical event, also log to console
      if (event.severity === 'high' || event.type?.startsWith('security_')) {
        console.error('\x1b[31m%s\x1b[0m', `CRITICAL EVENT (QUEUED): ${JSON.stringify(enrichedEvent)}`);
      }
      
      return enrichedEvent;
    }
  
    try {
      const filePath = this.loggers.get(logType);
      let logs = [];
      
      // Try to read and parse the log file with proper error handling
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        
        try {
          logs = JSON.parse(fileContent);
        } catch (parseError) {
          console.error(`Error parsing log file ${logType}: ${parseError.message}`);
          // Create a new log file if the current one is corrupted
          console.log(`Creating new log file for ${logType}`);
          logs = [];
          
          // Backup the corrupted file for inspection
          const backupPath = `${filePath}.corrupted.${Date.now()}`;
          await fs.writeFile(backupPath, fileContent);
          console.log(`Corrupted log file backed up to ${backupPath}`);
        }
      } catch (readError) {
        console.error(`Error reading log file ${logType}: ${readError.message}`);
        // If file doesn't exist or can't be read, start with empty logs
        logs = [];
      }
  
      logs.push(enrichedEvent);
  
      // Keep only last 10000 logs per file
      const trimmedLogs = logs.slice(-10000);
  
      await fs.writeFile(filePath, JSON.stringify(trimmedLogs, null, 2));
  
      // If this is a critical event, also log to console
      if (event.severity === 'high' || event.type?.startsWith('security_')) {
        console.error('\x1b[31m%s\x1b[0m', `CRITICAL EVENT: ${JSON.stringify(enrichedEvent)}`);
      }
  
      return enrichedEvent;
    } catch (error) {
      console.error(`Failed to log ${logType} event:`, error);
      return null; // Return null instead of throwing to prevent app crashes
    }
  }

  // New method: Set rotation lock for a log type
  async setRotationLock(logType, locked) {
    if (!this.loggers.has(logType)) {
      console.error(`Cannot set rotation lock: Logger type ${logType} not initialized`);
      return false;
    }
    
    console.log(`Setting rotation lock for ${logType} to ${locked}`);
    this.rotationLocks[logType] = locked;
    
    // If we're unlocking, process any pending logs
    if (!locked && this.pendingLogs[logType].length > 0) {
      await this.processPendingLogs(logType);
    }
    
    return true;
  }
  
  // New method: Process pending logs after rotation completes
  async processPendingLogs(logType) {
    if (!this.pendingLogs[logType] || this.pendingLogs[logType].length === 0) {
      return;
    }
    
    console.log(`Processing ${this.pendingLogs[logType].length} pending logs for ${logType}`);
    
    try {
      const filePath = this.loggers.get(logType);
      let logs = [];
      
      // Read the freshly rotated log file (should be an empty array)
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        logs = JSON.parse(fileContent);
        
        if (!Array.isArray(logs)) {
          console.warn(`Expected array in ${logType} log file after rotation, got ${typeof logs}. Resetting.`);
          logs = [];
        }
      } catch (error) {
        console.error(`Error reading log file ${logType} after rotation: ${error.message}`);
        logs = [];
      }
      
      // Add all pending logs
      logs = [...logs, ...this.pendingLogs[logType]];
      
      // Keep only last 10000 logs per file
      const trimmedLogs = logs.slice(-10000);
      
      // Write the combined logs back to the file
      await fs.writeFile(filePath, JSON.stringify(trimmedLogs, null, 2));
      
      console.log(`Successfully processed ${this.pendingLogs[logType].length} pending logs for ${logType}`);
      
      // Clear the pending logs
      this.pendingLogs[logType] = [];
    } catch (error) {
      console.error(`Failed to process pending logs for ${logType}:`, error);
    }
  }

  // Security Events
  async logSecurityEvent(type, username, metadata = {}) {
    return this.logEvent('security', {
      type: `security_${type}`,
      severity: 'high',
      username,
      metadata: redactSensitiveData({
        ...metadata,
        timestamp: new Date().toISOString()
      }, this.sensitiveFields)
    });
  }

  // Data Operation Events
  async logDataEvent(type, username, details) {
    return this.logEvent('data', {
      type: `data_${type}`,
      severity: 'medium',
      username,
      details: redactSensitiveData(details, this.sensitiveFields),
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }

  // System Events
  async logSystemEvent(type, details, severity = 'info') {
    return this.logEvent('system', {
      type: `system_${type}`,
      severity,
      details: redactSensitiveData(details, this.sensitiveFields),
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }

  // Audit Events
  async logAuditEvent(type, username, details) {
    return this.logEvent('audit', {
      type: `audit_${type}`,
      severity: 'medium',
      username,
      details: redactSensitiveData(details, this.sensitiveFields),
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }

  // Helper methods for specific events
  async logLogin(username, success, metadata = {}) {
    return this.logSecurityEvent('login_attempt', username, {
      success,
      ...metadata
    });
  }

  async logPasswordChange(username, metadata = {}) {
    return this.logSecurityEvent('password_change', username, metadata);
  }

  async logRowLock(username, rowId, metadata = {}) {
    return this.logDataEvent('row_lock', username, {
      rowId,
      action: 'lock',
      ...metadata
    });
  }

  async logRowUnlock(username, rowId, metadata = {}) {
    return this.logDataEvent('row_unlock', username, {
      rowId,
      action: 'unlock',
      ...metadata
    });
  }

  async logRowUpdate(username, rowId, changes, metadata = {}) {
    // Make sure to redact any secrets from the changes object
    const safeChanges = redactSensitiveData(changes, this.sensitiveFields);
    
    return this.logDataEvent('row_update', username, {
      rowId,
      changes: safeChanges,
      ...metadata
    });
  }

  async logServerStart() {
    return this.logSystemEvent('server_start', {
      serverInstanceId: this.serverInstanceId,
      nodeEnv: process.env.NODE_ENV
    });
  }

  async logDatabaseConnection(success, details = {}) {
    return this.logSystemEvent('database_connection', {
      success,
      ...details
    }, success ? 'info' : 'high');
  }

  // Get logs with filtering
  async getLogs(logType, options = {}) {
    if (!this.loggers.has(logType)) {
      console.error(`Logger type ${logType} not initialized`);
      return []; // Return empty array instead of throwing
    }
    
    // Check if the log file is currently locked for rotation
    if (this.rotationLocks[logType]) {
      console.warn(`Attempted to read logs during rotation, returning empty result for ${logType}`);
      return [];
    }
  
    try {
      const filePath = this.loggers.get(logType);
      let logs = [];
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        
        try {
          logs = JSON.parse(fileContent);
        } catch (parseError) {
          console.error(`Error parsing ${logType} logs: ${parseError.message}`);
          // Backup the corrupted file
          const backupPath = `${filePath}.corrupted.${Date.now()}`;
          await fs.writeFile(backupPath, fileContent);
          console.log(`Corrupted log file backed up to ${backupPath}`);
          
          // Return empty array if file is corrupted
          return [];
        }
      } catch (readError) {
        console.error(`Error reading ${logType} log file:`, readError);
        return [];
      }
  
      let filteredLogs = [...logs];
  
      // Apply filters
      if (options.startDate) {
        filteredLogs = filteredLogs.filter(log => {
          try {
            return new Date(log.timestamp) >= new Date(options.startDate);
          } catch (e) {
            return false;
          }
        });
      }
  
      if (options.endDate) {
        filteredLogs = filteredLogs.filter(log => {
          try {
            return new Date(log.timestamp) <= new Date(options.endDate);
          } catch (e) {
            return false;
          }
        });
      }
  
      if (options.username) {
        filteredLogs = filteredLogs.filter(log => 
          log.username === options.username
        );
      }
  
      if (options.severity) {
        filteredLogs = filteredLogs.filter(log => 
          log.severity === options.severity
        );
      }
  
      if (options.type) {
        filteredLogs = filteredLogs.filter(log => 
          log.type && log.type.includes(options.type)
        );
      }
  
      // Apply pagination
      if (options.limit) {
        const start = options.offset || 0;
        filteredLogs = filteredLogs.slice(start, start + options.limit);
      }
  
      return filteredLogs;
    } catch (error) {
      console.error(`Failed to retrieve ${logType} logs:`, error);
      return []; // Return empty array instead of throwing
    }
  }
}

// Create singleton instance
const eventLogger = new EventLogger();

// Initialize all loggers
Promise.all([
  eventLogger.initializeLogger('security', path.join(__dirname, '../data/security_logs.json')),
  eventLogger.initializeLogger('data', path.join(__dirname, '../data/data_logs.json')),
  eventLogger.initializeLogger('system', path.join(__dirname, '../data/system_logs.json')),
  eventLogger.initializeLogger('audit', path.join(__dirname, '../data/audit_logs.json'))
]).catch(error => {
  console.error('Failed to initialize loggers:', error);
  process.exit(1);
});

module.exports = eventLogger;