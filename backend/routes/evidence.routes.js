// File path: backend/routes/evidence.routes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const EvidenceModel = require('../models/evidence');
const LogsModel = require('../models/logs');
const eventLogger = require('../lib/eventLogger');
const { authenticateJwt } = require('../middleware/jwt.middleware');
const { sanitizeRequestMiddleware } = require('../middleware/sanitize.middleware');

// Create evidence directory if it doesn't exist
const createEvidenceDir = async () => {
  const evidenceDir = path.join(__dirname, '../evidence');
  try {
    await fs.mkdir(evidenceDir, { recursive: true });
    console.log('Evidence directory created or already exists');
  } catch (error) {
    console.error('Error creating evidence directory:', error);
  }
};

// Call this at startup
createEvidenceDir();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../evidence');
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate a secure random filename to prevent path traversal attacks
    const randomName = crypto.randomBytes(16).toString('hex');
    const fileExt = path.extname(file.originalname);
    cb(null, `${randomName}${fileExt}`);
  }
});

// File filter to restrict file types
const fileFilter = (req, file, cb) => {
  // Allowed file types - adjust as needed for your use case
  const allowedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'application/pdf',
    'text/plain',
    'application/vnd.tcpdump.pcap',
    'application/octet-stream'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, PDF, TXT, and PCAP files are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files per upload
  },
  fileFilter: fileFilter
});

// Validate log ownership before allowing uploads
const validateLogAccess = async (req, res, next) => {
  try {
    const logId = parseInt(req.params.logId);
    
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log ID' });
    }
    
    // Get the log to verify it exists
    const log = await LogsModel.getLogById(logId);
    
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    
    // Check if the log is locked and by whom
    if (log.locked && log.locked_by !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied',
        detail: `This log is locked by ${log.locked_by}`
      });
    }
    
    // All checks passed, proceed
    next();
  } catch (error) {
    console.error('Error validating log access:', error);
    res.status(500).json({ error: 'Failed to validate log access' });
  }
};

// Get all evidence files for a log
router.get('/:logId', authenticateJwt, async (req, res) => {
  try {
    const logId = parseInt(req.params.logId);
    
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log ID' });
    }
    
    const evidenceFiles = await EvidenceModel.getEvidenceFilesByLogId(logId);
    
    // Log the access
    await eventLogger.logDataEvent('view_evidence', req.user.username, {
      logId,
      count: evidenceFiles.length,
      timestamp: new Date().toISOString()
    });
    
    res.json(evidenceFiles);
  } catch (error) {
    console.error('Error getting evidence files:', error);
    res.status(500).json({ error: 'Failed to get evidence files' });
  }
});

// Upload evidence file(s) for a log
router.post('/:logId/upload', authenticateJwt, validateLogAccess, upload.array('files', 5), async (req, res) => {
  try {
    const logId = parseInt(req.params.logId);
    const { description } = req.body;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedFiles = [];
    
    // Process each uploaded file
    for (const file of req.files) {
      // Calculate MD5 hash
      const md5Hash = await EvidenceModel.calculateMD5(file.path);
      
      // Create database record
      const evidenceFile = await EvidenceModel.createEvidenceFile({
        log_id: logId,
        filename: file.filename,
        original_filename: file.originalname,
        file_type: file.mimetype,
        file_size: file.size,
        uploaded_by: req.user.username,
        description: description || null,
        md5_hash: md5Hash,
        filepath: file.path,
        metadata: {
          upload_ip: req.ip,
          user_agent: req.headers['user-agent']
        }
      });
      
      uploadedFiles.push(evidenceFile);
    }
    
    // Log the upload
    await eventLogger.logDataEvent('upload_evidence', req.user.username, {
      logId,
      fileCount: uploadedFiles.length,
      fileIds: uploadedFiles.map(file => file.id),
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Error uploading evidence files:', error);
    // Clean up any uploaded files if an error occurs
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file after upload failure:', unlinkError);
        }
      }
    }
    res.status(500).json({ error: 'Failed to upload evidence files' });
  }
});

// Get a specific evidence file
router.get('/file/:fileId', authenticateJwt, async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    
    if (isNaN(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }
    
    const evidenceFile = await EvidenceModel.getEvidenceFileById(fileId);
    
    if (!evidenceFile) {
      return res.status(404).json({ error: 'Evidence file not found' });
    }
    
    // Log the access
    await eventLogger.logDataEvent('view_evidence_file', req.user.username, {
      fileId,
      logId: evidenceFile.log_id,
      filename: evidenceFile.original_filename,
      timestamp: new Date().toISOString()
    });
    
    // Send the file
    res.sendFile(evidenceFile.filepath, {
      headers: {
        'Content-Type': evidenceFile.file_type,
        'Content-Disposition': `inline; filename="${evidenceFile.original_filename}"`
      }
    });
  } catch (error) {
    console.error('Error getting evidence file:', error);
    res.status(500).json({ error: 'Failed to get evidence file' });
  }
});

// Download a specific evidence file
router.get('/file/:fileId/download', authenticateJwt, async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    
    if (isNaN(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }
    
    const evidenceFile = await EvidenceModel.getEvidenceFileById(fileId);
    
    if (!evidenceFile) {
      return res.status(404).json({ error: 'Evidence file not found' });
    }
    
    // Log the download
    await eventLogger.logDataEvent('download_evidence', req.user.username, {
      fileId,
      logId: evidenceFile.log_id,
      filename: evidenceFile.original_filename,
      timestamp: new Date().toISOString()
    });
    
    // Send the file as attachment
    res.download(evidenceFile.filepath, evidenceFile.original_filename);
  } catch (error) {
    console.error('Error downloading evidence file:', error);
    res.status(500).json({ error: 'Failed to download evidence file' });
  }
});

// Update evidence file metadata
router.put('/file/:fileId', authenticateJwt, sanitizeRequestMiddleware, async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    
    if (isNaN(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }
    
    // Get the current file data to check permissions
    const evidenceFile = await EvidenceModel.getEvidenceFileById(fileId);
    
    if (!evidenceFile) {
      return res.status(404).json({ error: 'Evidence file not found' });
    }
    
    // Only allow the uploader or admins to update
    if (evidenceFile.uploaded_by !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to update this file' });
    }
    
    const updatedFile = await EvidenceModel.updateEvidenceFile(fileId, req.body);
    
    if (!updatedFile) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }
    
    // Log the update
    await eventLogger.logDataEvent('update_evidence', req.user.username, {
      fileId,
      logId: evidenceFile.log_id,
      changes: req.body,
      timestamp: new Date().toISOString()
    });
    
    res.json(updatedFile);
  } catch (error) {
    console.error('Error updating evidence file:', error);
    res.status(500).json({ error: 'Failed to update evidence file' });
  }
});

// Delete an evidence file
router.delete('/file/:fileId', authenticateJwt, async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    
    if (isNaN(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }
    
    // Get the current file data to check permissions
    const evidenceFile = await EvidenceModel.getEvidenceFileById(fileId);
    
    if (!evidenceFile) {
      return res.status(404).json({ error: 'Evidence file not found' });
    }
    
    // Only allow the uploader or admins to delete
    if (evidenceFile.uploaded_by !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to delete this file' });
    }
    
    // Delete the database record
    const deletedFile = await EvidenceModel.deleteEvidenceFile(fileId);
    
    // Delete the actual file
    try {
      await fs.unlink(deletedFile.filepath);
    } catch (unlinkError) {
      console.error('Error deleting evidence file from disk:', unlinkError);
      // Continue anyway, we've already removed the database record
    }
    
    // Log the deletion
    await eventLogger.logDataEvent('delete_evidence', req.user.username, {
      fileId,
      logId: evidenceFile.log_id,
      filename: evidenceFile.original_filename,
      timestamp: new Date().toISOString()
    });
    
    res.json({ message: 'Evidence file deleted successfully' });
  } catch (error) {
    console.error('Error deleting evidence file:', error);
    res.status(500).json({ error: 'Failed to delete evidence file' });
  }
});

module.exports = router;