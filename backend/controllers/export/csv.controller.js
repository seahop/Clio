// backend/controllers/export/csv.controller.js
const fs = require('fs').promises;
const path = require('path');
const db = require('../../db');
const eventLogger = require('../../lib/eventLogger');
const csvService = require('../../services/export/csv.service');

// Export logs as CSV
const exportCsv = async (req, res) => {
  try {
    const { selectedColumns = [] } = req.body;
    
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
    
    // Generate CSV content
    const csvContent = await csvService.generateCsv(result.rows, selectedColumns);
    
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
};

module.exports = {
  exportCsv
};