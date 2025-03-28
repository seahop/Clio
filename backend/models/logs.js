// models/logs.js - Update for PID field
const db = require('../db');
const { redactSensitiveData } = require('../utils/sanitize');
const fieldEncryption = require('../utils/encryption');

// List of fields that should be protected in logs and responses
const SENSITIVE_FIELDS = ['secrets'];

// Fields that should be encrypted in the database
const ENCRYPTED_FIELDS = ['secrets'];

const LogsModel = {
  /**
   * Process an object before saving to database - encrypts sensitive fields
   * @param {Object} data - The data object to process
   * @returns {Object} - The processed data with encrypted fields
   */
  _processForStorage(data) {
    const processed = { ...data };
    
    // Encrypt fields that need encryption
    ENCRYPTED_FIELDS.forEach(field => {
      if (processed[field] !== undefined && processed[field] !== null) {
        processed[field] = JSON.stringify(fieldEncryption.encrypt(processed[field]));
      }
    });
    
    return processed;
  },
  
  /**
   * Process a database record before returning to client - decrypts encrypted fields
   * @param {Object} record - The database record
   * @returns {Object} - The processed record with decrypted fields
   */
  _processFromStorage(record) {
    if (!record) return record;
    
    const processed = { ...record };
    
    // Decrypt fields that are encrypted
    ENCRYPTED_FIELDS.forEach(field => {
      if (processed[field]) {
        try {
          const encryptedData = JSON.parse(processed[field]);
          processed[field] = fieldEncryption.decrypt(encryptedData);
        } catch (error) {
          // If we can't parse as JSON, it might not be encrypted yet
          console.log(`Field ${field} does not appear to be encrypted`);
        }
      }
    });
    
    return processed;
  },
  
  /**
   * Process multiple records from storage
   * @param {Array} records - Array of database records
   * @returns {Array} - Processed records with decrypted fields
   */
  _processMultipleFromStorage(records) {
    return records.map(record => this._processFromStorage(record));
  },

  async getAllLogs(includeSecrets = true) {
    try {
      // Always include all fields - we'll only redact for logging purposes
      const result = await db.query(
        `SELECT * FROM logs 
         ORDER BY timestamp DESC, id DESC`  // Added id as secondary sort
      );
      
      // Process records to decrypt any encrypted fields
      const processedLogs = this._processMultipleFromStorage(result.rows);
      
      // Return the logs with actual secrets intact
      return processedLogs;
    } catch (error) {
      console.error('Error getting logs:', error);
      throw error;
    }
  },

  async getLogById(id) {
    try {
      const result = await db.query(
        `SELECT * FROM logs 
         WHERE id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Process record to decrypt any encrypted fields
      const processedLog = this._processFromStorage(result.rows[0]);
      
      // Return the log with actual secrets intact
      return processedLog;
    } catch (error) {
      console.error('Error getting log by ID:', error);
      throw error;
    }
  },

  async createLog(logData) {
    try {
      // Process data for storage (encrypt sensitive fields)
      const processedData = this._processForStorage(logData);
      
      const result = await db.query(
        `INSERT INTO logs (
          timestamp, internal_ip, external_ip, mac_address, hostname,
          domain, username, command, notes, filename,
          status, secrets, analyst, hash_algorithm, hash_value, pid
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          new Date(),
          processedData.internal_ip,
          processedData.external_ip,
          processedData.mac_address,
          processedData.hostname,
          processedData.domain,
          processedData.username,
          processedData.command,
          processedData.notes,
          processedData.filename,
          processedData.status,
          processedData.secrets,
          processedData.analyst,
          processedData.hash_algorithm,
          processedData.hash_value,
          processedData.pid
        ]
      );
      
      // Process the returned record to decrypt fields
      const createdLog = this._processFromStorage(result.rows[0]);
      
      // Return the actual log with secrets intact for the UI
      return createdLog;
    } catch (error) {
      console.error('Error creating log:', error);
      throw error;
    }
  },

  async updateLog(id, updates) {
    try {
      const allowedUpdates = [
        'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
        'username', 'command', 'notes', 'filename', 'status',
        'secrets', 'locked', 'locked_by', 'hash_algorithm', 'hash_value', 'pid'
      ];

      // Process updates for storage (encrypt sensitive fields)
      const processedUpdates = this._processForStorage(updates);

      // Filter out any fields that aren't in allowedUpdates
      const filteredUpdates = Object.keys(processedUpdates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          // Handle empty strings - convert to null for database
          obj[key] = processedUpdates[key] === '' ? null : processedUpdates[key];
          return obj;
        }, {});

      // If there are no valid updates, return null
      if (Object.keys(filteredUpdates).length === 0) {
        return null;
      }

      // Build the SET clause dynamically
      const setClause = Object.keys(filteredUpdates)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');

      const values = [...Object.values(filteredUpdates), id];

      const result = await db.query(
        `UPDATE logs 
         SET ${setClause}
         WHERE id = $${values.length}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return null;
      }

      // Process the returned record to decrypt fields
      const updatedLog = this._processFromStorage(result.rows[0]);
      
      // Return the updated log with actual secrets intact for the UI
      return updatedLog;
    } catch (error) {
      console.error('Error updating log:', error);
      throw error;
    }
  },

  async deleteLog(id) {
    try {
      // Get the log first so we have a copy of it
      const getResult = await db.query(
        'SELECT * FROM logs WHERE id = $1',
        [id]
      );
      
      if (getResult.rows.length === 0) {
        return null;
      }
      
      // Now perform the delete
      await db.query(
        'DELETE FROM logs WHERE id = $1',
        [id]
      );
      
      // Process record to decrypt any encrypted fields
      const deletedLog = this._processFromStorage(getResult.rows[0]);
      
      // Also create a redacted version for logging purposes
      const redactedLog = redactSensitiveData(deletedLog, SENSITIVE_FIELDS);
      
      // Log the redacted version (the caller should use this for logging)
      console.log('Deleted log (redacted):', redactedLog);
      
      // Return the actual log for the UI
      return deletedLog;
    } catch (error) {
      console.error('Error deleting log:', error);
      throw error;
    }
  },

  async getLockStatus(id) {
    try {
      const result = await db.query(
        'SELECT locked, locked_by FROM logs WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error getting lock status:', error);
      throw error;
    }
  },

  // Add a helper method to get a redacted version
  getRedactedLog(log) {
    // First make sure encrypted fields are decrypted
    const processedLog = typeof log === 'object' ? this._processFromStorage(log) : log;
    // Then redact sensitive data
    return redactSensitiveData(processedLog, SENSITIVE_FIELDS);
  }
};

module.exports = LogsModel;