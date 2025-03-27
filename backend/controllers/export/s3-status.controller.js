// backend/controllers/export/s3-status.controller.js
const fs = require('fs').promises;
const path = require('path');
const eventLogger = require('../../lib/eventLogger');

// Path to store S3 upload status for exports
const S3_STATUS_PATH = path.join(__dirname, '../../data/export-s3-status.json');

// Ensure the S3 status file exists
const ensureStatusFile = async () => {
  try {
    await fs.access(S3_STATUS_PATH);
  } catch (error) {
    // File doesn't exist, create it with an empty object
    await fs.writeFile(S3_STATUS_PATH, JSON.stringify({}), 'utf8');
  }
};

// Get S3 upload status for all exports
const getExportS3Status = async (req, res) => {
  try {
    await ensureStatusFile();
    
    // Read the status file
    const statusData = await fs.readFile(S3_STATUS_PATH, 'utf8');
    const status = JSON.parse(statusData);
    
    res.json(status);
  } catch (error) {
    console.error('Error getting export S3 status:', error);
    res.status(500).json({ error: 'Failed to get export S3 status' });
  }
};

// Update S3 upload status for an export
const updateExportS3Status = async (req, res) => {
  try {
    const { filename, status, details = {} } = req.body;
    
    if (!filename || !status) {
      return res.status(400).json({ error: 'Filename and status are required' });
    }
    
    await ensureStatusFile();
    
    // Read current status data
    const statusData = await fs.readFile(S3_STATUS_PATH, 'utf8');
    const statusMap = JSON.parse(statusData);
    
    // Update status for this file
    statusMap[filename] = {
      status,
      details,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.username
    };
    
    // Write the updated status back to the file
    await fs.writeFile(S3_STATUS_PATH, JSON.stringify(statusMap, null, 2), 'utf8');
    
    // Log the status update
    await eventLogger.logAuditEvent('export_s3_status_update', req.user.username, {
      filename,
      status,
      details,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: `S3 upload status for ${filename} updated to ${status}`
    });
  } catch (error) {
    console.error('Error updating export S3 status:', error);
    res.status(500).json({ error: 'Failed to update export S3 status' });
  }
};

module.exports = {
  getExportS3Status,
  updateExportS3Status
};