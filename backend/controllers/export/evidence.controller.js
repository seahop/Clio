// backend/controllers/export/evidence.controller.js - Modified with encryption support
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { createWriteStream } = require('fs');
const archiver = require('archiver');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

const db = require('../../db');
const LogsModel = require('../../models/logs'); // Import for decryption
const EvidenceModel = require('../../models/evidence');
const RelationsModel = require('../../models/relations');
const OperationsModel = require('../../models/operations');
const eventLogger = require('../../lib/eventLogger');
const evidenceService = require('../../services/export/evidence.service');
const htmlReportService = require('../../services/export/html-report.service');

// Format relations the same way GET /api/relations/:type does, so exported
// JSON matches what the API serves
const formatRelationsForExport = (relations) => relations.map(relation => ({
  source: relation.source,
  type: relation.type,
  connections: relation.related.length,
  related: relation.related.map(r => ({
    target: r.target,
    type: r.type,
    strength: Math.round((r.strength / (r.connection_count || 1)) * 100),
    lastSeen: r.lastSeen,
    metadata: r.metadata
  }))
}));

// Export logs with evidence
const exportEvidence = async (req, res) => {
  try {
    const { 
      selectedColumns = [], 
      includeEvidence = true, 
      includeRelations = true,
      includeHashes = true,
      decryptSensitiveData = false // New option for decrypting sensitive data
    } = req.body;
    
    if (!selectedColumns || !selectedColumns.length) {
      return res.status(400).json({ error: 'No columns selected for export' });
    }

    // Only real logs columns may reach the SQL below
    const EXPORTABLE_COLUMNS = new Set([
      'timestamp', 'internal_ip', 'external_ip', 'mac_address', 'hostname',
      'domain', 'username', 'command', 'notes', 'filename', 'status',
      'secrets', 'hash_algorithm', 'hash_value', 'pid', 'analyst',
      'locked', 'locked_by', 'created_at', 'updated_at'
    ]);
    const validColumns = selectedColumns.filter(c => EXPORTABLE_COLUMNS.has(c));
    if (!validColumns.length) {
      return res.status(400).json({ error: 'No valid columns selected for export' });
    }

    // Generate a unique export ID and timestamp
    const exportId = new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 5);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Create export directories
    const exportDir = path.join(__dirname, '../../exports');
    const exportPackageDir = path.join(exportDir, `evidence_export_${exportId}`);
    const evidenceDir = path.join(exportPackageDir, 'evidence');
    const relationsDir = path.join(exportPackageDir, 'relations');
    const zipFilename = `evidence_export_${timestamp}_${crypto.randomBytes(8).toString('hex')}.zip`;
    const zipFilePath = path.join(exportDir, zipFilename);
    
    // Create directories
    await fs.mkdir(exportDir, { recursive: true });
    await fs.mkdir(exportPackageDir, { recursive: true });
    await fs.mkdir(evidenceDir, { recursive: true });
    
    if (includeRelations) {
      await fs.mkdir(relationsDir, { recursive: true });
    }

    // Make sure hash columns are included if requested
    let columnsToExport = [...validColumns];
    if (includeHashes) {
      // Add hash columns if they're not already selected
      if (!columnsToExport.includes('hash_algorithm')) {
        columnsToExport.push('hash_algorithm');
      }
      if (!columnsToExport.includes('hash_value')) {
        columnsToExport.push('hash_value');
      }
    }

    // 1. Export logs to JSON with IDs to allow evidence correlation
    const logsQuery = `SELECT id, ${columnsToExport.join(', ')} FROM logs ORDER BY timestamp DESC`;
    const logsResult = await db.query(logsQuery);
    
    // Process data - apply decryption if requested
    let processedLogs = logsResult.rows;
    
    if (decryptSensitiveData) {
      console.log("Decrypting sensitive data for evidence export...");
      // Use the LogsModel to properly decrypt fields
      processedLogs = LogsModel._processMultipleFromStorage(logsResult.rows);
      
      // Log this decryption event
      await eventLogger.logAuditEvent('decrypt_sensitive_evidence_export', req.user.username, {
        exportedColumns: columnsToExport,
        timestamp: new Date().toISOString()
      });
    }
    
    // 2. Get all evidence files if requested
    let evidenceFiles = [];
    let logsWithEvidenceCount = 0;
    
    if (includeEvidence) {
      // Get all log IDs
      const logIds = processedLogs.map(log => log.id);
      
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
          logs: processedLogs,
          totalLogs: processedLogs.length,
          logsWithEvidence: logsWithEvidenceCount,
          totalEvidenceFiles: evidenceFiles.length,
          includesHashes: includeHashes,
          includesDecryptedData: decryptSensitiveData
        }, 
        null, 
        2
      )
    );
    
    // 4. Create CSV version too using the evidence service
    const csvFilePath = path.join(exportPackageDir, 'logs.csv');
    const csvContent = await evidenceService.generateCsvFromLogs(processedLogs, ['id', ...columnsToExport]);
    await fs.writeFile(csvFilePath, csvContent);
    
    // 5. Copy evidence files and create manifest
    const evidenceManifest = await evidenceService.processEvidenceFiles(
      evidenceFiles,
      evidenceDir
    );
    
    // 6. Fetch and save relation data if requested
    let relationData = null;
    let userCommandData = null;
    
    if (includeRelations) {
      try {
        // Relation data is fetched in-process — the relation-service has been
        // consolidated into this backend. Exports are admin-only; respect the
        // admin's operation view filter if one is set (null = all operations).
        const operationTagId = await OperationsModel.getAdminViewFilter(req.user.username).catch(() => null);
        const isAdmin = true;

        // Fetch IP relations
        const ipRelations = formatRelationsForExport(
          await RelationsModel.getRelations('ip', 100, operationTagId, isAdmin)
        );
        await fs.writeFile(
          path.join(relationsDir, 'ip_relations.json'),
          JSON.stringify(ipRelations, null, 2)
        );

        // Fetch hostname relations
        const hostnameRelations = formatRelationsForExport(
          await RelationsModel.getRelations('hostname', 100, operationTagId, isAdmin)
        );
        await fs.writeFile(
          path.join(relationsDir, 'hostname_relations.json'),
          JSON.stringify(hostnameRelations, null, 2)
        );

        // Fetch domain relations
        const domainRelations = formatRelationsForExport(
          await RelationsModel.getRelations('domain', 100, operationTagId, isAdmin)
        );
        await fs.writeFile(
          path.join(relationsDir, 'domain_relations.json'),
          JSON.stringify(domainRelations, null, 2)
        );

        // Fetch user command relations
        userCommandData = await RelationsModel.getUserCommands(operationTagId, isAdmin);
        await fs.writeFile(
          path.join(relationsDir, 'user_commands.json'),
          JSON.stringify(userCommandData, null, 2)
        );
        
        // Create a combined relations file for easier access
        relationData = {
          ip: ipRelations,
          hostname: hostnameRelations,
          domain: domainRelations,
          userCommands: userCommandData
        };
        
        await fs.writeFile(
          path.join(relationsDir, 'relations.json'),
          JSON.stringify(relationData, null, 2)
        );
      } catch (error) {
        console.error('Error fetching relation data:', error);
        // Continue without relation data rather than failing the whole export
      }
    }
    
    // 7. Create an HTML report for easy viewing
    await htmlReportService.createHtmlReport(
      exportPackageDir, 
      processedLogs, 
      evidenceManifest, 
      columnsToExport,
      relationData,
      includeHashes
    );
    
    // 8. Create a ZIP archive of the entire directory
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
    
    // 9. Clean up the temporary export directory
    setTimeout(async () => {
      try {
        await fs.rm(exportPackageDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Error removing temporary export directory:', err);
      }
    }, 5000); // Wait 5 seconds before cleanup
    
    // 10. Log the export event
    await eventLogger.logAuditEvent('evidence_export', req.user.username, {
      exportId,
      selectedColumns: columnsToExport,
      logCount: processedLogs.length,
      evidenceCount: evidenceManifest.length,
      includesRelations: includeRelations,
      includesHashes: includeHashes,
      includesDecryptedData: decryptSensitiveData,
      timestamp: new Date().toISOString()
    });
    
    // 11. Return success response
    res.json({
      success: true,
      message: 'Evidence export completed successfully',
      details: {
        filePath: zipFilePath.replace(/\\/g, '/'), // Normalize path for display
        filename: zipFilename,
        logCount: processedLogs.length,
        evidenceCount: evidenceManifest.length,
        logsWithEvidenceCount,
        includesRelations: includeRelations,
        includesHashes: includeHashes,
        includesDecryptedData: decryptSensitiveData,
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