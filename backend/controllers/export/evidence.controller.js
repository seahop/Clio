// backend/controllers/export/evidence.controller.js - Modified with encryption support
const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const archiver = require('archiver');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const https = require('https');
const fetch = require('node-fetch');

const db = require('../../db');
const LogsModel = require('../../models/logs'); // Import for decryption
const EvidenceModel = require('../../models/evidence');
const eventLogger = require('../../lib/eventLogger');
const evidenceService = require('../../services/export/evidence.service');
const htmlReportService = require('../../services/export/html-report.service');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

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

    // Generate a unique export ID and timestamp
    const exportId = new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 5);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Create export directories
    const exportDir = path.join(__dirname, '../../exports');
    const exportPackageDir = path.join(exportDir, `evidence_export_${exportId}`);
    const evidenceDir = path.join(exportPackageDir, 'evidence');
    const relationsDir = path.join(exportPackageDir, 'relations');
    const zipFilename = `evidence_export_${timestamp}.zip`;
    const zipFilePath = path.join(exportDir, zipFilename);
    
    // Create directories
    await fs.mkdir(exportDir, { recursive: true });
    await fs.mkdir(exportPackageDir, { recursive: true });
    await fs.mkdir(evidenceDir, { recursive: true });
    
    if (includeRelations) {
      await fs.mkdir(relationsDir, { recursive: true });
    }

    // Make sure hash columns are included if requested
    let columnsToExport = [...selectedColumns];
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
        // Get the auth token from request cookies
        const token = req.cookies?.auth_token;
        
        // Fetch IP relations
        const ipRelationsResponse = await fetch('https://relation-service:3002/api/relations/ip', {
          headers: {
            'Cookie': `auth_token=${token}`,
            'Accept': 'application/json'
          },
          agent: httpsAgent
        });
        
        if (!ipRelationsResponse.ok) {
          throw new Error(`Failed to fetch IP relations: ${ipRelationsResponse.status}`);
        }
        
        const ipRelations = await ipRelationsResponse.json();
        await fs.writeFile(
          path.join(relationsDir, 'ip_relations.json'),
          JSON.stringify(ipRelations, null, 2)
        );
        
        // Fetch hostname relations
        const hostnameRelationsResponse = await fetch('https://relation-service:3002/api/relations/hostname', {
          headers: {
            'Cookie': `auth_token=${token}`,
            'Accept': 'application/json'
          },
          agent: httpsAgent
        });
        
        if (!hostnameRelationsResponse.ok) {
          throw new Error(`Failed to fetch hostname relations: ${hostnameRelationsResponse.status}`);
        }
        
        const hostnameRelations = await hostnameRelationsResponse.json();
        await fs.writeFile(
          path.join(relationsDir, 'hostname_relations.json'),
          JSON.stringify(hostnameRelations, null, 2)
        );
        
        // Fetch domain relations
        const domainRelationsResponse = await fetch('https://relation-service:3002/api/relations/domain', {
          headers: {
            'Cookie': `auth_token=${token}`,
            'Accept': 'application/json'
          },
          agent: httpsAgent
        });
        
        if (!domainRelationsResponse.ok) {
          throw new Error(`Failed to fetch domain relations: ${domainRelationsResponse.status}`);
        }
        
        const domainRelations = await domainRelationsResponse.json();
        await fs.writeFile(
          path.join(relationsDir, 'domain_relations.json'),
          JSON.stringify(domainRelations, null, 2)
        );
        
        // Fetch user command relations
        const userCommandsResponse = await fetch('https://relation-service:3002/api/relations/user', {
          headers: {
            'Cookie': `auth_token=${token}`,
            'Accept': 'application/json'
          },
          agent: httpsAgent
        });
        
        if (!userCommandsResponse.ok) {
          throw new Error(`Failed to fetch user commands: ${userCommandsResponse.status}`);
        }
        
        userCommandData = await userCommandsResponse.json();
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