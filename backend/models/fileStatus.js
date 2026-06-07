// backend/models/fileStatus.js
const db = require('../db');

const FILE_STATUS_CACHE_TTL = 10000;
let fileStatusCache = { data: null, timestamp: 0, statistics: null, statsTimestamp: 0 };

const redactSensitiveData = (data, fieldsToRedact = ['secrets']) => {
  if (typeof data !== 'object' || data === null) return data;
  if (Array.isArray(data)) return data.map(item => redactSensitiveData(item, fieldsToRedact));
  return Object.keys(data).reduce((redacted, key) => {
    if (fieldsToRedact.includes(key)) redacted[key] = data[key] ? '[REDACTED]' : null;
    else if (typeof data[key] === 'object' && data[key] !== null) redacted[key] = redactSensitiveData(data[key], fieldsToRedact);
    else redacted[key] = data[key];
    return redacted;
  }, {});
};

class FileStatusModel {
  static clearCache() {
    fileStatusCache.data = null;
    fileStatusCache.timestamp = 0;
    fileStatusCache.statistics = null;
    fileStatusCache.statsTimestamp = 0;
    console.log('FileStatusModel cache cleared');
  }

  static async getFilesByName(filename, operationTagId = null, isAdmin = false) {
    try {
      let query = `SELECT * FROM file_status WHERE filename = $1`;
      const params = [filename];
      if (operationTagId) { query += ` AND operation_tags @> ARRAY[$2]::INTEGER[]`; params.push(operationTagId); }
      query += ` ORDER BY last_seen DESC`;
      const statusResult = await db.query(query, params);
      if (statusResult.rows.length === 0) return [];

      const fileResults = [];
      for (const fileStatus of statusResult.rows) {
        let historyQuery = `
          SELECT id, filename, status, previous_status, hostname, internal_ip, external_ip, username, analyst, notes, command,
            CASE WHEN secrets IS NOT NULL THEN '[REDACTED]' ELSE NULL END as secrets, hash_algorithm, hash_value, timestamp
          FROM file_status_history
          WHERE filename = $1 AND (hostname = $2 OR (hostname IS NULL AND $2 IS NULL))
            AND (internal_ip = $3 OR (internal_ip IS NULL AND $3 IS NULL))`;
        const historyParams = [filename, fileStatus.hostname, fileStatus.internal_ip];
        if (operationTagId) { historyQuery += ` AND operation_tags @> ARRAY[$4]::INTEGER[]`; historyParams.push(operationTagId); }
        historyQuery += ` ORDER BY timestamp DESC`;
        const historyResult = await db.query(historyQuery, historyParams);
        fileResults.push({ ...fileStatus, history: historyResult.rows });
      }
      return fileResults;
    } catch (error) {
      console.error('Error getting files by name:', error);
      throw error;
    }
  }

  static async getFileByName(filename, hostname = null, internal_ip = null, operationTagId = null, isAdmin = false) {
    try {
      let query, params;
      if (hostname || internal_ip) {
        query = `SELECT * FROM file_status WHERE filename = $1 AND (hostname = $2 OR (hostname IS NULL AND $2 IS NULL)) AND (internal_ip = $3 OR (internal_ip IS NULL AND $3 IS NULL))`;
        params = [filename, hostname, internal_ip];
        if (operationTagId) { query += ` AND operation_tags @> ARRAY[$4]::INTEGER[]`; params.push(operationTagId); }
      } else {
        query = `SELECT * FROM file_status WHERE filename = $1`;
        params = [filename];
        if (operationTagId) { query += ` AND operation_tags @> ARRAY[$2]::INTEGER[]`; params.push(operationTagId); }
        query += ` ORDER BY last_seen DESC LIMIT 1`;
      }

      const statusResult = await db.query(query, params);
      if (statusResult.rows.length === 0) return null;

      const fileStatus = statusResult.rows[0];
      let historyQuery = `
        SELECT id, filename, status, previous_status, hostname, internal_ip, external_ip, username, analyst, notes, command,
          CASE WHEN secrets IS NOT NULL THEN '[REDACTED]' ELSE NULL END as secrets, hash_algorithm, hash_value, timestamp
        FROM file_status_history
        WHERE filename = $1 AND (hostname = $2 OR (hostname IS NULL AND $2 IS NULL))
          AND (internal_ip = $3 OR (internal_ip IS NULL AND $3 IS NULL))`;
      const historyParams = [filename, fileStatus.hostname, fileStatus.internal_ip];
      if (operationTagId) { historyQuery += ` AND operation_tags @> ARRAY[$4]::INTEGER[]`; historyParams.push(operationTagId); }
      historyQuery += ` ORDER BY timestamp DESC`;
      const historyResult = await db.query(historyQuery, historyParams);
      return { ...fileStatus, history: historyResult.rows };
    } catch (error) {
      console.error('Error getting file by name:', error);
      throw error;
    }
  }

  static async upsertFileStatus(fileData) {
    try {
      this.clearCache();
      const existingResult = await db.query(`SELECT id FROM file_status WHERE filename = $1 AND (hostname IS NOT DISTINCT FROM $2) AND (internal_ip IS NOT DISTINCT FROM $3)`,
        [fileData.filename, fileData.hostname, fileData.internal_ip]);

      if (existingResult.rows.length > 0) {
        const result = await db.query(`
          UPDATE file_status SET status = $1, hostname = COALESCE($2, file_status.hostname), internal_ip = COALESCE($3, file_status.internal_ip),
            external_ip = COALESCE($4, file_status.external_ip), username = COALESCE($5, file_status.username), analyst = $6, last_seen = $7,
            metadata = COALESCE(file_status.metadata, '{}'::jsonb) || $8, hash_algorithm = COALESCE($9, file_status.hash_algorithm),
            hash_value = COALESCE($10, file_status.hash_value),
            operation_tags = ARRAY(SELECT DISTINCT unnest(file_status.operation_tags || COALESCE($11::INTEGER[], '{}'))),
            source_log_ids = ARRAY(SELECT DISTINCT unnest(file_status.source_log_ids || COALESCE($12::INTEGER[], '{}')))
          WHERE id = $13 RETURNING *`,
          [fileData.status || 'UNKNOWN', fileData.hostname, fileData.internal_ip, fileData.external_ip, fileData.username, fileData.analyst,
           fileData.timestamp || new Date(), fileData.metadata || {}, fileData.hash_algorithm, fileData.hash_value,
           fileData.operation_tags || null, fileData.source_log_ids || null, existingResult.rows[0].id]
        );
        return result.rows[0];
      } else {
        const result = await db.query(`
          INSERT INTO file_status (filename, status, hostname, internal_ip, external_ip, username, analyst, first_seen, last_seen, metadata, hash_algorithm, hash_value, operation_tags, source_log_ids)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
          [fileData.filename, fileData.status || 'UNKNOWN', fileData.hostname, fileData.internal_ip, fileData.external_ip, fileData.username,
           fileData.analyst, fileData.timestamp || new Date(), fileData.timestamp || new Date(), fileData.metadata || {},
           fileData.hash_algorithm, fileData.hash_value, fileData.operation_tags || [], fileData.source_log_ids || []]
        );
        return result.rows[0];
      }
    } catch (error) {
      console.error('Error upserting file status:', error);
      throw error;
    }
  }

  static async addStatusHistory(historyData) {
    try {
      const safeHistoryData = { ...historyData };
      if (safeHistoryData.secrets) safeHistoryData.secrets = '[REDACTED]';

      const result = await db.query(`
        INSERT INTO file_status_history (filename, status, previous_status, hostname, internal_ip, external_ip, username, analyst, notes, command, secrets, hash_algorithm, hash_value, timestamp, operation_tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
        [safeHistoryData.filename, safeHistoryData.status || 'UNKNOWN', safeHistoryData.previous_status, safeHistoryData.hostname,
         safeHistoryData.internal_ip, safeHistoryData.external_ip, safeHistoryData.username, safeHistoryData.analyst,
         safeHistoryData.notes, safeHistoryData.command, safeHistoryData.secrets, safeHistoryData.hash_algorithm,
         safeHistoryData.hash_value, safeHistoryData.timestamp || new Date(), safeHistoryData.operation_tags || []]
      );
      return { ...result.rows[0], secrets: result.rows[0].secrets ? '[REDACTED]' : null };
    } catch (error) {
      console.error('Error adding file status history:', error);
      throw error;
    }
  }

  static async getAllFileStatuses(operationTagId = null, isAdmin = false) {
    try {
      const cacheKey = `all_${operationTagId || 'all'}_${isAdmin}`;
      const now = Date.now();
      if (fileStatusCache[cacheKey] && (now - fileStatusCache.timestamp) < FILE_STATUS_CACHE_TTL) return fileStatusCache[cacheKey];

      let query = `SELECT fs.*, COUNT(fsh.id) as history_count FROM file_status fs LEFT JOIN file_status_history fsh ON fs.filename = fsh.filename WHERE 1=1`;
      const params = [];
      if (operationTagId) { query += ` AND (fs.operation_tags @> ARRAY[$1]::INTEGER[] OR fs.operation_tags = '{}')`; params.push(operationTagId); }
      query += ` GROUP BY fs.id ORDER BY fs.last_seen DESC`;

      const result = await db.query(query, params);
      fileStatusCache[cacheKey] = result.rows;
      fileStatusCache.timestamp = now;
      return result.rows;
    } catch (error) {
      console.error('Error getting all file statuses:', error);
      throw error;
    }
  }

  static async getFileStatusesByStatus(status, operationTagId = null, isAdmin = false) {
    try {
      let query = `SELECT fs.*, COUNT(fsh.id) as history_count FROM file_status fs LEFT JOIN file_status_history fsh ON fs.filename = fsh.filename WHERE fs.status = $1`;
      const params = [status];
      if (operationTagId) { query += ` AND (fs.operation_tags @> ARRAY[$2]::INTEGER[] OR fs.operation_tags = '{}')`; params.push(operationTagId); }
      query += ` GROUP BY fs.id ORDER BY fs.last_seen DESC`;
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting file statuses by status:', error);
      throw error;
    }
  }

  static async getFileStatusStatistics() {
    try {
      const now = Date.now();
      if (fileStatusCache.statistics && (now - fileStatusCache.statsTimestamp) < FILE_STATUS_CACHE_TTL) return fileStatusCache.statistics;

      const [statusCount, hostnameCount, analystCount, totalCount] = await Promise.all([
        db.query(`SELECT status, COUNT(*) as count FROM file_status GROUP BY status ORDER BY count DESC`),
        db.query(`SELECT hostname, COUNT(*) as count FROM file_status WHERE hostname IS NOT NULL AND hostname != '' GROUP BY hostname ORDER BY count DESC LIMIT 10`),
        db.query(`SELECT analyst, COUNT(*) as count FROM file_status GROUP BY analyst ORDER BY count DESC LIMIT 10`),
        db.query(`SELECT COUNT(*) as total FROM file_status`)
      ]);

      const statistics = {
        total: totalCount.rows[0].total,
        by_status: statusCount.rows,
        by_hostname: hostnameCount.rows,
        by_analyst: analystCount.rows
      };

      fileStatusCache.statistics = statistics;
      fileStatusCache.statsTimestamp = now;
      return statistics;
    } catch (error) {
      console.error('Error getting file status statistics:', error);
      throw error;
    }
  }

  static async updateFilename(oldFilename, newFilename) {
    try {
      if (!oldFilename || !newFilename || oldFilename === newFilename) return 0;
      this.clearCache();
      const client = await db.pool.connect();
      let totalUpdated = 0;
      try {
        await client.query('BEGIN');
        const currentRecords = await client.query(`SELECT id, hostname, internal_ip FROM file_status WHERE filename = $1`, [oldFilename]);
        for (const record of currentRecords.rows) {
          const existingRecord = await client.query(`SELECT id FROM file_status WHERE filename = $1 AND (hostname IS NOT DISTINCT FROM $2) AND (internal_ip IS NOT DISTINCT FROM $3)`, [newFilename, record.hostname, record.internal_ip]);
          if (existingRecord.rowCount > 0) {
            await client.query(`DELETE FROM file_status WHERE id = $1`, [record.id]);
          } else {
            await client.query(`UPDATE file_status SET filename = $1 WHERE id = $2 RETURNING id`, [newFilename, record.id]);
          }
          totalUpdated++;
        }
        const historyResult = await client.query(`UPDATE file_status_history SET filename = $1 WHERE filename = $2 RETURNING id`, [newFilename, oldFilename]);
        totalUpdated += historyResult.rowCount;
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return totalUpdated;
    } catch (error) {
      console.error('Error updating filename in file status:', error);
      throw error;
    }
  }

  static async batchAddStatusHistory(historyRecords) {
    if (!historyRecords || historyRecords.length === 0) return [];
    try {
      let valueParams = [], placeholders = [];
      historyRecords.forEach((record, index) => {
        const safeRecord = { ...record };
        if (safeRecord.secrets) safeRecord.secrets = '[REDACTED]';
        valueParams.push(safeRecord.filename, safeRecord.status || 'UNKNOWN', safeRecord.previous_status, safeRecord.hostname, safeRecord.internal_ip, safeRecord.external_ip, safeRecord.username, safeRecord.analyst, safeRecord.notes, safeRecord.command, safeRecord.secrets, safeRecord.hash_algorithm, safeRecord.hash_value, safeRecord.timestamp || new Date());
        const offset = index * 14;
        placeholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13}, $${offset+14})`);
      });
      const result = await db.query(`INSERT INTO file_status_history (filename, status, previous_status, hostname, internal_ip, external_ip, username, analyst, notes, command, secrets, hash_algorithm, hash_value, timestamp) VALUES ${placeholders.join(', ')} RETURNING id`, valueParams);
      return result.rowCount;
    } catch (error) {
      console.error('Error adding batch file status history:', error);
      throw error;
    }
  }
}

module.exports = FileStatusModel;
