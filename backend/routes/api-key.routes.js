// backend/routes/api-key.routes.js
const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/api-key.controller');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const rateLimit = require('express-rate-limit');

// Rate limiting for API key management
const apiKeyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 requests per window
  message: 'Too many API key management requests, please try again later'
});

// All API key management routes require admin authentication
// CSRF is handled by the global middleware in server.js; no second pass needed here.
router.use(authenticateJwt);
router.use(verifyAdmin);
router.use(apiKeyLimiter);

// Create a new API key
router.post('/', apiKeyController.createApiKey);

// Get all API keys
router.get('/', apiKeyController.getAllApiKeys);

// Get API key by ID
router.get('/:id', apiKeyController.getApiKeyById);

// Update API key
router.put('/:id', apiKeyController.updateApiKey);

// Revoke API key
router.post('/:id/revoke', apiKeyController.revokeApiKey);

// Delete API key
router.delete('/:id', apiKeyController.deleteApiKey);

module.exports = router;