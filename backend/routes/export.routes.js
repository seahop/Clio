// backend/routes/export.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');

// Import sub-routers
const csvRoutes = require('./export/csv.routes');
const evidenceRoutes = require('./export/evidence.routes');
const commonRoutes = require('./export/common.routes');

// All export routes require authentication
router.use(authenticateJwt);

// CSV export and column list — available to any authenticated user.
// The CSV controller applies operation scoping for non-admins.
router.use('/csv', csvRoutes);
router.use('/', commonRoutes);

// Everything below is admin-only
router.use('/evidence', verifyAdmin, evidenceRoutes);
router.use('/s3-status', require('./export/s3-status.routes'));

const encryptionController = require('../controllers/encryption.controller');
router.post('/encrypt-for-s3', verifyAdmin, encryptionController.encryptForS3);
router.post('/decrypt-from-s3', verifyAdmin, encryptionController.decryptFromS3);

module.exports = router;
