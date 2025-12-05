// backend/models/api-key.js
const db = require('../db');
const crypto = require('crypto');
const { redactSensitiveData } = require('../utils/sanitize');

/**
 * Manages API keys in the database
 */
class ApiKeyModel {
  /**
   * Generate a new API key
   * @param {Object} data - API key data
   * @returns {Object} Created API key record
   */
  static async createApiKey(data) {
    try {
      // Generate a secure random key
      const keyPrefix = 'rtl_';
      const keySecret = crypto.randomBytes(32).toString('hex');
      const keyId = crypto.randomBytes(8).toString('hex');
      const apiKey = `${keyPrefix}${keyId}_${keySecret}`;
      
      // Store only the keyId and a hash of the full API key
      const keyHash = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');
      
      // Make sure permissions is properly formatted as JSON
      const permissionsJson = JSON.stringify(data.permissions || ['logs:write']);
      
      const result = await db.query(
        `INSERT INTO api_keys (
          name, key_id, key_hash, created_by, permissions,
          description, expires_at, is_active, last_used, metadata, operation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          data.name,
          keyId,
          keyHash,
          data.created_by,
          permissionsJson, // Properly formatted JSON string
          data.description || null,
          data.expires_at || null,
          true, // is_active
          null, // last_used
          data.metadata || {},
          data.operation_id || null
        ]
      );
      
      // Return the newly created record with the full API key
      // Note: This is the only time the full API key is available
      const apiKeyRecord = result.rows[0];
      return {
        ...apiKeyRecord,
        api_key: apiKey // Only included in the response, never stored in the database
      };
    } catch (error) {
      console.error('Error creating API key:', error);
      throw error;
    }
  }
  
  /**
   * Get all API keys (without the actual keys)
   * @returns {Array} List of API keys
   */
  static async getAllApiKeys() {
    try {
      const result = await db.query(
        `SELECT id, name, key_id, created_by, permissions, description,
         created_at, expires_at, is_active, last_used, metadata, operation_id
         FROM api_keys
         ORDER BY created_at DESC`
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting API keys:', error);
      throw error;
    }
  }
  
  /**
   * Get API key by ID
   * @param {Number} id - API key ID
   * @returns {Object} API key record
   */
  static async getApiKeyById(id) {
    try {
      const result = await db.query(
        `SELECT id, name, key_id, created_by, permissions, description,
         created_at, expires_at, is_active, last_used, metadata, operation_id
         FROM api_keys
         WHERE id = $1`,
        [id]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting API key by ID:', error);
      throw error;
    }
  }
  
  /**
   * Get an API key by the actual API key
   * @param {String} apiKey - Full API key
   * @returns {Object} API key record
   */
  static async getApiKeyByKey(apiKey) {
    try {
      // Extract the key ID from the API key
      const keyParts = apiKey.split('_');
      if (keyParts.length < 2) {
        return null; // Invalid format
      }
      
      const keyId = keyParts[1]; // Format: rtl_keyId_secret
      
      // Calculate the hash of the full API key
      const keyHash = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');
      
      // Find the API key by ID and hash
      const result = await db.query(
        `SELECT id, name, key_id, created_by, permissions, description,
         created_at, expires_at, is_active, last_used, metadata, operation_id
         FROM api_keys
         WHERE key_id = $1 AND key_hash = $2 AND is_active = true`,
        [keyId, keyHash]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Update last_used timestamp
      await db.query(
        `UPDATE api_keys SET last_used = NOW() WHERE id = $1`,
        [result.rows[0].id]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting API key by key:', error);
      throw error;
    }
  }
  
  /**
   * Update an API key
   * @param {Number} id - API key ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated API key record
   */
  static async updateApiKey(id, updates) {
    try {
      const allowedUpdates = [
        'name', 'description', 'permissions',
        'expires_at', 'is_active', 'metadata'
      ];
      
      // Filter out any fields that aren't in allowedUpdates
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          // Handle permissions specifically to ensure proper JSON formatting
          if (key === 'permissions' && Array.isArray(updates[key])) {
            obj[key] = JSON.stringify(updates[key]);
          } else {
            obj[key] = updates[key];
          }
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
        `UPDATE api_keys
         SET ${setClause}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING id, name, key_id, created_by, permissions, description,
         created_at, updated_at, expires_at, is_active, last_used, metadata`,
        values
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating API key:', error);
      throw error;
    }
  }
  
  /**
   * Revoke (deactivate) an API key
   * @param {Number} id - API key ID
   * @returns {Object} Updated API key record
   */
  static async revokeApiKey(id) {
    try {
      const result = await db.query(
        `UPDATE api_keys
         SET is_active = false, updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, key_id, created_by, permissions, description,
         created_at, updated_at, expires_at, is_active, last_used, metadata`,
        [id]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error revoking API key:', error);
      throw error;
    }
  }
  
  /**
   * Delete an API key
   * @param {Number} id - API key ID
   * @returns {Object} Deleted API key record
   */
  static async deleteApiKey(id) {
    try {
      const result = await db.query(
        `DELETE FROM api_keys
         WHERE id = $1
         RETURNING id, name, key_id, created_by, permissions, description,
         created_at, expires_at, is_active, last_used, metadata`,
        [id]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error deleting API key:', error);
      throw error;
    }
  }
  
  /**
   * Get a redacted version of an API key record for logging
   * @param {Object} apiKey - API key record
   * @returns {Object} Redacted API key record
   */
  static getRedactedApiKey(apiKey) {
    return redactSensitiveData(apiKey, ['key_hash', 'api_key']);
  }
}

module.exports = ApiKeyModel;