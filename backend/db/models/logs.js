// models/logs.js
const db = require('../db');

const LogsModel = {
  async getAllLogs() {
    try {
      const result = await db.query(
        'SELECT * FROM logs ORDER BY timestamp DESC'
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting logs:', error);
      throw error;
    }
  },

  async createLog(logData) {
    try {
      const result = await db.query(
        `INSERT INTO logs (
          timestamp, internal_ip, external_ip, hostname,
          domain, username, command, notes, filename,
          status, analyst
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          new Date(),
          logData.internal_ip,
          logData.external_ip,
          logData.hostname,
          logData.domain,
          logData.username,
          logData.command,
          logData.notes,
          logData.filename,
          logData.status,
          logData.analyst
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating log:', error);
      throw error;
    }
  },

  async updateLog(id, updates) {
    try {
      console.debug('Updating log:', {
        id,
        updates
      });

      const allowedUpdates = [
        'internal_ip', 'external_ip', 'hostname', 'domain',
        'username', 'command', 'notes', 'filename', 'status',
        'locked', 'locked_by'
      ];

      // Filter out any fields that aren't in allowedUpdates
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          // Handle empty strings - convert to null for database
          obj[key] = updates[key] === '' ? null : updates[key];
          return obj;
        }, {});

      console.debug('Filtered updates:', filteredUpdates);

      // If there are no valid updates, return null
      if (Object.keys(filteredUpdates).length === 0) {
        console.debug('No valid updates found');
        return null;
      }

      // Build the SET clause dynamically
      const setClause = Object.keys(filteredUpdates)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');

      const values = [...Object.values(filteredUpdates), id];

      const query = `
        UPDATE logs 
        SET ${setClause}
        WHERE id = $${values.length}
        RETURNING *`;

      console.debug('Update query:', {
        query,
        values
      });

      const result = await db.query(query, values);
      console.debug('Update result:', result.rows[0]);

      return result.rows[0];
    } catch (error) {
      console.error('Error updating log:', error);
      throw error;
    }
  },

  async deleteLog(id) {
    try {
      const result = await db.query(
        'DELETE FROM logs WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
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
  }
};

module.exports = LogsModel;