// backend/routes/export/common.routes.js
const express = require('express');
const router = express.Router();
const commonController = require('../../controllers/export/common.controller');

// Get available columns for export
router.get('/columns', commonController.getExportColumns);

// List existing exports
router.get('/list', commonController.listExports);

// Delete an export
router.delete('/:filename', commonController.deleteExport);

module.exports = router;