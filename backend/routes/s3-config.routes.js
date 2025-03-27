// backend/routes/s3.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const s3ConfigController = require('../controllers/s3-config.controller');
const eventLogger = require('../lib/eventLogger');

// All routes require JWT authentication and admin privileges
router.use(authenticateJwt);
router.use(verifyAdmin);

// Get S3 configuration
router.get('/', s3ConfigController.getS3Config);

// Save S3 configuration
router.post('/', s3ConfigController.saveS3Config);

// Test S3 connection
router.post('/test', s3ConfigController.testS3Connection);

// Generate pre-signed URL for S3 upload
router.post('/presigned-url', s3ConfigController.getPresignedUrl);

// Update S3 upload status
router.post('/upload-status', authenticateJwt, verifyAdmin, async (req, res) => {
    try {
      const { archiveFileName, status, details } = req.body;
      
      if (!archiveFileName || !status) {
        return res.status(400).json({ error: 'Archive file name and status are required' });
      }
      
      // Get log rotation manager to update status
      const logRotationManager = require('../lib/logRotation');
      
      // Update the status
      logRotationManager.updateS3UploadStatus(archiveFileName, status, details || {});
      
      // Log the status update
      await eventLogger.logAuditEvent('s3_upload_status_update', req.user.username, {
        archiveFileName,
        status,
        details: details || {},
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      
      res.json({
        message: `S3 upload status for ${archiveFileName} updated to ${status}`,
        success: true
      });
    } catch (error) {
      console.error('Error updating S3 upload status:', error);
      res.status(500).json({ error: 'Failed to update S3 upload status' });
    }
  });
  
  // Get all S3 upload statuses for log archives
  router.get('/upload-statuses', s3ConfigController.getS3UploadStatuses);

module.exports = router;