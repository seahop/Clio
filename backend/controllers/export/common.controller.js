// backend/controllers/export/common.controller.js
const fs = require('fs').promises;
const path = require('path');
const eventLogger = require('../../lib/eventLogger');
const fileUtils = require('../../utils/export/file-utils');

// Get available columns for export
const getExportColumns = async (req, res) => {
  try {
    // Query to get column names from the logs table
    const query = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'logs'
      ORDER BY ordinal_position;
    `;
    
    const db = require('../../db');
    const result = await db.query(query);
    
    // Process column info
    const columns = result.rows.map(col => ({
      name: col.column_name,
      type: col.data_type,
      // Mark sensitive fields to help UI
      sensitive: ['secrets'].includes(col.column_name),
      // Recommend some columns by default
      recommended: ['id', 'timestamp', 'hostname', 'domain', 'username', 'command', 'filename', 'status', 'analyst'].includes(col.column_name)
    }));
    
    res.json(columns);
  } catch (error) {
    console.error('Error fetching columns:', error);
    res.status(500).json({ error: 'Failed to fetch columns', details: error.message });
  }
};

// List existing exports
const listExports = async (req, res) => {
  try {
    const exportDir = path.join(__dirname, '../../exports');
    
    // Check if directory exists
    try {
      await fs.access(exportDir);
    } catch (err) {
      // Create directory if it doesn't exist
      await fs.mkdir(exportDir, { recursive: true });
      return res.json([]);
    }
    
    // Read directory
    const files = await fs.readdir(exportDir);
    
    // Filter out .gitkeep file and temporary folders/files
    const filteredFiles = files.filter(file => {
      // Skip .gitkeep file
      if (file === '.gitkeep') return false;
      
      // Skip temporary evidence export folders
      if (file.startsWith('evidence_export_') && !file.endsWith('.zip')) return false;
      
      return true;
    });
    
    // Get file stats
    const fileStats = await Promise.all(
      filteredFiles.map(async (file) => {
        const filePath = path.join(exportDir, file);
        const stats = await fs.stat(filePath);
        
        // Force current timestamp if we get an invalid date
        // This is a more direct fix for the epoch time issue
        let createdTime = new Date();
        let modifiedTime = new Date();
        
        try {
          // Stats.mtime is typically more reliable than birthtime across different filesystems
          if (stats.mtime && stats.mtime instanceof Date && !isNaN(stats.mtime.getTime())) {
            modifiedTime = stats.mtime;
          }
          
          if (stats.birthtime && stats.birthtime instanceof Date && !isNaN(stats.birthtime.getTime())) {
            createdTime = stats.birthtime;
          } else {
            // Fallback to mtime if birthtime is invalid
            createdTime = modifiedTime;
          }
        } catch (err) {
          console.log(`Date error for file ${file}:`, err);
          // Keep the default current date
        }
        
        // Use a timestamp for sorting
        const timestamp = createdTime.getTime();
        
        return {
          name: file,
          path: filePath.replace(/\\/g, '/'), // Normalize path for display
          size: stats.size,
          created: createdTime.toISOString(),
          modified: modifiedTime.toISOString(),
          timestamp: timestamp, // Additional field for reliable sorting
          // Set a type flag for evidence exports
          type: file.endsWith('.zip') ? 'evidence' : 'csv'
        };
      })
    );
    
    // Return sorted by newest first using the numeric timestamp
    res.json(fileStats.sort((a, b) => b.timestamp - a.timestamp));
  } catch (error) {
    console.error('Error listing exports:', error);
    res.status(500).json({ error: 'Failed to list exports', details: error.message });
  }
};

// Delete an export
const deleteExport = async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent path traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const exportDir = path.join(__dirname, '../../exports');
    const filePath = path.join(exportDir, filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (err) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete file
    await fs.unlink(filePath);
    
    // Log the deletion
    await eventLogger.logAuditEvent('export_delete', req.user.username, {
      filename,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Export deleted successfully' });
  } catch (error) {
    console.error('Error deleting export:', error);
    res.status(500).json({ error: 'Failed to delete export', details: error.message });
  }
};

module.exports = {
  getExportColumns,
  listExports,
  deleteExport
};