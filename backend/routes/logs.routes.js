//routes/logs.routes.js
const express = require('express');
const router = express.Router();
const LogsModel = require('../models/logs');
const eventLogger = require('../lib/eventLogger');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const { redactSensitiveData } = require('../utils/sanitize');
const fetch = require('node-fetch');
const https = require('https');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Function to notify relation service
const notifyRelationService = async () => {
  try {
    const response = await fetch('https://relation-service:3002/api/notify/log-update', {
      method: 'POST',
      agent: httpsAgent,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to notify relation service: ${response.status}`);
    }

    console.log('Relation service notified successfully');
  } catch (error) {
    console.error('Error notifying relation service:', error);
    // Don't throw - we don't want to fail the main operation if notification fails
  }
};

router.get('/', authenticateJwt, async (req, res, next) => {
  try {
    // Always get all logs including secrets for UI display
    const logs = await LogsModel.getAllLogs();

    // For logging purposes, create a redacted version that doesn't include secrets
    const logsForLogging = logs.map(log => redactSensitiveData(log, ['secrets']));
    
    await eventLogger.logDataEvent('view_logs', req.user.username, {
      count: logs.length,
      timestamp: new Date().toISOString()
    });

    // Return the logs with actual secrets to the UI
    res.json(logs);
  } catch (error) {
    console.error('Error getting logs:', error);
    await eventLogger.logDataEvent('view_logs_error', req.user.username, {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

router.post('/', authenticateJwt, async (req, res, next) => {
  try {
    // Create the log with secrets intact
    const newLog = await LogsModel.createLog({
      ...req.body,
      analyst: req.user.username
    });

    // Notify relation service
    await notifyRelationService();

    // Log the creation with redacted secrets
    const logDataForEvents = redactSensitiveData({
      logId: newLog.id,
      timestamp: new Date().toISOString(),
      clientInfo: {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    }, ['secrets']);
    
    await eventLogger.logDataEvent('create_log', req.user.username, logDataForEvents);

    // Return the log with actual secrets to the UI
    res.json(newLog);
  } catch (error) {
    console.error('Error creating log:', error);
    
    // Make sure we don't log the secrets if there's an error
    const safeBody = redactSensitiveData(req.body, ['secrets']);
    
    await eventLogger.logDataEvent('create_log_error', req.user.username, {
      error: error.message,
      attemptedData: safeBody,
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

router.put('/:id', authenticateJwt, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const isAdmin = req.user.role === 'admin';

    // Get the existing log before updating to have the original values
    const existingLog = await LogsModel.getLogById(id);
    
    if (!existingLog) {
      await eventLogger.logDataEvent('update_failed', req.user.username, {
        rowId: id,
        reason: 'Log not found',
        attempted_changes: redactSensitiveData(req.body, ['secrets'])
      });
      return res.status(404).json({ error: 'Log not found' });
    }

    const lockStatus = await LogsModel.getLockStatus(id);
    
    if (!lockStatus) {
      await eventLogger.logDataEvent('update_failed', req.user.username, {
        rowId: id,
        reason: 'Log not found',
        attempted_changes: redactSensitiveData(req.body, ['secrets'])
      });
      return res.status(404).json({ error: 'Log not found' });
    }

    // Handle locking/unlocking
    if ('locked' in req.body) {
      if (req.body.locked === true) {
        if (lockStatus.locked && !isAdmin) {
          await eventLogger.logDataEvent('lock_failed', req.user.username, {
            rowId: id,
            reason: `Already locked by ${lockStatus.locked_by}`,
            timestamp: new Date().toISOString()
          });
          return res.status(403).json({ 
            error: 'Lock failed',
            detail: `This record is already locked by ${lockStatus.locked_by}`
          });
        }
        await eventLogger.logRowLock(req.user.username, id, {
          timestamp: new Date().toISOString()
        });
      } else {
        if (lockStatus.locked && lockStatus.locked_by !== req.user.username && !isAdmin) {
          await eventLogger.logDataEvent('unlock_failed', req.user.username, {
            rowId: id,
            reason: `Locked by ${lockStatus.locked_by}`,
            timestamp: new Date().toISOString()
          });
          return res.status(403).json({ 
            error: 'Unlock failed',
            detail: `Only ${lockStatus.locked_by} or an admin can unlock this record`
          });
        }
        await eventLogger.logRowUnlock(req.user.username, id, {
          timestamp: new Date().toISOString()
        });
      }
    }
    // Check lock status for other updates
    else if (lockStatus.locked && lockStatus.locked_by !== req.user.username && !isAdmin) {
      await eventLogger.logDataEvent('update_failed', req.user.username, {
        rowId: id,
        reason: `Record locked by ${lockStatus.locked_by}`,
        attempted_changes: redactSensitiveData(req.body, ['secrets'])
      });
      return res.status(403).json({ 
        error: 'Update failed',
        detail: `This record is locked by ${lockStatus.locked_by}`
      });
    }

    // Remove analyst field from updates
    const { analyst, ...updates } = req.body;

    const updatedLog = await LogsModel.updateLog(id, updates);
    
    if (!updatedLog) {
      await eventLogger.logDataEvent('update_failed', req.user.username, {
        rowId: id,
        reason: 'No valid updates provided',
        attempted_changes: redactSensitiveData(updates, ['secrets'])
      });
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    // Notify relation service after successful update
    await notifyRelationService();

    // Define a more comprehensive map of fields to their relation types
    const relationFieldMap = {
      // Core relation fields
      'internal_ip': 'ip',
      'external_ip': 'ip',
      'hostname': 'hostname',
      'domain': 'domain',
      'username': 'username',
      'command': 'command',
      'filename': 'filename',
      // These fields don't directly map to relation types but are included in analysis
      'status': 'status',
      'analyst': 'analyst'
    };

    // Main fields that require notification to the relation service
    const relationFields = Object.keys(relationFieldMap);

    // Find fields in the updates that affect relations
    const updatedRelationFields = Object.keys(updates).filter(key => relationFields.includes(key));

    // If relation fields were updated, send specific field update notifications
    if (updatedRelationFields.length > 0) {
      try {
        // Get auth token for relation service requests
        const token = req.cookies?.auth_token;
        
        // For each updated relation field, send a specific field update
        for (const field of updatedRelationFields) {
          // Only if both old and new values exist and they're different
          const oldValue = existingLog[field];
          const newValue = updatedLog[field];
          
          // Log all field updates for debugging
          console.log(`FIELD UPDATE DETECTED: ${field}`);
          console.log(`Old value: "${oldValue}"`);
          console.log(`New value: "${newValue}"`);
          
          // Log the field update
          await eventLogger.logDataEvent(`${field}_update`, req.user.username, {
            oldValue,
            newValue,
            timestamp: new Date().toISOString()
          });
          
          // Only notify if the value actually changed and both values exist
          if (oldValue !== newValue && oldValue && newValue) {
            // Do specific notifications for relation service
            if (['internal_ip', 'external_ip', 'hostname', 'domain', 'username', 'command', 'filename'].includes(field)) {
              console.log('Sending update to relation service:', {
                fieldType: field,
                oldValue,
                newValue,
                username: req.user.username
              });
              
              const fieldUpdateResponse = await fetch('https://relation-service:3002/api/updates/field-update', {
                method: 'POST',
                agent: httpsAgent,
                headers: {
                  'Content-Type': 'application/json',
                  'Cookie': `auth_token=${token}`
                },
                body: JSON.stringify({
                  fieldType: field,
                  oldValue,
                  newValue,
                  username: req.user.username
                })
              });
              
              if (!fieldUpdateResponse.ok) {
                console.error(`Failed to notify relation service about ${field} update: ${fieldUpdateResponse.status}`);
              } else {
                console.log(`Notified relation service of ${field} update from "${oldValue}" to "${newValue}"`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error notifying relation service of field updates:', error);
        // Don't fail the main request if notification fails
      }
    }

    // Log changes with redacted secrets
    const safeChanges = redactSensitiveData(updates, ['secrets']);
    
    await eventLogger.logRowUpdate(req.user.username, id, {
      changes: safeChanges,
      timestamp: new Date().toISOString()
    });
    
    // Return the updated log with actual secrets
    res.json(updatedLog);
  } catch (error) {
    console.error('Error updating log:', error);
    
    // Make sure we don't log secrets if there's an error
    const safeBody = redactSensitiveData(req.body, ['secrets']);
    
    await eventLogger.logDataEvent('update_error', req.user.username, {
      rowId: parseInt(req.params.id),
      error: error.message,
      attempted_changes: safeBody,
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

router.delete('/:id', authenticateJwt, verifyAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    
    const deletedLog = await LogsModel.deleteLog(id);
    
    if (!deletedLog) {
      await eventLogger.logDataEvent('delete_failed', req.user.username, {
        rowId: id,
        reason: 'Log not found',
        timestamp: new Date().toISOString()
      });
      return res.status(404).json({ error: 'Log not found' });
    }

    // Notify relation service after deletion
    await notifyRelationService();

    // For logging purposes, create a redacted version that doesn't include secrets
    const safeDeletedLog = redactSensitiveData(deletedLog, ['secrets']);
    
    await eventLogger.logDataEvent('delete_log', req.user.username, {
      rowId: id,
      deletedData: safeDeletedLog,
      timestamp: new Date().toISOString()
    });

    res.json({ message: 'Log deleted successfully' });
  } catch (error) {
    console.error('Error deleting log:', error);
    await eventLogger.logDataEvent('delete_error', req.user.username, {
      rowId: parseInt(req.params.id),
      error: error.message,
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

module.exports = router;