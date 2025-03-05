// routes/export.routes.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const db = require('../db');
const eventLogger = require('../lib/eventLogger');
const { redactSensitiveData } = require('../utils/sanitize');
const archiver = require('archiver');
const EvidenceModel = require('../models/evidence');

const { createWriteStream } = require('fs');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

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

// New route to add to backend/routes/export.routes.js

// New route: Export logs with evidence
router.post('/evidence', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    const { selectedColumns = [], includeEvidence = true } = req.body;
    
    if (!selectedColumns || !selectedColumns.length) {
      return res.status(400).json({ error: 'No columns selected for export' });
    }

    // Generate a unique export ID and timestamp
    const exportId = new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 5);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Create export directories
    const exportDir = path.join(__dirname, '../exports');
    const exportPackageDir = path.join(exportDir, `evidence_export_${exportId}`);
    const evidenceDir = path.join(exportPackageDir, 'evidence');
    const zipFilename = `evidence_export_${timestamp}.zip`;
    const zipFilePath = path.join(exportDir, zipFilename);
    
    // Create directories
    await fs.mkdir(exportDir, { recursive: true });
    await fs.mkdir(exportPackageDir, { recursive: true });
    await fs.mkdir(evidenceDir, { recursive: true });

    // 1. Export logs to JSON with IDs to allow evidence correlation
    const logsQuery = `SELECT id, ${selectedColumns.join(', ')} FROM logs ORDER BY timestamp DESC`;
    const logsResult = await db.query(logsQuery);
    
    // 2. Get all evidence files if requested
    let evidenceFiles = [];
    let logsWithEvidenceCount = 0;
    
    if (includeEvidence) {
      // Get all log IDs
      const logIds = logsResult.rows.map(log => log.id);
      
      // Fetch all evidence files for these logs
      for (const logId of logIds) {
        const files = await EvidenceModel.getEvidenceFilesByLogId(logId);
        if (files && files.length > 0) {
          evidenceFiles.push(...files);
          logsWithEvidenceCount++;
        }
      }
    }
    
    // 3. Save logs to JSON file
    const logsFilePath = path.join(exportPackageDir, 'logs.json');
    await fs.writeFile(
      logsFilePath, 
      JSON.stringify(
        { 
          exportDate: new Date().toISOString(),
          logs: logsResult.rows,
          totalLogs: logsResult.rows.length,
          logsWithEvidence: logsWithEvidenceCount,
          totalEvidenceFiles: evidenceFiles.length
        }, 
        null, 
        2
      )
    );
    
    // 4. Create CSV version too
    const csvFilePath = path.join(exportPackageDir, 'logs.csv');
    const header = ['id', ...selectedColumns].join(',') + '\n';
    let csvContent = header;

    // Process each row for CSV
    for (const row of logsResult.rows) {
      const csvRow = ['id', ...selectedColumns].map(col => {
        if (col === 'timestamp' && row[col]) {
          return `"${new Date(row[col]).toISOString()}"`;
        }
        
        if (row[col] === null || row[col] === undefined) {
          return '';
        }
        
        const value = String(row[col]).replace(/"/g, '""');
        return `"${value}"`;
      }).join(',');
      
      csvContent += csvRow + '\n';
    }
    
    await fs.writeFile(csvFilePath, csvContent);
    
    // 5. Copy evidence files
    const evidenceManifest = [];
    
    if (includeEvidence && evidenceFiles.length > 0) {
      for (const file of evidenceFiles) {
        try {
          // Create a safer filename that includes the original log ID
          const safeFilename = `log_${file.log_id}_evidence_${file.id}_${path.basename(file.filename)}`;
          const targetPath = path.join(evidenceDir, safeFilename);
          
          // Copy the file
          await fs.copyFile(file.filepath, targetPath);
          
          // Add to manifest
          evidenceManifest.push({
            id: file.id,
            log_id: file.log_id,
            original_filename: file.original_filename,
            export_filename: safeFilename,
            file_type: file.file_type,
            file_size: file.file_size,
            upload_date: file.upload_date,
            uploaded_by: file.uploaded_by,
            description: file.description
          });
        } catch (err) {
          console.error(`Error copying evidence file ${file.id}:`, err);
          // Continue with other files
        }
      }
      
      // Save evidence manifest
      const manifestPath = path.join(exportPackageDir, 'evidence_manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(evidenceManifest, null, 2));
    }
    
    // 6. Create an HTML report for easy viewing
    await createHtmlReport(exportPackageDir, logsResult.rows, evidenceManifest, selectedColumns);
    
    // 7. Create a ZIP archive of the entire directory
    const output = createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    archive.on('error', err => {
      throw err;
    });
    
    archive.pipe(output);
    archive.directory(exportPackageDir, false);
    await archive.finalize();
    
    // 8. Clean up the temporary export directory
    setTimeout(async () => {
      try {
        await fs.rm(exportPackageDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Error removing temporary export directory:', err);
      }
    }, 5000); // Wait 5 seconds before cleanup
    
    // 9. Log the export event
    await eventLogger.logAuditEvent('evidence_export', req.user.username, {
      exportId,
      selectedColumns,
      logCount: logsResult.rows.length,
      evidenceCount: evidenceManifest.length,
      timestamp: new Date().toISOString()
    });
    
    // 10. Return success response
    res.json({
      success: true,
      message: 'Evidence export completed successfully',
      details: {
        filePath: zipFilePath.replace(/\\/g, '/'), // Normalize path for display
        filename: zipFilename,
        logCount: logsResult.rows.length,
        evidenceCount: evidenceManifest.length,
        logsWithEvidenceCount,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error exporting evidence:', error);
    await eventLogger.logDataEvent('evidence_export_error', req.user.username, {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Failed to export evidence', details: error.message });
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

// Helper function to create an HTML report
// Updated HTML report generation function with requested changes

async function createHtmlReport(exportDir, logs, evidenceManifest, selectedColumns) {
  try {
    // Group evidence by log ID for easier lookup
    const evidenceByLogId = evidenceManifest.reduce((acc, evidence) => {
      if (!acc[evidence.log_id]) {
        acc[evidence.log_id] = [];
      }
      acc[evidence.log_id].push(evidence);
      return acc;
    }, {});
    
    // Create HTML content
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Clio Logging Export</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        h1, h2, h3 {
          color: #2c3e50;
        }
        .header {
          background-color: #263144;
          color: white;
          padding: 20px;
          border-radius: 5px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .header h1 {
          color: #ffffff;
          font-size: 28px;
          margin-bottom: 5px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
        .header p {
          color: #e0e0e0;
          margin-top: 5px;
          font-size: 15px;
        }
        .log-entry {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .log-header {
          background-color: #f9f9f9;
          padding: 10px;
          margin: -15px -15px 15px -15px;
          border-bottom: 1px solid #ddd;
          border-radius: 5px 5px 0 0;
        }
        .log-data {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 10px;
        }
        .log-field {
          margin-bottom: 5px;
        }
        .field-name {
          font-weight: bold;
          color: #7f8c8d;
        }
        .field-value {
          font-family: monospace;
          background-color: #f9f9f9;
          padding: 3px 6px;
          border-radius: 3px;
          word-break: break-all;
        }
        .evidence-section {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px dashed #ddd;
        }
        .evidence-items {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }
        .evidence-item {
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 10px;
          background-color: #f9f9f9;
        }
        .evidence-thumbnail {
          text-align: center;
          margin-bottom: 10px;
        }
        .evidence-thumbnail img {
          max-width: 100%;
          max-height: 100px;
          border-radius: 3px;
        }
        .thumbnail-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100px;
          background-color: #ecf0f1;
          color: #7f8c8d;
          font-size: 24px;
          border-radius: 3px;
        }
        .evidence-meta {
          font-size: 12px;
          color: #7f8c8d;
        }
        .status-indicator {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .status-on-disk { background-color: #f1c40f; color: #fff; }
        .status-in-memory { background-color: #3498db; color: #fff; }
        .status-encrypted { background-color: #9b59b6; color: #fff; }
        .status-removed { background-color: #e74c3c; color: #fff; }
        .status-cleaned { background-color: #2ecc71; color: #fff; }
        .status-dormant { background-color: #95a5a6; color: #fff; }
        .status-detected { background-color: #e67e22; color: #fff; }
        .status-unknown { background-color: #7f8c8d; color: #fff; }
        .export-info {
          background-color: #d5e9f5;
          padding: 10px 15px;
          border-radius: 5px;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .tab-container {
          margin-top: 20px;
        }
        .tab-buttons {
          display: flex;
          border-bottom: 1px solid #ddd;
          margin-bottom: 15px;
        }
        .tab-button {
          padding: 8px 16px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-weight: bold;
          color: #7f8c8d;
        }
        .tab-button.active {
          border-bottom-color: #3498db;
          color: #3498db;
        }
        .tab-content {
          display: none;
        }
        .tab-content.active {
          display: block;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        table, th, td {
          border: 1px solid #ddd;
        }
        th, td {
          padding: 8px 12px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .btn {
          display: inline-block;
          padding: 6px 12px;
          background-color: #3498db;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-size: 12px;
          text-align: center;
          margin-top: 5px;
          border: none;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        .btn:hover {
          background-color: #2980b9;
        }
        .btn-view {
          background-color: #3498db;
        }
        .btn-view:hover {
          background-color: #2980b9;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Clio Logging Export</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>
      
      <div class="export-info">
        <strong>Export Summary:</strong>
        <ul>
          <li>Total Logs: ${logs.length}</li>
          <li>Total Evidence Files: ${evidenceManifest.length}</li>
          <li>Logs with Evidence: ${Object.keys(evidenceByLogId).length}</li>
        </ul>
      </div>
      
      <div class="tab-container">
        <div class="tab-buttons">
          <button class="tab-button active" onclick="openTab(event, 'tab-logs')">Logs View</button>
          <button class="tab-button" onclick="openTab(event, 'tab-table')">Table View</button>
          <button class="tab-button" onclick="openTab(event, 'tab-evidence')">Evidence Gallery</button>
        </div>
        
        <div id="tab-logs" class="tab-content active">
          <h2>Logs with Evidence</h2>
    `;
    
    // Add each log entry
    logs.forEach(log => {
      const hasEvidence = evidenceByLogId[log.id] && evidenceByLogId[log.id].length > 0;
      const evidenceCount = hasEvidence ? evidenceByLogId[log.id].length : 0;
      
      // Skip logs without evidence in the card view
      if (!hasEvidence) return;
      
      const logDate = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown Date';
      let statusClass = 'status-unknown';
      
      if (log.status) {
        statusClass = `status-${log.status.toLowerCase().replace('_', '-')}`;
      }
      
      htmlContent += `
        <div class="log-entry" id="log-${log.id}">
          <div class="log-header">
            <h3>Log #${log.id} - ${logDate}</h3>
            ${log.status ? `<span class="status-indicator ${statusClass}">${log.status}</span>` : ''}
            ${hasEvidence ? `<span style="float: right;">${evidenceCount} Evidence Files</span>` : ''}
          </div>
          
          <div class="log-data">
      `;
      
      // Add log fields
      selectedColumns.forEach(column => {
        if (log[column] !== undefined && log[column] !== null) {
          let displayValue = log[column];
          
          // Format timestamp
          if (column === 'timestamp' && displayValue) {
            displayValue = new Date(displayValue).toLocaleString();
          }
          
          htmlContent += `
            <div class="log-field">
              <div class="field-name">${column}:</div>
              <div class="field-value">${displayValue}</div>
            </div>
          `;
        }
      });
      
      htmlContent += `
          </div>
      `;
      
      // Add evidence section if there is any
      if (hasEvidence) {
        htmlContent += `
          <div class="evidence-section">
            <h4>Evidence Files (${evidenceCount})</h4>
            <div class="evidence-items">
        `;
        
        evidenceByLogId[log.id].forEach(evidence => {
          const isImage = evidence.file_type && evidence.file_type.startsWith('image/');
          
          htmlContent += `
            <div class="evidence-item">
              <div class="evidence-thumbnail">
          `;
          
          if (isImage) {
            htmlContent += `
              <img src="evidence/${evidence.export_filename}" alt="${evidence.original_filename}">
            `;
          } else {
            // For non-images, show a placeholder with file extension
            const fileExt = path.extname(evidence.original_filename).toUpperCase().substring(1);
            htmlContent += `
              <div class="thumbnail-placeholder">
                ${fileExt || 'FILE'}
              </div>
            `;
          }
          
          htmlContent += `
              </div>
              <div>${evidence.original_filename}</div>
              <div class="evidence-meta">
                ${evidence.file_type || 'Unknown Type'} - ${formatFileSize(evidence.file_size)}
              </div>
              <div class="evidence-meta">
                Uploaded by ${evidence.uploaded_by} on ${new Date(evidence.upload_date).toLocaleString()}
              </div>
              ${evidence.description ? `<div class="evidence-meta">${evidence.description}</div>` : ''}
              <a href="evidence/${evidence.export_filename}" class="btn btn-view" target="_blank">View File</a>
            </div>
          `;
        });
        
        htmlContent += `
            </div>
          </div>
        `;
      }
      
      htmlContent += `
        </div>
      `;
    });
    
    // Add table view tab
    htmlContent += `
        </div>
        
        <div id="tab-table" class="tab-content">
          <h2>Logs Table (All ${logs.length} logs)</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                ${selectedColumns.map(col => `<th>${col}</th>`).join('')}
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    logs.forEach(log => {
      const hasEvidence = evidenceByLogId[log.id] && evidenceByLogId[log.id].length > 0;
      const evidenceCount = hasEvidence ? evidenceByLogId[log.id].length : 0;
      
      htmlContent += `
        <tr>
          <td><a href="#log-${log.id}">${log.id}</a></td>
      `;
      
      selectedColumns.forEach(column => {
        let displayValue = log[column] !== undefined && log[column] !== null ? log[column] : '';
        
        // Format timestamp
        if (column === 'timestamp' && displayValue) {
          displayValue = new Date(displayValue).toLocaleString();
        }
        
        // Add status indicator
        if (column === 'status' && displayValue) {
          const statusClass = `status-${displayValue.toLowerCase().replace('_', '-')}`;
          displayValue = `<span class="status-indicator ${statusClass}">${displayValue}</span>`;
        }
        
        htmlContent += `<td>${displayValue}</td>`;
      });
      
      htmlContent += `
          <td>${evidenceCount > 0 ? `<a href="#log-${log.id}">${evidenceCount} files</a>` : 'None'}</td>
        </tr>
      `;
    });
    
    htmlContent += `
            </tbody>
          </table>
        </div>
        
        <div id="tab-evidence" class="tab-content">
          <h2>Evidence Gallery (${evidenceManifest.length} files)</h2>
          
          <div class="evidence-items">
    `;
    
    // Add evidence gallery
    evidenceManifest.forEach(evidence => {
      const isImage = evidence.file_type && evidence.file_type.startsWith('image/');
      
      htmlContent += `
        <div class="evidence-item">
          <div class="evidence-thumbnail">
      `;
      
      if (isImage) {
        htmlContent += `
          <img src="evidence/${evidence.export_filename}" alt="${evidence.original_filename}">
        `;
      } else {
        // For non-images, show a placeholder with file extension
        const fileExt = path.extname(evidence.original_filename).toUpperCase().substring(1);
        htmlContent += `
          <div class="thumbnail-placeholder">
            ${fileExt || 'FILE'}
          </div>
        `;
      }
      
      htmlContent += `
          </div>
          <div>${evidence.original_filename}</div>
          <div class="evidence-meta">
            For Log <a href="#log-${evidence.log_id}">#${evidence.log_id}</a>
          </div>
          <div class="evidence-meta">
            ${evidence.file_type || 'Unknown Type'} - ${formatFileSize(evidence.file_size)}
          </div>
          <div class="evidence-meta">
            Uploaded by ${evidence.uploaded_by} on ${new Date(evidence.upload_date).toLocaleString()}
          </div>
          ${evidence.description ? `<div class="evidence-meta">${evidence.description}</div>` : ''}
          <a href="evidence/${evidence.export_filename}" class="btn btn-view" target="_blank">View File</a>
        </div>
      `;
    });
    
    // Close the HTML
    htmlContent += `
          </div>
        </div>
      </div>
      
      <script>
        function openTab(evt, tabName) {
          // Hide all tab contents
          var tabContents = document.getElementsByClassName("tab-content");
          for (var i = 0; i < tabContents.length; i++) {
            tabContents[i].classList.remove("active");
          }
          
          // Remove active class from all tab buttons
          var tabButtons = document.getElementsByClassName("tab-button");
          for (var i = 0; i < tabButtons.length; i++) {
            tabButtons[i].classList.remove("active");
          }
          
          // Show the specific tab content
          document.getElementById(tabName).classList.add("active");
          
          // Add active class to the button that opened the tab
          evt.currentTarget.classList.add("active");
        }
        
        // Check if there's a hash in the URL and scroll to that element
        document.addEventListener('DOMContentLoaded', function() {
          if (window.location.hash) {
            const element = document.querySelector(window.location.hash);
            if (element) {
              element.scrollIntoView();
            }
          }
        });
      </script>
    </body>
    </html>
    `;
    
    // Write the HTML file
    const htmlFilePath = path.join(exportDir, 'index.html');
    await fs.writeFile(htmlFilePath, htmlContent);
    
    return htmlFilePath;
  } catch (error) {
    console.error('Error creating HTML report:', error);
    throw error;
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

module.exports = router;