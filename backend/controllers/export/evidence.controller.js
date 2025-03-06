// backend/controllers/export/evidence.controller.js
const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const archiver = require('archiver');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

const db = require('../../db');
const EvidenceModel = require('../../models/evidence');
const eventLogger = require('../../lib/eventLogger');
const evidenceService = require('../../services/export/evidence.service');
const htmlReportService = require('../../services/export/html-report.service');

// Export logs with evidence
const exportEvidence = async (req, res) => {
  try {
    const { selectedColumns = [], includeEvidence = true } = req.body;
    
    if (!selectedColumns || !selectedColumns.length) {
      return res.status(400).json({ error: 'No columns selected for export' });
    }

    // Generate a unique export ID and timestamp
    const exportId = new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 5);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Create export directories
    const exportDir = path.join(__dirname, '../../exports');
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
    
    // 4. Create CSV version too using the evidence service
    const csvFilePath = path.join(exportPackageDir, 'logs.csv');
    const csvContent = await evidenceService.generateCsvFromLogs(logsResult.rows, ['id', ...selectedColumns]);
    await fs.writeFile(csvFilePath, csvContent);
    
    // 5. Copy evidence files and create manifest
    const evidenceManifest = await evidenceService.processEvidenceFiles(
      evidenceFiles,
      evidenceDir
    );
    
    // 6. Create an HTML report for easy viewing
    await htmlReportService.createHtmlReport(
      exportPackageDir, 
      logsResult.rows, 
      evidenceManifest, 
      selectedColumns
    );
    
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
};

module.exports = {
  exportEvidence
};