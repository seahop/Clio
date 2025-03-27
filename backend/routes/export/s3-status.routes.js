// backend/routes/export/s3-status.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../../middleware/jwt.middleware');
const s3StatusController = require('../../controllers/export/s3-status.controller');

// Get S3 upload status for all exports
router.get('/', authenticateJwt, verifyAdmin, s3StatusController.getExportS3Status);

// Update S3 upload status for an export
router.post('/', authenticateJwt, verifyAdmin, s3StatusController.updateExportS3Status);

module.exports = router;