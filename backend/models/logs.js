// models/logs.js - Complete file with fix for empty secrets field
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
      // FIXED: Check for empty string and convert to null
      // Only encrypt if the field has actual content
      if (processed[field] !== undefined && processed[field] !== null && processed[field] !== '') {
        processed[field] = JSON.stringify(fieldEncryption.encrypt(processed[field]));
      } else if (processed[field] === '') {
        // Convert empty string to null for database storage
        processed[field] = null;
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
          console.error(`Error decrypting ${field}:`, error);
          // FIXED: Return null instead of leaving corrupted data
          processed[field] = null;
        }
      }
      // FIXED: Ensure null values remain null (not undefined)
      else if (processed[field] === null) {
        processed[field] = null;
      }
    });
    
    return processed;
  },

  async getAllLogs() {
    try {
      const result = await db.query(`
        SELECT * FROM logs 
        ORDER BY timestamp DESC, id DESC
      `);
      
      // Process each record to decrypt encrypted fields
      return result.rows.map(row => this._processFromStorage(row));
    } catch (error) {
      console.error('Error fetching logs:', error);
      throw error;
    }
  },

  async getLogById(id) {
    try {
      const result = await db.query('SELECT * FROM logs WHERE id = $1', [id]);
      return result.rows.length > 0 ? this._processFromStorage(result.rows[0]) : null;
    } catch (error) {
      console.error('Error fetching log by id:', error);
      throw error;
    }
  },

  async checkForDuplicate(logData) {
    try {
      // Build a query to check for existing logs with the same key fields
      const checkFields = [];
      const checkValues = [];
      let valueIndex = 1;

      // Only check non-null fields for duplicates
      const fieldsToCheck = ['internal_ip', 'external_ip', 'hostname', 'domain', 'username', 'command'];
      
      fieldsToCheck.forEach(field => {
        if (logData[field]) {
          checkFields.push(`${field} = $${valueIndex}`);
          checkValues.push(logData[field]);
          valueIndex++;
        }
      });

      // If we have no fields to check, it's not a duplicate
      if (checkFields.length === 0) {
        return null;
      }

      // Check for logs created in the last 5 seconds with the same data
      const query = `
        SELECT * FROM logs 
        WHERE ${checkFields.join(' AND ')}
        AND timestamp > NOW() - INTERVAL '5 seconds'
        ORDER BY timestamp DESC
        LIMIT 1
      `;

      const result = await db.query(query, checkValues);
      return result.rows.length > 0 ? this._processFromStorage(result.rows[0]) : null;
    } catch (error) {
      console.error('Error checking for duplicate logs:', error);
      // In case of error, return null (will create a new log)
      return null;
    }
  },
  
  async createLog(logData) {
    try {
      // Process data for storage (encrypt sensitive fields)
      const processedData = this._processForStorage(logData);
      
      // Parse the provided timestamp or use current UTC time
      const timestamp = logData.timestamp ? new Date(logData.timestamp) : new Date();
      
      const result = await db.query(
        `INSERT INTO logs (
          timestamp, internal_ip, external_ip, mac_address, hostname,
          domain, username, command, notes, filename,
          status, secrets, analyst, hash_algorithm, hash_value, pid
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          timestamp,
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
        'secrets', 'locked', 'locked_by', 'hash_algorithm', 'hash_value', 'pid',
        'timestamp' // Allow timestamp updates
      ];

      // Process updates for storage (encrypt sensitive fields)
      const processedUpdates = this._processForStorage(updates);

      // Filter out any fields that aren't in allowedUpdates
      const filteredUpdates = Object.keys(processedUpdates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          // FIXED: Consistent handling of empty strings
          // Convert empty strings to null for all fields except those that should preserve empty strings
          if (processedUpdates[key] === '') {
            // For most fields, convert empty string to null
            obj[key] = null;
          } else {
            obj[key] = processedUpdates[key];
          }
          return obj;
        }, {});

      // Build the update query dynamically
      const updateFields = Object.keys(filteredUpdates);
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      const setClause = updateFields
        .map((field, index) => `${field} = $${index + 2}`)
        .join(', ');

      const values = [id, ...updateFields.map(field => filteredUpdates[field])];

      const query = `
        UPDATE logs 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Log not found');
      }

      // Process the returned record to decrypt fields
      return this._processFromStorage(result.rows[0]);
    } catch (error) {
      console.error('Error updating log:', error);
      throw error;
    }
  },

  async deleteLog(id) {
    try {
      const result = await db.query('DELETE FROM logs WHERE id = $1 RETURNING *', [id]);
      return result.rows.length > 0 ? this._processFromStorage(result.rows[0]) : null;
    } catch (error) {
      console.error('Error deleting log:', error);
      throw error;
    }
  },

  async bulkCreate(logsArray) {
    try {
      const createdLogs = [];
      const errors = [];

      for (const logData of logsArray) {
        try {
          // Check for duplicate before creating
          const duplicate = await this.checkForDuplicate(logData);
          
          if (duplicate) {
            console.log('Skipping duplicate log entry');
            createdLogs.push(duplicate);
          } else {
            const created = await this.createLog(logData);
            createdLogs.push(created);
          }
        } catch (error) {
          console.error('Error creating individual log:', error);
          errors.push({ data: logData, error: error.message });
        }
      }

      return { createdLogs, errors };
    } catch (error) {
      console.error('Error in bulk create:', error);
      throw error;
    }
  },

  async searchLogs(searchParams) {
    try {
      let query = 'SELECT * FROM logs WHERE 1=1';
      const values = [];
      let valueIndex = 1;

      // Add search conditions based on provided parameters
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'command' || key === 'notes') {
            query += ` AND ${key} ILIKE $${valueIndex}`;
            values.push(`%${value}%`);
          } else {
            query += ` AND ${key} = $${valueIndex}`;
            values.push(value);
          }
          valueIndex++;
        }
      });

      query += ' ORDER BY timestamp DESC, id DESC';

      const result = await db.query(query, values);
      
      // Process each record to decrypt encrypted fields
      return result.rows.map(row => this._processFromStorage(row));
    } catch (error) {
      console.error('Error searching logs:', error);
      throw error;
    }
  },

  async getStatistics() {
    try {
      const stats = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT internal_ip) as unique_internal_ips,
          COUNT(DISTINCT external_ip) as unique_external_ips,
          COUNT(DISTINCT hostname) as unique_hostnames,
          COUNT(DISTINCT username) as unique_usernames,
          COUNT(CASE WHEN locked = true THEN 1 END) as locked_count
        FROM logs
      `);

      return stats.rows[0];
    } catch (error) {
      console.error('Error getting statistics:', error);
      throw error;
    }
  },

  async getLockStatus(id) {
    try {
      const result = await db.query(
        'SELECT locked, locked_by FROM logs WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        locked: result.rows[0].locked || false,
        locked_by: result.rows[0].locked_by || null
      };
    } catch (error) {
      console.error('Error getting lock status:', error);
      throw error;
    }
  }
};

module.exports = LogsModel;