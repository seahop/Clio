// relation-service/src/routes/fileStatus.js
const express = require('express');
const router = express.Router();
const FileStatusService = require('../services/fileStatusService');
const { authenticateToken, verifyAdmin } = require('../middleware/auth.middleware');

// Get all file statuses
router.get('/', authenticateToken, async (req, res) => {
  try {
    const files = await FileStatusService.getAllFileStatuses();
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
    
    const files = await FileStatusService.getFileStatusesByStatus(normalizedStatus);
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
    const file = await FileStatusService.getFileByName(filename);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json(file);
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