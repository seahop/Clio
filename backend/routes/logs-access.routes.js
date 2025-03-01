//routes/logs-access.routes.js
const express = require('express');
const router = express.Router();
const eventLogger = require('../lib/eventLogger');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const rateLimit = require('express-rate-limit');

// Rate limiting for log access
const logAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many log access attempts, please try again later'
});

// Get available log types
router.get('/types', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    const logTypes = ['security', 'data', 'system', 'audit'];
    
    await eventLogger.logAuditEvent('view_log_types', req.user.username, {
      timestamp: new Date().toISOString()
    });

    res.json(logTypes);
  } catch (error) {
    console.error('Error getting log types:', error);
    res.status(500).json({ error: 'Failed to retrieve log types' });
  }
});

// Get logs of specific type with filtering
router.get('/:logType', authenticateJwt, verifyAdmin, logAccessLimiter, async (req, res) => {
  try {
    const { logType } = req.params;
    const {
      startDate,
      endDate,
      username,
      severity,
      type,
      limit = 100,
      offset = 0
    } = req.query;

    const logs = await eventLogger.getLogs(logType, {
      startDate,
      endDate,
      username,
      severity,
      type,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Log the access
    await eventLogger.logAuditEvent('view_logs', req.user.username, {
      logType,
      filters: {
        startDate,
        endDate,
        username,
        severity,
        type,
        limit,
        offset
      },
      resultCount: logs.length,
      timestamp: new Date().toISOString()
    });

    res.json(logs);
  } catch (error) {
    console.error('Error retrieving logs:', error);
    
    await eventLogger.logAuditEvent('view_logs_error', req.user.username, {
      logType: req.params.logType,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Export logs
router.get('/:logType/export', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    const { logType } = req.params;
    const logs = await eventLogger.getLogs(logType);

    // Add export metadata
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.username,
        logType,
        recordCount: logs.length
      },
      logs
    };

    // Log the export
    await eventLogger.logAuditEvent('export_logs', req.user.username, {
      logType,
      recordCount: logs.length,
      timestamp: new Date().toISOString()
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${logType}_logs_${Date.now()}.json`);

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting logs:', error);
    
    await eventLogger.logAuditEvent('export_logs_error', req.user.username, {
      logType: req.params.logType,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({ error: 'Failed to export logs' });
  }
});

module.exports = router;