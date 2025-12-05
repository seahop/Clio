// backend/models/logs.js
const db = require('../db');
const { redactSensitiveData } = require('../utils/sanitize');
const fieldEncryption = require('../utils/encryption');
const OperationsModel = require('./operations');

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
      // Check for empty string and convert to null
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
          // Return null instead of leaving corrupted data
          processed[field] = null;
        }
      }
      // Ensure null values remain null (not undefined)
      else if (processed[field] === null) {
        processed[field] = null;
      }
    });
    
    return processed;
  },

  async getAllLogs(username = null, isAdmin = false) {
    try {
      // Admins see everything unless they have an active operation filter
      if (isAdmin) {
        // Check if admin has chosen to filter by operation
        const activeOp = username ? await OperationsModel.getUserActiveOperation(username) : null;
        
        if (activeOp && activeOp.tag_id) {
          // Admin has chosen to filter by operation
          const result = await db.query(`
            SELECT DISTINCT l.* 
            FROM logs l
            JOIN log_tags lt ON l.id = lt.log_id
            WHERE lt.tag_id = $1
            ORDER BY l.timestamp DESC, l.id DESC
          `, [activeOp.tag_id]);
          
          return result.rows.map(row => this._processFromStorage(row));
        }
        
        // No filter - show all logs
        const result = await db.query(`
          SELECT * FROM logs 
          ORDER BY timestamp DESC, id DESC
        `);
        
        return result.rows.map(row => this._processFromStorage(row));
      }
      
      // Non-admin users - filter by their active operation
      if (!username) {
        throw new Error('Username required for non-admin users');
      }
      
      const activeOp = await OperationsModel.getUserActiveOperation(username);
      
      // If user has no operations, return empty array
      if (!activeOp || !activeOp.tag_id) {
        console.log(`User ${username} has no active operation`);
        return [];
      }
      
      // Filter logs by operation tag
      const result = await db.query(`
        SELECT DISTINCT l.* 
        FROM logs l
        JOIN log_tags lt ON l.id = lt.log_id
        WHERE lt.tag_id = $1
        ORDER BY l.timestamp DESC, l.id DESC
      `, [activeOp.tag_id]);
      
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
  
  async createLog(logData, username = null) {
    try {
      // Process data for storage (encrypt sensitive fields)
      const processedData = this._processForStorage(logData);
      
      // Set the analyst field if username is provided
      if (username) {
        processedData.analyst = username;
      }
      
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
      
      // Auto-tag with operation if username is provided
      if (username) {
        await OperationsModel.autoTagLogWithOperation(createdLog.id, username);
      }
      
      return createdLog;
    } catch (error) {
      console.error('Error creating log:', error);
      throw error;
    }
  },
  
  async updateLog(id, updates) {
    try {
      // Process updates for storage
      const processedUpdates = this._processForStorage(updates);
      
      // Build dynamic update query
      const fields = [];
      const values = [];
      let valueIndex = 1;
      
      Object.keys(processedUpdates).forEach(key => {
        if (processedUpdates[key] !== undefined && key !== 'id') {
          fields.push(`${key} = $${valueIndex}`);
          values.push(processedUpdates[key]);
          valueIndex++;
        }
      });
      
      if (fields.length === 0) {
        return null; // No valid updates
      }
      
      // Add updated_at timestamp
      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      
      // Add ID for WHERE clause
      values.push(id);
      
      const query = `
        UPDATE logs 
        SET ${fields.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *
      `;
      
      const result = await db.query(query, values);
      return result.rows.length > 0 ? this._processFromStorage(result.rows[0]) : null;
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
  
  async getLogsByOperation(operationId) {
    try {
      // Get the operation to find its tag
      const operation = await OperationsModel.getOperationById(operationId);
      
      if (!operation || !operation.tag_id) {
        return [];
      }
      
      const result = await db.query(`
        SELECT DISTINCT l.* 
        FROM logs l
        JOIN log_tags lt ON l.id = lt.log_id
        WHERE lt.tag_id = $1
        ORDER BY l.timestamp DESC, l.id DESC
      `, [operation.tag_id]);
      
      return result.rows.map(row => this._processFromStorage(row));
    } catch (error) {
      console.error('Error fetching logs by operation:', error);
      throw error;
    }
  },
  
  async searchLogs(searchParams, username = null, isAdmin = false) {
    try {
      let baseQuery = `
        SELECT DISTINCT l.* 
        FROM logs l
        LEFT JOIN log_tags lt ON l.id = lt.log_id
      `;
      
      const conditions = [];
      const values = [];
      let valueIndex = 1;
      
      // Add operation filter for non-admins or if admin has active operation
      if (!isAdmin || username) {
        const activeOp = username ? await OperationsModel.getUserActiveOperation(username) : null;
        
        if (activeOp && activeOp.tag_id) {
          conditions.push(`lt.tag_id = $${valueIndex++}`);
          values.push(activeOp.tag_id);
        } else if (!isAdmin) {
          // Non-admin with no operation sees nothing
          return [];
        }
      }
      
      // Add other search conditions
      if (searchParams.hostname) {
        conditions.push(`l.hostname ILIKE $${valueIndex++}`);
        values.push(`%${searchParams.hostname}%`);
      }
      
      if (searchParams.internal_ip) {
        conditions.push(`l.internal_ip = $${valueIndex++}`);
        values.push(searchParams.internal_ip);
      }
      
      if (searchParams.command) {
        conditions.push(`l.command ILIKE $${valueIndex++}`);
        values.push(`%${searchParams.command}%`);
      }
      
      if (searchParams.username) {
        conditions.push(`l.username ILIKE $${valueIndex++}`);
        values.push(`%${searchParams.username}%`);
      }
      
      if (searchParams.dateFrom) {
        conditions.push(`l.timestamp >= $${valueIndex++}`);
        values.push(searchParams.dateFrom);
      }
      
      if (searchParams.dateTo) {
        conditions.push(`l.timestamp <= $${valueIndex++}`);
        values.push(searchParams.dateTo);
      }
      
      // Build final query
      if (conditions.length > 0) {
        baseQuery += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      baseQuery += ` ORDER BY l.timestamp DESC, l.id DESC`;
      
      if (searchParams.limit) {
        baseQuery += ` LIMIT $${valueIndex++}`;
        values.push(searchParams.limit);
      }
      
      const result = await db.query(baseQuery, values);
      return result.rows.map(row => this._processFromStorage(row));
    } catch (error) {
      console.error('Error searching logs:', error);
      throw error;
    }
  },
  
  async getLockStatus(id) {
    try {
      const result = await db.query('SELECT locked, locked_by FROM logs WHERE id = $1', [id]);
      return result.rows[0] || { locked: false, locked_by: null };
    } catch (error) {
      console.error('Error checking lock status:', error);
      throw error;
    }
  },
  
  async toggleLock(id, username, lock) {
    try {
      const result = await db.query(
        'UPDATE logs SET locked = $1, locked_by = $2 WHERE id = $3 RETURNING locked, locked_by',
        [lock, lock ? username : null, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error toggling lock:', error);
      throw error;
    }
  },
  
  async bulkDelete(ids) {
    try {
      const result = await db.query(
        'DELETE FROM logs WHERE id = ANY($1) RETURNING id',
        [ids]
      );
      return result.rows.map(row => row.id);
    } catch (error) {
      console.error('Error bulk deleting logs:', error);
      throw error;
    }
  },

  /**
   * Find a duplicate log entry based on key fields
   * @param {Object} criteria - Fields to match (timestamp, command, hostname, username)
   * @returns {Promise<Object|null>} Existing log or null if not found
   */
  async findDuplicate(criteria) {
    try {
      const { timestamp, command, hostname, username } = criteria;

      // Build the query to find exact matches
      const result = await db.query(
        `SELECT id, timestamp FROM logs
         WHERE timestamp = $1
         AND command = $2
         AND hostname = $3
         AND username = $4
         LIMIT 1`,
        [timestamp, command, hostname, username]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error finding duplicate log:', error);
      return null; // Return null on error to allow log creation
    }
  },

  /**
   * Get a redacted version of a log record for logging
   * @param {Object} log - Log record
   * @returns {Object} Redacted log record
   */
  getRedactedLog(log) {
    return redactSensitiveData(log, ['secrets']);
  }
};

module.exports = LogsModel;