// backend/controllers/api-key.controller.js
const ApiKeyModel = require('../models/api-key');
const eventLogger = require('../lib/eventLogger');

/**
 * Controller for managing API keys
 */
const apiKeyController = {
  /**
   * Create a new API key
   */
  async createApiKey(req, res) {
    try {
      const { name, description, permissions, expires_at, operation_id } = req.body;

      // Validate required fields
      if (!name) {
        return res.status(400).json({ error: 'API key name is required' });
      }

      // Create API key
      const apiKey = await ApiKeyModel.createApiKey({
        name,
        description,
        permissions,
        expires_at: expires_at ? new Date(expires_at) : null,
        operation_id: operation_id || null,
        created_by: req.user.username,
        metadata: {
          created_from_ip: req.ip,
          user_agent: req.get('User-Agent')
        }
      });
      
      // Extract the key value before logging
      const apiKeyValue = apiKey.api_key;
      
      // Log the API key creation (with redacted key)
      await eventLogger.logSecurityEvent('api_key_created', req.user.username, {
        keyId: apiKey.key_id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        ip: req.ip
      });
      
      // Return the API key (including the value - only shown once)
      res.status(201).json({
        message: 'API key created successfully',
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyId: apiKey.key_id,
          key: apiKeyValue, // Full key - only returned once
          permissions: apiKey.permissions,
          description: apiKey.description,
          createdAt: apiKey.created_at,
          expiresAt: apiKey.expires_at,
          createdBy: apiKey.created_by
        },
        important: 'Save this API key value - it will not be shown again!'
      });
    } catch (error) {
      console.error('Error creating API key:', error);
      await eventLogger.logSecurityEvent('api_key_creation_error', req.user.username, {
        error: error.message,
        ip: req.ip
      });
      res.status(500).json({ error: 'Failed to create API key' });
    }
  },
  
  /**
   * Get all API keys
   */
  async getAllApiKeys(req, res) {
    try {
      const apiKeys = await ApiKeyModel.getAllApiKeys();
      
      // Format the response
      const formattedKeys = apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        keyId: key.key_id,
        permissions: key.permissions,
        description: key.description,
        createdAt: key.created_at,
        expiresAt: key.expires_at,
        isActive: key.is_active,
        lastUsed: key.last_used,
        createdBy: key.created_by
      }));
      
      res.json(formattedKeys);
    } catch (error) {
      console.error('Error getting API keys:', error);
      res.status(500).json({ error: 'Failed to get API keys' });
    }
  },
  
  /**
   * Get API key by ID
   */
  async getApiKeyById(req, res) {
    try {
      const { id } = req.params;
      const apiKey = await ApiKeyModel.getApiKeyById(parseInt(id));
      
      if (!apiKey) {
        return res.status(404).json({ error: 'API key not found' });
      }
      
      // Format the response
      const formattedKey = {
        id: apiKey.id,
        name: apiKey.name,
        keyId: apiKey.key_id,
        permissions: apiKey.permissions,
        description: apiKey.description,
        createdAt: apiKey.created_at,
        expiresAt: apiKey.expires_at,
        isActive: apiKey.is_active,
        lastUsed: apiKey.last_used,
        createdBy: apiKey.created_by
      };
      
      res.json(formattedKey);
    } catch (error) {
      console.error('Error getting API key:', error);
      res.status(500).json({ error: 'Failed to get API key' });
    }
  },
  
  /**
   * Update API key
   */
  async updateApiKey(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Convert expiration date string to Date object if provided
      if (updates.expires_at) {
        updates.expires_at = new Date(updates.expires_at);
      }
      
      const apiKey = await ApiKeyModel.updateApiKey(parseInt(id), updates);
      
      if (!apiKey) {
        return res.status(404).json({ error: 'API key not found' });
      }
      
      // Log the update
      await eventLogger.logSecurityEvent('api_key_updated', req.user.username, {
        keyId: apiKey.key_id,
        name: apiKey.name,
        updatedFields: Object.keys(updates),
        ip: req.ip
      });
      
      // Format the response
      const formattedKey = {
        id: apiKey.id,
        name: apiKey.name,
        keyId: apiKey.key_id,
        permissions: apiKey.permissions,
        description: apiKey.description,
        createdAt: apiKey.created_at,
        updatedAt: apiKey.updated_at,
        expiresAt: apiKey.expires_at,
        isActive: apiKey.is_active,
        lastUsed: apiKey.last_used,
        createdBy: apiKey.created_by
      };
      
      res.json({
        message: 'API key updated successfully',
        apiKey: formattedKey
      });
    } catch (error) {
      console.error('Error updating API key:', error);
      res.status(500).json({ error: 'Failed to update API key' });
    }
  },
  
  /**
   * Revoke (deactivate) API key
   */
  async revokeApiKey(req, res) {
    try {
      const { id } = req.params;
      
      // Get API key before revoking (for logging)
      const existingKey = await ApiKeyModel.getApiKeyById(parseInt(id));
      if (!existingKey) {
        return res.status(404).json({ error: 'API key not found' });
      }
      
      const apiKey = await ApiKeyModel.revokeApiKey(parseInt(id));
      
      // Log the revocation
      await eventLogger.logSecurityEvent('api_key_revoked', req.user.username, {
        keyId: existingKey.key_id,
        name: existingKey.name,
        ip: req.ip
      });
      
      res.json({
        message: 'API key revoked successfully',
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyId: apiKey.key_id,
          isActive: apiKey.is_active // Should be false
        }
      });
    } catch (error) {
      console.error('Error revoking API key:', error);
      res.status(500).json({ error: 'Failed to revoke API key' });
    }
  },
  
  /**
   * Delete API key
   */
  async deleteApiKey(req, res) {
    try {
      const { id } = req.params;
      
      // Get API key before deleting (for logging)
      const existingKey = await ApiKeyModel.getApiKeyById(parseInt(id));
      if (!existingKey) {
        return res.status(404).json({ error: 'API key not found' });
      }
      
      await ApiKeyModel.deleteApiKey(parseInt(id));
      
      // Log the deletion
      await eventLogger.logSecurityEvent('api_key_deleted', req.user.username, {
        keyId: existingKey.key_id,
        name: existingKey.name,
        ip: req.ip
      });
      
      res.json({
        message: 'API key deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting API key:', error);
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  }
};

module.exports = apiKeyController;