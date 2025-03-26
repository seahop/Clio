// backend/controllers/export/csv.controller.js
const fs = require('fs').promises;
const path = require('path');
const db = require('../../db');
const eventLogger = require('../../lib/eventLogger');
const csvService = require('../../services/export/csv.service');
const LogsModel = require('../../models/logs');

// Export logs as CSV
const exportCsv = async (req, res) => {
  try {
    const { selectedColumns = [], decryptSensitiveData = false } = req.body;
    
    if (!selectedColumns || !selectedColumns.length) {
      return res.status(400).json({ error: 'No columns selected for export' });
    }

    // Generate a unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(__dirname, '../../exports');
    const filename = `logs_export_${timestamp}.csv`;
    const filePath = path.join(exportDir, filename);

    // Ensure export directory exists
    await fs.mkdir(exportDir, { recursive: true });

    // Create SQL query using only selected columns
    const columnsStr = selectedColumns.join(', ');
    const result = await db.query(`SELECT ${columnsStr} FROM logs ORDER BY timestamp DESC`);
    
    // Process the data - apply decryption if requested for sensitive fields
    let processedRows = result.rows;
    
    if (decryptSensitiveData) {
      console.log("Decrypting sensitive data for export...");
      // Use the LogsModel _processFromStorage to properly decrypt values
      processedRows = LogsModel._processMultipleFromStorage(result.rows);
      
      // Log this decryption event
      await eventLogger.logAuditEvent('decrypt_sensitive_export', req.user.username, {
        exportedColumns: selectedColumns,
        timestamp: new Date().toISOString()
      });
    }
    
    // Generate CSV content with processed data
    const csvContent = await csvService.generateCsv(processedRows, selectedColumns);
    
    // Write to file
    await fs.writeFile(filePath, csvContent);

    // Log the export event
    await eventLogger.logAuditEvent('csv_export', req.user.username, {
      exportedColumns: selectedColumns,
      decryptedFields: decryptSensitiveData,
      rowCount: processedRows.length,
      filename,
      timestamp: new Date().toISOString()
    });

    // Return the file path and info but don't send the file directly
    res.json({
      success: true,
      message: 'Export completed successfully',
      details: {
        filePath: filePath.replace(/\\/g, '/'), // Normalize path for display
        rowCount: processedRows.length,
        columnCount: selectedColumns.length,
        timestamp: new Date().toISOString(),
        includedDecryptedData: decryptSensitiveData
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
};

module.exports = {
  exportCsv
};