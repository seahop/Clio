// backend/routes/ingest.routes.js - Updated for UTC timestamp handling
const express = require('express');
const router = express.Router();
const { sanitizeRequestMiddleware, sanitizeLogMiddleware } = require('../middleware/sanitize.middleware');
const { authenticateApiKey } = require('../middleware/api-key.middleware');
const eventLogger = require('../lib/eventLogger');
const LogsModel = require('../models/logs');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const https = require('https');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

module.exports = router;

// Track last notification time to prevent overwhelming the relation service
let lastNotificationTime = 0;
const MIN_NOTIFICATION_INTERVAL = 5000; // 5 seconds minimum between notifications

// Notification function with debouncing and error handling
const notifyRelationService = async () => {
  try {
    const now = Date.now();
    
    // Skip notification if we recently sent one
    if (now - lastNotificationTime < MIN_NOTIFICATION_INTERVAL) {
      console.log('Skipping relation service notification (rate limited)');
      return;
    }
    
    lastNotificationTime = now;
    
    console.log('Notifying relation service of new API-ingested logs...');
    
    // Set a timeout for the request to prevent hanging
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 3000);
    
    try {
      const response = await fetch('https://relation-service:3002/api/notify/log-update', {
        method: 'POST',
        agent: httpsAgent,
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({ 
          source: 'api_ingest',
          timestamp: new Date().toISOString()
        })
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        console.warn(`Relation service notification returned status: ${response.status}`);
      } else {
        console.log('Relation service notified successfully');
      }
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        console.warn('Relation service notification timed out after 3s');
      } else {
        console.warn('Error notifying relation service:', fetchError.message);
      }
    }
  } catch (error) {
    console.error('Unexpected error in relation service notification:', error);
    // Don't throw - we don't want to fail the main operation
  }
};

// Helper function to validate and standardize timestamps
function validateAndStandardizeTimestamp(timestamp) {
  if (!timestamp) {
    return { valid: false, timestamp: new Date().toISOString() };
  }
  
  try {
    // Parse the timestamp
    const parsedDate = new Date(timestamp);
    
    // Check if it's a valid date
    if (isNaN(parsedDate.getTime())) {
      console.warn(`Invalid timestamp provided: ${timestamp}, using current UTC time`);
      return { valid: false, timestamp: new Date().toISOString() };
    }
    
    // Return the validated timestamp in ISO format (which is UTC)
    return { valid: true, timestamp: parsedDate.toISOString() };
  } catch (error) {
    console.warn(`Error validating timestamp: ${error.message}, using current UTC time`);
    return { valid: false, timestamp: new Date().toISOString() };
  }
}

// Rate limiting for log ingestion
const ingestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // limit each API key to 120 requests per minute (2 per second)
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
 * Status endpoint to check API key validity
 * GET /api/ingest/status
 * This endpoint should be accessible with any valid API key
 */
router.get('/status', async (req, res) => {
  try {
    // Simple status endpoint to verify API key is working
    await eventLogger.logDataEvent('api_status_check', req.apiKey.createdBy, {
      keyId: req.apiKey.keyId,
      timestamp: new Date().toISOString(),  // UTC timestamp for logs
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
      timestamp: new Date().toISOString()  // UTC timestamp in response
    });
  } catch (error) {
    console.error('Error in API status check:', error);
    res.status(500).json({ error: 'Status check failed', detail: error.message });
  }
});

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
        // Set the analyst to the API key's name instead of the creator's username
        // This allows tracking which API key submitted the log
        const logWithAnalyst = {
          ...log,
          analyst: req.apiKey.name
        };
        
        // Validate and standardize the timestamp to UTC
        const { valid, timestamp } = validateAndStandardizeTimestamp(logWithAnalyst.timestamp);
        logWithAnalyst.timestamp = timestamp;
        
        if (!valid) {
          console.warn(`Using UTC timestamp ${timestamp} for log entry (original was invalid)`);
        } else {
          console.log(`Using validated UTC timestamp: ${timestamp}`);
        }
        
        // Create the log
        const newLog = await LogsModel.createLog(logWithAnalyst);
        
        // Log the creation (with redacted secrets)
        await eventLogger.logDataEvent('api_ingest_log', req.apiKey.createdBy, {
          logId: newLog.id,
          keyId: req.apiKey.keyId,
          apiKeyName: req.apiKey.name, // Add API key name to event log for reference
          timestamp: new Date().toISOString(),  // Current UTC time for the event log
          entryTimestamp: logWithAnalyst.timestamp, // Log the entry's UTC timestamp too
          clientInfo: {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }
        });
        
        results.push({
          id: newLog.id,
          success: true,
          timestamp: newLog.timestamp // Return the stored timestamp
        });
      } catch (error) {
        console.error('Error ingesting log:', error);
        
        errors.push({
          error: error.message,
          log: LogsModel.getRedactedLog(log) // Redact sensitive data for error logs
        });
      }
    }
    
    // Return the results first to avoid keeping the client waiting
    const response = {
      message: `Processed ${logs.length} logs: ${results.length} successful, ${errors.length} failed`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      serverTime: new Date().toISOString() // Include server UTC time for reference
    };
    
    res.status(errors.length > 0 ? 207 : 201).json(response);
    
    // Then notify relation service asynchronously after response is sent
    // This prevents client from waiting for the notification
    if (results.length > 0) {
      // Use setTimeout to ensure this runs after response is sent
      setTimeout(() => {
        notifyRelationService().catch(error => {
          console.error('Async notification error:', error);
        });
      }, 10);
    }
  } catch (error) {
    console.error('Error processing log ingestion:', error);
    
    await eventLogger.logDataEvent('api_ingest_error', req.apiKey?.createdBy || 'unknown', {
      error: error.message,
      keyId: req.apiKey?.keyId,
      timestamp: new Date().toISOString(), // UTC timestamp for error log
      clientInfo: {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
    
    res.status(500).json({ error: 'Log ingestion failed', detail: error.message });
  }
});