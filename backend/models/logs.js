// models/logs.js
const db = require('../db');
const { redactSensitiveData } = require('../utils/sanitize');

// List of fields that should be protected in logs and responses
const SENSITIVE_FIELDS = ['secrets'];

const LogsModel = {
  async getAllLogs(includeSecrets = true) {
    try {
      // Always include all fields - we'll only redact for logging purposes
      const result = await db.query(
        `SELECT * FROM logs 
         ORDER BY timestamp DESC, id DESC`  // Added id as secondary sort
      );
      
      // Return the logs with actual secrets intact
      return result.rows;
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
      
      // Return the log with actual secrets intact
      return result.rows[0];
    } catch (error) {
      console.error('Error getting log by ID:', error);
      throw error;
    }
  },

  async createLog(logData) {
    try {
      const result = await db.query(
        `INSERT INTO logs (
          timestamp, internal_ip, external_ip, mac_address, hostname,
          domain, username, command, notes, filename,
          status, secrets, analyst, hash_algorithm, hash_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          new Date(),
          logData.internal_ip,
          logData.external_ip,
          logData.mac_address,
          logData.hostname,
          logData.domain,
          logData.username,
          logData.command,
          logData.notes,
          logData.filename,
          logData.status,
          logData.secrets,
          logData.analyst,
          logData.hash_algorithm,
          logData.hash_value
        ]
      );
      
      // Return the actual log with secrets intact for the UI
      return result.rows[0];
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
        'secrets', 'locked', 'locked_by', 'hash_algorithm', 'hash_value'
      ];

      // Filter out any fields that aren't in allowedUpdates
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          // Handle empty strings - convert to null for database
          obj[key] = updates[key] === '' ? null : updates[key];
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

      // Return the updated log with actual secrets intact for the UI
      return result.rows[0];
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
      
      // For return to UI, keep the original data
      const deletedLog = getResult.rows[0];
      
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
    return redactSensitiveData(log, SENSITIVE_FIELDS);
  }
};

module.exports = LogsModel;