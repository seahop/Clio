// backend/controllers/logs.controller.js
const express = require('express');
const eventLogger = require('../lib/eventLogger');
const { authenticateToken, verifyAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

// Get logs with filtering
router.get('/:logType', authenticateToken, verifyAdmin, async (req, res) => {
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

    res.json(logs);
  } catch (error) {
    console.error('Error retrieving logs:', error);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Export logs
router.get('/:logType/export', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { logType } = req.params;
    const logs = await eventLogger.getLogs(logType);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${logType}_logs_${Date.now()}.json`);

    res.json(logs);

    // Log the export
    await eventLogger.logAuditEvent('logs_export', req.user.username, {
      logType,
      recordCount: logs.length
    });
  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

module.exports = router;