// backend/middleware/api-key.middleware.js
const ApiKeyModel = require('../models/api-key');
const eventLogger = require('../lib/eventLogger');

/**
 * Authentication middleware using API keys
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    // Get API key from header
    const apiKey = req.header('X-API-Key');
    if (!apiKey) {
      return res.status(401).json({ error: 'API key is required' });
    }
    
    // Log minimal info about the request for security purposes
    console.debug('API key auth attempt', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      keyPrefix: apiKey.substring(0, 6) // Log only the prefix for debugging
    });
    
    // Check if the API key exists and is valid
    const keyData = await ApiKeyModel.getApiKeyByKey(apiKey);
    if (!keyData) {
      // Log the failed attempt
      await eventLogger.logSecurityEvent('api_key_auth_failed', 'api_client', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        reason: 'Invalid API key'
      });
      
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Check if the key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      // Log the attempt with expired key
      await eventLogger.logSecurityEvent('api_key_auth_failed', keyData.created_by, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        reason: 'Expired API key',
        keyId: keyData.key_id
      });
      
      return res.status(401).json({ 
        error: 'API key has expired',
        detail: 'Please generate a new API key'
      });
    }
    
    // Special case: status endpoint should be accessible with any valid API key
    if (req.path === '/status' && req.method === 'GET') {
      // Add API key info to the request
      req.apiKey = {
        id: keyData.id,
        keyId: keyData.key_id,
        name: keyData.name,
        createdBy: keyData.created_by,
        permissions: keyData.permissions
      };
      
      return next();
    }
    
    // Check permissions for other endpoints
    const requiredPermission = req.method === 'GET' ? 'logs:read' : 'logs:write';
    if (!keyData.permissions.includes(requiredPermission) && 
        !keyData.permissions.includes('logs:admin')) {
      
      // Log the unauthorized attempt
      await eventLogger.logSecurityEvent('api_key_auth_unauthorized', keyData.created_by, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        reason: 'Insufficient permissions',
        keyId: keyData.key_id,
        requiredPermission
      });
      
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        detail: `This API key does not have the required permission: ${requiredPermission}`
      });
    }
    
    // Add API key info to the request
    req.apiKey = {
      id: keyData.id,
      keyId: keyData.key_id,
      name: keyData.name,
      createdBy: keyData.created_by,
      permissions: keyData.permissions
    };
    
    // Log successful usage
    await eventLogger.logDataEvent('api_key_used', keyData.created_by, {
      keyId: keyData.key_id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    
    await eventLogger.logSecurityEvent('api_key_auth_error', 'system', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = {
  authenticateApiKey
};