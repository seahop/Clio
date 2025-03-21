// routes/logs-health.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const fs = require('fs').promises;
const path = require('path');
const logRotationManager = require('../lib/logRotation');

// Utility function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
};

// Utility function to format duration
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
};

// Health check endpoint with log status and S3 info
router.get('/', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    // Get log file statuses
    const logFiles = ['security_logs.json', 'data_logs.json', 'system_logs.json', 'audit_logs.json'];
    const logStatuses = await Promise.all(logFiles.map(async (fileName) => {
      const filePath = path.join(__dirname, '../data', fileName);
      
      try {
        const stats = await fs.stat(filePath);
        const fileContent = await fs.readFile(filePath, 'utf8');
        let logs = [];
        
        try {
          logs = JSON.parse(fileContent);
        } catch (error) {
          return {
            file: fileName,
            status: 'corrupted',
            error: error.message,
            size: stats.size,
            lastModified: stats.mtime
          };
        }
        
        return {
          file: fileName,
          status: 'ok',
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size),
          lastModified: stats.mtime,
          logCount: Array.isArray(logs) ? logs.length : 'invalid',
          percentFull: Array.isArray(logs) ? Math.round((logs.length / logRotationManager.maxLogsPerFile) * 100) : 0
        };
      } catch (error) {
        return {
          file: fileName,
          status: 'error',
          error: error.message
        };
      }
    }));
    
    // Get archive information
    const archiveDir = path.join(__dirname, '../data/archives');
    let archives = [];
    
    try {
      await fs.access(archiveDir);
      const archiveFiles = await fs.readdir(archiveDir);
      
      // Get stats for zip files only
      const archiveStats = await Promise.all(
        archiveFiles
          .filter(file => file.endsWith('.zip'))
          .map(async (file) => {
            const filePath = path.join(archiveDir, file);
            const stats = await fs.stat(filePath);
            
            // Get S3 upload status if available
            const s3Status = logRotationManager.getS3UploadStatus ? 
              logRotationManager.getS3UploadStatus(file) : null;
            
            return {
              file,
              size: stats.size,
              sizeFormatted: formatFileSize(stats.size),
              created: stats.mtime,
              s3Uploaded: s3Status?.status === 'success',
              s3Status: s3Status?.status || null,
              s3Details: s3Status || null
            };
          })
      );
      
      archives = archiveStats.sort((a, b) => b.created - a.created);
    } catch (error) {
      console.error('Error reading archives:', error);
    }
    
    // Get log rotation information
    const logRotationInfo = {
      isInitialized: logRotationManager.isInitialized,
      rotationInterval: logRotationManager.rotationInterval,
      rotationIntervalFormatted: formatDuration(logRotationManager.rotationInterval),
      maxLogsPerFile: logRotationManager.maxLogsPerFile
    };
    
    // Check S3 configuration status - UPDATED PATH TO DATA DIRECTORY
    let s3Enabled = false;
    try {
      const s3ConfigPath = path.join(__dirname, '../data/s3-config.json');
      await fs.access(s3ConfigPath);
      const s3ConfigData = await fs.readFile(s3ConfigPath, 'utf8');
      const s3Config = JSON.parse(s3ConfigData);
      s3Enabled = s3Config.enabled || false;
    } catch (error) {
      // S3 config not found or invalid, leave s3Enabled as false
      console.log('S3 config not found or invalid');
    }
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      logs: logStatuses,
      archives: archives.slice(0, 10), // Show only the 10 most recent archives
      totalArchives: archives.length,
      logRotation: logRotationInfo,
      s3Export: {
        enabled: s3Enabled
      }
    });
  } catch (error) {
    console.error('Error getting log status:', error);
    res.status(500).json({ error: 'Failed to get log status' });
  }
});

module.exports = router;