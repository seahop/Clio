// backend/routes/export/common.routes.js
const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../../middleware/jwt.middleware');
const commonController = require('../../controllers/export/common.controller');

// Available to all authenticated users
router.get('/columns', commonController.getExportColumns);

// Admin-only — listing and deleting server-side export files
router.get('/list', verifyAdmin, commonController.listExports);
router.delete('/:filename', verifyAdmin, commonController.deleteExport);

module.exports = router;
