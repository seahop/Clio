// backend/routes/export/encryption.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../../middleware/jwt.middleware');
const encryptionController = require('../../controllers/encryption.controller');

// Encrypt a file for S3
router.post('/encrypt-for-s3', authenticateJwt, verifyAdmin, encryptionController.encryptForS3);

// Decrypt a file from S3
router.post('/decrypt-from-s3', authenticateJwt, verifyAdmin, encryptionController.decryptFromS3);

module.exports = router;