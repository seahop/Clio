// backend/controllers/export/s3-status.controller.js
const fs = require('fs').promises;
const path = require('path');
const eventLogger = require('../../lib/eventLogger');

// Path to store S3 upload status for exports
const S3_STATUS_PATH = path.join(__dirname, '../../data/export-s3-status.json');
// Path to store file relationships (original-encrypted-key)
const FILE_RELATIONSHIPS_PATH = path.join(__dirname, '../../data/export-file-relationships.json');

// Ensure the S3 status file exists
const ensureStatusFile = async () => {
  try {
    await fs.access(S3_STATUS_PATH);
  } catch (error) {
    // File doesn't exist, create it with an empty object
    await fs.writeFile(S3_STATUS_PATH, JSON.stringify({}), 'utf8');
  }
};

// Ensure the file relationships file exists
const ensureRelationshipsFile = async () => {
  try {
    await fs.access(FILE_RELATIONSHIPS_PATH);
  } catch (error) {
    // File doesn't exist, create it with an empty object
    await fs.writeFile(FILE_RELATIONSHIPS_PATH, JSON.stringify({}), 'utf8');
  }
};

// Get S3 upload status for all exports
const getExportS3Status = async (req, res) => {
  try {
    await ensureStatusFile();
    await ensureRelationshipsFile();
    
    // Read the status file
    const statusData = await fs.readFile(S3_STATUS_PATH, 'utf8');
    let status = {};
    
    try {
      status = JSON.parse(statusData);
    } catch (parseError) {
      console.error('Error parsing S3 status data:', parseError);
      // If the file is corrupted, reset it to an empty object
      await fs.writeFile(S3_STATUS_PATH, JSON.stringify({}), 'utf8');
    }
    
    // Read the relationships file to enhance response with relationship info
    let relationships = {};
    try {
      const relationshipsData = await fs.readFile(FILE_RELATIONSHIPS_PATH, 'utf8');
      relationships = JSON.parse(relationshipsData);
    } catch (parseError) {
      console.error('Error parsing file relationships data:', parseError);
      // If the file is corrupted, reset it to an empty object
      await fs.writeFile(FILE_RELATIONSHIPS_PATH, JSON.stringify({}), 'utf8');
    }
    
    // Add relationship information to the status
    for (const filename in status) {
      // If this is an original file and it's marked as "encrypted"
      if (status[filename].status === 'encrypted' && relationships[filename]) {
        // Add relationship information
        status[filename].encryptedFiles = relationships[filename];
      }
      
      // If this is an encrypted or key file, add reference to original
      if (status[filename].details && status[filename].details.originalFileName) {
        status[filename].originalFile = status[filename].details.originalFileName;
      }
    }
    
    // Log access for auditing
    await eventLogger.logAuditEvent('view_export_s3_status', req.user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    res.json(status);
  } catch (error) {
    console.error('Error getting export S3 status:', error);
    res.status(500).json({ error: 'Failed to get export S3 status' });
  }
};

// Update S3 upload status for an export
const updateExportS3Status = async (req, res) => {
  try {
    const { filename, status, details = {} } = req.body;
    
    if (!filename || !status) {
      return res.status(400).json({ error: 'Filename and status are required' });
    }
    
    await ensureStatusFile();
    await ensureRelationshipsFile();
    
    // Read current status data
    const statusData = await fs.readFile(S3_STATUS_PATH, 'utf8');
    let statusMap = {};
    
    try {
      statusMap = JSON.parse(statusData);
    } catch (parseError) {
      console.error('Error parsing S3 status data:', parseError);
      // If the file is corrupted, reset it to an empty object
      statusMap = {};
    }
    
    // Read current relationships data
    const relationshipsData = await fs.readFile(FILE_RELATIONSHIPS_PATH, 'utf8');
    let relationships = {};
    
    try {
      relationships = JSON.parse(relationshipsData);
    } catch (parseError) {
      console.error('Error parsing file relationships data:', parseError);
      // If the file is corrupted, reset it to an empty object
      relationships = {};
    }
    
    // Update status for this file
    statusMap[filename] = {
      status,
      details,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.username
    };
    
    // Update relationships if this is related to encryption
    if (status === 'encrypted' && details.encryptedFileName && details.keyFileName) {
      // This is an original file being encrypted
      // Store the relationship between original, encrypted, and key files
      relationships[filename] = {
        encryptedFile: details.encryptedFileName,
        keyFile: details.keyFileName,
        encryptedAt: details.encryptedAt || new Date().toISOString()
      };
      
      console.log(`Updated file relationships for ${filename}:`, relationships[filename]);
    } else if ((details.isEncrypted || details.isKeyFile) && details.originalFileName) {
      // This is an encrypted or key file - make sure the relationship is bidirectional
      if (!relationships[details.originalFileName]) {
        relationships[details.originalFileName] = {};
      }
      
      if (details.isEncrypted) {
        relationships[details.originalFileName].encryptedFile = filename;
      }
      
      if (details.isKeyFile) {
        relationships[details.originalFileName].keyFile = filename;
      }
      
      console.log(`Updated reverse relationship for ${filename} -> ${details.originalFileName}`);
    }
    
    // Write the updated status back to the file
    await fs.writeFile(S3_STATUS_PATH, JSON.stringify(statusMap, null, 2), 'utf8');
    
    // Write the updated relationships back to the file
    await fs.writeFile(FILE_RELATIONSHIPS_PATH, JSON.stringify(relationships, null, 2), 'utf8');
    
    // Log the status update
    await eventLogger.logAuditEvent('export_s3_status_update', req.user.username, {
      filename,
      status,
      details: {
        ...details,
        sensitiveData: undefined // Don't log potentially sensitive details
      },
      timestamp: new Date().toISOString()
    });
    
    // Include relationship info in the response if relevant
    let responseData = {
      success: true,
      message: `S3 upload status for ${filename} updated to ${status}`,
      filename,
      status
    };
    
    // Add relationship info if this is an original file being encrypted
    if (status === 'encrypted' && relationships[filename]) {
      responseData.relationships = relationships[filename];
    }
    
    // Add original file info if this is an encrypted or key file
    if ((details.isEncrypted || details.isKeyFile) && details.originalFileName) {
      responseData.originalFile = details.originalFileName;
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('Error updating export S3 status:', error);
    res.status(500).json({ 
      error: 'Failed to update export S3 status',
      detail: error.message
    });
  }
};

module.exports = {
  getExportS3Status,
  updateExportS3Status
};