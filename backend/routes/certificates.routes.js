// backend/routes/certificates.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const certController = require('../controllers/certificates.controller');

// All routes require admin authentication
router.use(authenticateJwt);
router.use(verifyAdmin);

// Get certificate status
router.get('/status', certController.getCertificateStatus);

module.exports = router;