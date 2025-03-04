// routes/export.routes.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const db = require('../db');
const eventLogger = require('../lib/eventLogger');
const { redactSensitiveData } = require('../utils/sanitize');

// Export logs as CSV
router.post('/csv', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    const { selectedColumns = [] } = req.body;
    
    if (!selectedColumns || !selectedColumns.length) {
      return res.status(400).json({ error: 'No columns selected for export' });
    }

    // Generate a unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(__dirname, '../exports');
    const filename = `logs_export_${timestamp}.csv`;
    const filePath = path.join(exportDir, filename);

    // Ensure export directory exists
    await fs.mkdir(exportDir, { recursive: true });

    // Create SQL query using only selected columns
    const columnsStr = selectedColumns.join(', ');
    const result = await db.query(`SELECT ${columnsStr} FROM logs ORDER BY timestamp DESC`);
    
    // Convert to CSV
    const header = selectedColumns.join(',') + '\n';
    let csvContent = header;

    // Process each row
    for (const row of result.rows) {
      const csvRow = selectedColumns.map(col => {
        // Handle special cases
        if (col === 'timestamp' && row[col]) {
          return `"${new Date(row[col]).toISOString()}"`;
        }
        
        // Handle null values
        if (row[col] === null || row[col] === undefined) {
          return '';
        }
        
        // Escape quotes and wrap values in quotes
        const value = String(row[col]).replace(/"/g, '""');
        return `"${value}"`;
      }).join(',');
      
      csvContent += csvRow + '\n';
    }

    // Write to file
    await fs.writeFile(filePath, csvContent);

    // Log the export event
    await eventLogger.logAuditEvent('csv_export', req.user.username, {
      exportedColumns: selectedColumns,
      rowCount: result.rows.length,
      filename,
      timestamp: new Date().toISOString()
    });

    // Return the file path and info but don't send the file directly
    res.json({
      success: true,
      message: 'Export completed successfully',
      details: {
        filePath: filePath.replace(/\\/g, '/'), // Normalize path for display
        rowCount: result.rows.length,
        columnCount: selectedColumns.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error exporting logs to CSV:', error);
    await eventLogger.logDataEvent('export_error', req.user.username, {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Failed to export logs to CSV', details: error.message });
  }
});

// Get available columns for export
router.get('/columns', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    // Query to get column names from the logs table
    const query = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'logs'
      ORDER BY ordinal_position;
    `;
    
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
});

// List existing exports
router.get('/list', authenticateJwt, verifyAdmin, async (req, res) => {
    try {
      const exportDir = path.join(__dirname, '../exports');
      
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
      
      // Filter out the .gitkeep file
      const filteredFiles = files.filter(file => file !== '.gitkeep');
      
      // Get file stats
      const fileStats = await Promise.all(
        filteredFiles.map(async (file) => {
          const filePath = path.join(exportDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath.replace(/\\/g, '/'), // Normalize path for display
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
      );
      
      // Return sorted by newest first
      res.json(fileStats.sort((a, b) => b.created - a.created));
    } catch (error) {
      console.error('Error listing exports:', error);
      res.status(500).json({ error: 'Failed to list exports', details: error.message });
    }
  });

// Delete an export
router.delete('/:filename', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent path traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const exportDir = path.join(__dirname, '../exports');
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
});

module.exports = router;