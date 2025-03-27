// backend/routes/export.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');

// Import sub-routers
const csvRoutes = require('./export/csv.routes');
const evidenceRoutes = require('./export/evidence.routes');
const commonRoutes = require('./export/common.routes');

// Apply middleware to all routes
router.use(authenticateJwt);
router.use(verifyAdmin);

// Mount sub-routers
router.use('/csv', csvRoutes);
router.use('/evidence', evidenceRoutes);
router.use('/', commonRoutes);
router.use('/s3-status', require('./export/s3-status.routes'));

// Directly import controller for encryption routes
const encryptionController = require('../controllers/encryption.controller');

// Add encryption routes directly to this router
router.post('/encrypt-for-s3', encryptionController.encryptForS3);
router.post('/decrypt-from-s3', encryptionController.decryptFromS3);

module.exports = router;