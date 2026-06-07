// backend/routes/fileStatus.routes.js
const express = require('express');
const router = express.Router();
const FileStatusService = require('../services/relations/fileStatusService');
const { authenticateJwt: authenticateToken, verifyAdmin } = require('../middleware/jwt.middleware');
const OperationsModel = require('../models/operations');

// authenticateJwt only sets {id, username, role} — look up the active operation
// here so every handler has req.activeOperationTagId available.
const attachActiveOp = async (req, res, next) => {
  try {
    const activeOp = await OperationsModel.getUserActiveOperation(req.user.username);
    req.activeOperationTagId = activeOp?.tag_id || null;
  } catch (err) {
    console.error('Failed to load active operation for file-status:', err);
    req.activeOperationTagId = null;
  }
  next();
};

router.get('/', authenticateToken, attachActiveOp, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.activeOperationTagId;
    if (!isAdmin && !operationTagId) return res.json([]);
    const files = await FileStatusService.getAllFileStatuses(operationTagId, isAdmin);
    res.json(files);
  } catch (error) {
    console.error('Error getting file statuses:', error);
    res.status(500).json({ error: 'Failed to get file statuses', details: error.message });
  }
});

router.get('/status/:status', authenticateToken, attachActiveOp, async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['ON_DISK', 'IN_MEMORY', 'ENCRYPTED', 'REMOVED', 'CLEANED', 'DORMANT', 'DETECTED', 'UNKNOWN'];
    const normalizedStatus = status.toUpperCase();
    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status', validStatuses });
    }
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.activeOperationTagId;
    if (!isAdmin && !operationTagId) return res.json([]);
    const files = await FileStatusService.getFileStatusesByStatus(normalizedStatus, operationTagId, isAdmin);
    res.json(files);
  } catch (error) {
    console.error('Error getting file statuses by status:', error);
    res.status(500).json({ error: 'Failed to get file statuses', details: error.message });
  }
});

router.get('/stats/overview', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await FileStatusService.getFileStatusStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error getting file status statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics', details: error.message });
  }
});

router.get('/:filename', authenticateToken, attachActiveOp, async (req, res) => {
  try {
    const { filename } = req.params;
    const { hostname, internal_ip } = req.query;
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.activeOperationTagId;
    if (!isAdmin && !operationTagId) return res.status(404).json({ error: 'File not found' });

    if (hostname || internal_ip) {
      const file = await FileStatusService.getFileByName(filename, hostname, internal_ip, operationTagId, isAdmin);
      if (!file) return res.status(404).json({ error: 'File not found' });
      return res.json(file);
    }

    const files = await FileStatusService.getFilesByName(filename, operationTagId, isAdmin);
    if (!files || files.length === 0) return res.status(404).json({ error: 'File not found' });
    if (files.length === 1) return res.json(files[0]);
    res.json({ multiple: true, count: files.length, files });
  } catch (error) {
    console.error('Error getting file details:', error);
    res.status(500).json({ error: 'Failed to get file details', details: error.message });
  }
});

module.exports = router;
