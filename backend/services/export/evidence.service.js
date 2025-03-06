// backend/services/export/evidence.service.js
const fs = require('fs').promises;
const path = require('path');
const { formatValue } = require('../../utils/export/formatter');

/**
 * Generate CSV content from logs data
 * @param {Array} logs - Logs data 
 * @param {Array} columns - Columns to include
 * @returns {String} CSV content
 */
const generateCsvFromLogs = async (logs, columns) => {
  const header = columns.join(',') + '\n';
  let csvContent = header;

  // Process each row for CSV
  for (const row of logs) {
    const csvRow = columns.map(col => {
      return formatValue(row[col], col);
    }).join(',');
    
    csvContent += csvRow + '\n';
  }
  
  return csvContent;
};

/**
 * Process and copy evidence files to the export directory
 * @param {Array} evidenceFiles - Evidence files to process
 * @param {String} evidenceDir - Directory to copy files to
 * @returns {Array} Evidence manifest
 */
const processEvidenceFiles = async (evidenceFiles, evidenceDir) => {
  if (!evidenceFiles || evidenceFiles.length === 0) {
    return [];
  }
  
  const evidenceManifest = [];
  
  // Process each evidence file
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
  const manifestPath = path.join(path.dirname(evidenceDir), 'evidence_manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(evidenceManifest, null, 2));
  
  return evidenceManifest;
};

module.exports = {
  generateCsvFromLogs,
  processEvidenceFiles
};