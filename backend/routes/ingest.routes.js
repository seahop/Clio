// backend/routes/ingest.routes.js
const express = require('express');
const router = express.Router();
const { sanitizeRequestMiddleware, sanitizeLogMiddleware } = require('../middleware/sanitize.middleware');
const { authenticateApiKey } = require('../middleware/api-key.middleware');
const eventLogger = require('../lib/eventLogger');
const LogsModel = require('../models/logs');
const rateLimit = require('express-rate-limit');

// Rate limiting for log ingestion
const ingestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each API key to 60 requests per minute (1 per second)
  message: 'Too many log ingestion requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use the API key as the identifier for rate limiting
    return req.header('X-API-Key') || req.ip;
  }
});

// All ingest routes require API key authentication
router.use(authenticateApiKey);
router.use(ingestLimiter);
router.use(sanitizeRequestMiddleware);
router.use(sanitizeLogMiddleware);

/**
 * Log ingestion endpoint
 * POST /api/ingest/logs
 */
router.post('/logs', async (req, res) => {
  try {
    const logData = req.body;
    
    // Validate required fields
    if (!logData) {
      return res.status(400).json({ error: 'Log data is required' });
    }
    
    // Support both single log and batch of logs
    const logs = Array.isArray(logData) ? logData : [logData];
    
    if (logs.length === 0) {
      return res.status(400).json({ error: 'No valid logs provided' });
    }
    
    if (logs.length > 50) {
      return res.status(400).json({ 
        error: 'Batch size exceeded',
        detail: 'Maximum of 50 logs per request is allowed'
      });
    }
    
    // Process each log
    const results = [];
    const errors = [];
    
    for (const log of logs) {
      try {
        // Set the analyst to the API key's creator
        const logWithAnalyst = {
          ...log,
          analyst: req.apiKey.createdBy
        };
        
        // Create the log
        const newLog = await LogsModel.createLog(logWithAnalyst);
        
        // Log the creation (with redacted secrets)
        await eventLogger.logDataEvent('api_ingest_log', req.apiKey.createdBy, {
          logId: newLog.id,
          keyId: req.apiKey.keyId,
          timestamp: new Date().toISOString(),
          clientInfo: {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }
        });
        
        results.push({
          id: newLog.id,
          success: true
        });
      } catch (error) {
        console.error('Error ingesting log:', error);
        
        errors.push({
          error: error.message,
          log: LogsModel.getRedactedLog(log) // Redact sensitive data for error logs
        });
      }
    }
    
    // Return the results
    res.status(errors.length > 0 ? 207 : 201).json({
      message: `Processed ${logs.length} logs: ${results.length} successful, ${errors.length} failed`,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error processing log ingestion:', error);
    
    await eventLogger.logDataEvent('api_ingest_error', req.apiKey?.createdBy || 'unknown', {
      error: error.message,
      keyId: req.apiKey?.keyId,
      timestamp: new Date().toISOString(),
      clientInfo: {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
    
    res.status(500).json({ error: 'Log ingestion failed', detail: error.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    // Simple status endpoint to verify API key is working
    await eventLogger.logDataEvent('api_status_check', req.apiKey.createdBy, {
      keyId: req.apiKey.keyId,
      timestamp: new Date().toISOString(),
      clientInfo: {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
    
    res.json({
      status: 'ok',
      apiKey: {
        name: req.apiKey.name,
        keyId: req.apiKey.keyId,
        permissions: req.apiKey.permissions
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in API status check:', error);
    res.status(500).json({ error: 'Status check failed', detail: error.message });
  }
});

module.exports = router;