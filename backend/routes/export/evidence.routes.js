// backend/routes/export/evidence.routes.js
const express = require('express');
const router = express.Router();
const evidenceController = require('../../controllers/export/evidence.controller');

// Export logs with evidence
router.post('/', evidenceController.exportEvidence);

module.exports = router;