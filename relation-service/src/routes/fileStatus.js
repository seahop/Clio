// relation-service/src/routes/fileStatus.js
const express = require('express');
const router = express.Router();
const FileStatusService = require('../services/fileStatusService');
const { authenticateToken, verifyAdmin } = require('../middleware/auth.middleware');

// Get all file statuses
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get operation filtering context
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.user.activeOperation?.tag_id;

    // Non-admin users must have an active operation
    if (!isAdmin && !operationTagId) {
      return res.json([]);
    }

    const files = await FileStatusService.getAllFileStatuses(operationTagId, isAdmin);
    res.json(files);
  } catch (error) {
    console.error('Error getting file statuses:', error);
    res.status(500).json({ error: 'Failed to get file statuses', details: error.message });
  }
});

// Get file statuses by status
router.get('/status/:status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = [
      'ON_DISK', 'IN_MEMORY', 'ENCRYPTED', 'REMOVED',
      'CLEANED', 'DORMANT', 'DETECTED', 'UNKNOWN'
    ];

    // Allow case-insensitive status check
    const normalizedStatus = status.toUpperCase();

    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        error: 'Invalid status',
        validStatuses
      });
    }

    // Get operation filtering context
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.user.activeOperation?.tag_id;

    // Non-admin users must have an active operation
    if (!isAdmin && !operationTagId) {
      return res.json([]);
    }

    const files = await FileStatusService.getFileStatusesByStatus(normalizedStatus, operationTagId, isAdmin);
    res.json(files);
  } catch (error) {
    console.error('Error getting file statuses by status:', error);
    res.status(500).json({ error: 'Failed to get file statuses', details: error.message });
  }
});

// Get file details by filename
router.get('/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const { hostname, internal_ip } = req.query;

    // Get operation filtering context
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.user.activeOperation?.tag_id;

    // Non-admin users must have an active operation
    if (!isAdmin && !operationTagId) {
      return res.status(404).json({ error: 'File not found' });
    }

    // If hostname or IP is provided, get the specific file
    if (hostname || internal_ip) {
      const file = await FileStatusService.getFileByName(filename, hostname, internal_ip, operationTagId, isAdmin);

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.json(file);
    } else {
      // Otherwise get all files with that name
      const files = await FileStatusService.getFilesByName(filename, operationTagId, isAdmin);

      if (!files || files.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }

      // If there's only one file, return it directly for backward compatibility
      if (files.length === 1) {
        res.json(files[0]);
      } else {
        res.json({
          multiple: true,
          count: files.length,
          files: files
        });
      }
    }
  } catch (error) {
    console.error('Error getting file details:', error);
    res.status(500).json({ error: 'Failed to get file details', details: error.message });
  }
});

// Get file status statistics (admin only)
router.get('/stats/overview', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await FileStatusService.getFileStatusStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error getting file status statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics', details: error.message });
  }
});

module.exports = router;