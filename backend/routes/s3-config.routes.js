// backend/routes/s3.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const s3ConfigController = require('../controllers/s3-config.controller');

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

module.exports = router;