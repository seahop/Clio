// backend/routes/export/csv.routes.js
const express = require('express');
const router = express.Router();
const csvController = require('../../controllers/export/csv.controller');

// Export logs as CSV
router.post('/', csvController.exportCsv);

module.exports = router;