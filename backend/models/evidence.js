// File path: backend/models/evidence.js

const db = require('../db');
const { redactSensitiveData } = require('../utils/sanitize');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class EvidenceModel {
  /**
   * Create a new evidence file record
   */
  static async createEvidenceFile(fileData) {
    try {
      const result = await db.query(
        `INSERT INTO evidence_files (
          log_id, filename, original_filename, file_type, file_size,
          uploaded_by, description, md5_hash, filepath, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          fileData.log_id,
          fileData.filename,
          fileData.original_filename,
          fileData.file_type,
          fileData.file_size,
          fileData.uploaded_by,
          fileData.description,
          fileData.md5_hash,
          fileData.filepath,
          fileData.metadata || {}
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error creating evidence file record:', error);
      throw error;
    }
  }

  /**
   * Get all evidence files for a specific log
   */
  static async getEvidenceFilesByLogId(logId) {
    try {
      const result = await db.query(
        `SELECT * FROM evidence_files 
         WHERE log_id = $1
         ORDER BY upload_date DESC`,
        [logId]
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting evidence files for log:', error);
      throw error;
    }
  }

  /**
   * Get a specific evidence file by ID
   */
  static async getEvidenceFileById(fileId) {
    try {
      const result = await db.query(
        `SELECT * FROM evidence_files 
         WHERE id = $1`,
        [fileId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting evidence file by ID:', error);
      throw error;
    }
  }

  /**
   * Update evidence file metadata
   */
  static async updateEvidenceFile(fileId, updates) {
    try {
      const allowedUpdates = ['description', 'metadata'];

      // Filter out any fields that aren't in allowedUpdates
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key];
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

      const values = [...Object.values(filteredUpdates), fileId];

      const result = await db.query(
        `UPDATE evidence_files 
         SET ${setClause}
         WHERE id = $${values.length}
         RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error updating evidence file:', error);
      throw error;
    }
  }

  /**
   * Delete an evidence file
   */
  static async deleteEvidenceFile(fileId) {
    try {
      // First get the file data so we can delete the actual file
      const fileData = await this.getEvidenceFileById(fileId);
      
      if (!fileData) {
        return null;
      }
      
      // Delete the database record
      const result = await db.query(
        'DELETE FROM evidence_files WHERE id = $1 RETURNING *',
        [fileId]
      );
      
      // Return the deleted file data
      return fileData;
    } catch (error) {
      console.error('Error deleting evidence file:', error);
      throw error;
    }
  }
  
  /**
   * Calculate MD5 hash of a file
   */
  static async calculateMD5(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hashSum = crypto.createHash('md5');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      console.error('Error calculating file hash:', error);
      throw error;
    }
  }
}

module.exports = EvidenceModel;