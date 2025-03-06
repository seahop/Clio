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

module.exports = router;