// backend/controllers/export/csv.controller.js
const fs = require('fs').promises;
const path = require('path');
const db = require('../../db');
const eventLogger = require('../../lib/eventLogger');
const csvService = require('../../services/export/csv.service');
const LogsModel = require('../../models/logs');
const OperationsModel = require('../../models/operations');

const exportCsv = async (req, res) => {
  try {
    const { selectedColumns = [], decryptSensitiveData = false } = req.body;

    if (!selectedColumns || !selectedColumns.length) {
      return res.status(400).json({ error: 'No columns selected for export' });
    }

    const isAdmin = req.user.role === 'admin';
    const username = req.user.username;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(__dirname, '../../exports');
    const filename = `logs_export_${timestamp}.csv`;
    const filePath = path.join(exportDir, filename);

    await fs.mkdir(exportDir, { recursive: true });

    // Prefix column names with the table alias to avoid ambiguity when joining
    const columnsStr = selectedColumns.map(c => `l.${c}`).join(', ');

    let result;
    if (isAdmin) {
      result = await db.query(
        `SELECT ${columnsStr} FROM logs l ORDER BY l.timestamp DESC`
      );
    } else {
      // Scope to the operator's active operation
      const activeOp = await OperationsModel.getUserActiveOperation(username);
      if (!activeOp || !activeOp.tag_id) {
        return res.status(403).json({
          error: 'No active operation',
          detail: 'Set an active operation before exporting.'
        });
      }
      result = await db.query(
        `SELECT ${columnsStr}
         FROM logs l
         INNER JOIN log_tags lt ON lt.log_id = l.id AND lt.tag_id = $1
         ORDER BY l.timestamp DESC`,
        [activeOp.tag_id]
      );
    }

    let processedRows = result.rows;

    if (decryptSensitiveData) {
      processedRows = LogsModel._processMultipleFromStorage(result.rows);
      await eventLogger.logAuditEvent('decrypt_sensitive_export', username, {
        exportedColumns: selectedColumns,
        timestamp: new Date().toISOString()
      });
    }

    const csvContent = await csvService.generateCsv(processedRows, selectedColumns);
    await fs.writeFile(filePath, csvContent);

    await eventLogger.logAuditEvent('csv_export', username, {
      exportedColumns: selectedColumns,
      decryptedFields: decryptSensitiveData,
      rowCount: processedRows.length,
      filename,
      isAdmin,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Export completed successfully',
      details: {
        filePath: filePath.replace(/\\/g, '/'),
        filename,
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

module.exports = { exportCsv };
