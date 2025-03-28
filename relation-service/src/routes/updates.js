// relation-service/src/routes/updates.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const RelationsModel = require('../models/relations');
const FileStatusModel = require('../models/fileStatus');
const RelationAnalyzer = require('../services/relationAnalyzer');
const batchService = require('../services/batchService');

/**
 * Handle updates to field values that might affect relationships
 * This API will update all relationship references when source data changes
 * Enhanced with better batch processing and parallel execution
 */
router.post('/field-update', authenticateToken, async (req, res) => {
  try {
    const { fieldType, oldValue, newValue, username } = req.body;
    
    if (!fieldType) {
      return res.status(400).json({ 
        error: 'Missing required field: fieldType',
        requiredFields: ['fieldType']
      });
    }
    
    // Ensure we handle oldValue and newValue properly
    // Convert undefined to empty string, but keep null and other values as-is
    const safeOldValue = oldValue === undefined ? '' : oldValue;
    const safeNewValue = newValue === undefined ? '' : newValue;
    
    console.log(`Updating relations: ${fieldType} from "${safeOldValue}" to "${safeNewValue}"`);
    
    // Add to batch processing queue with metadata for smart processing
    const batchData = {
      fieldType,
      oldValue: safeOldValue, 
      newValue: safeNewValue, 
      username,
      timestamp: new Date().toISOString(),
      operation: 'field_update'
    };
    
    // Add to the batch with high priority for field updates
    batchService.addToBatch('fieldUpdates', batchData, batchUpdateProcessor);
    
    res.json({
      success: true,
      message: `Update for ${fieldType} scheduled for processing`,
      details: {
        fieldType,
        oldValue: safeOldValue,
        newValue: safeNewValue,
        updatedBy: username,
        status: 'processing'
      }
    });
  } catch (error) {
    console.error('Error updating relations:', error);
    res.status(500).json({ error: 'Failed to update relations', details: error.message });
  }
});

/**
 * Processor function for batched field updates
 * This function handles multiple updates efficiently
 */
async function batchUpdateProcessor(batchItems) {
  try {
    console.log(`Processing batch of ${batchItems.length} field updates`);
    
    // Group updates by field type for more efficient processing
    const updatesByField = batchItems.reduce((groups, item) => {
      if (!groups[item.fieldType]) {
        groups[item.fieldType] = [];
      }
      groups[item.fieldType].push(item);
      return groups;
    }, {});
    
    // Keep track of what types of relations were updated for targeted analysis
    const updatedTypes = new Set();
    let totalUpdatedCount = 0;
    
    // Process each field type in parallel
    await Promise.all(Object.entries(updatesByField).map(async ([fieldType, updates]) => {
      // Map of field types to their corresponding relation types
      const fieldToRelationType = {
        'internal_ip': 'ip',
        'external_ip': 'ip',
        'hostname': 'hostname',
        'domain': 'domain',
        'username': 'username',
        'command': 'command',
        'filename': 'filename'
      };
      
      // Map field types to analysis types for targeted refresh
      const fieldToAnalysisType = {
        'internal_ip': ['ip', 'user_ip'],
        'external_ip': ['ip', 'user_ip'],
        'hostname': ['hostname', 'user_hostname'],
        'domain': 'domain',
        'username': ['user', 'user_hostname', 'user_ip'],
        'command': 'command',
        'filename': 'file',
        'status': 'file'
      };
      
      // Add the analysis type to our set for targeted refresh
      if (fieldToAnalysisType[fieldType]) {
        if (Array.isArray(fieldToAnalysisType[fieldType])) {
          // If it's an array, add all types
          fieldToAnalysisType[fieldType].forEach(type => updatedTypes.add(type));
        } else {
          // Otherwise add the single type
          updatedTypes.add(fieldToAnalysisType[fieldType]);
        }
      }
      
      // Get the relation type for this field
      const relationType = fieldToRelationType[fieldType] || fieldType;
      
      // Get oldest and newest items for logging
      const oldestUpdate = updates[0];
      const newestUpdate = updates[updates.length - 1];
      
      // Process the field updates based on type
      let updatedCount = 0;
      
      console.log(`Processing ${updates.length} updates for field type: ${fieldType}`);
      
      switch (fieldType) {
        case 'username':
        case 'hostname':
        case 'domain':
        case 'command':
          // Process updates with deduplication
          const uniqueUpdates = deduplicateUpdates(updates);
          console.log(`Processing ${uniqueUpdates.length} unique ${fieldType} updates`);
          
          for (const update of uniqueUpdates) {
            try {
              // Update with standard pattern
              const updateCount = await RelationsModel.updateFieldValue(
                relationType, 
                update.oldValue, 
                update.newValue
              );
              updatedCount += updateCount;
            } catch (err) {
              console.error(`Error updating ${fieldType} relation:`, err);
            }
          }
          break;
        
        case 'filename':
          // Special handling for filename updates
          const uniqueFilenameUpdates = deduplicateUpdates(updates);
          console.log(`Processing ${uniqueFilenameUpdates.length} unique filename updates`);
          
          for (const update of uniqueFilenameUpdates) {
            try {
              // Use empty string for null/undefined values to prevent database errors
              const oldFilename = update.oldValue === null || update.oldValue === undefined ? '' : update.oldValue;
              const newFilename = update.newValue === null || update.newValue === undefined ? '' : update.newValue;
              
              console.log(`Processing filename update: "${oldFilename}" -> "${newFilename}"`);
              
              // Skip if there's no real change
              if (oldFilename === newFilename) {
                console.log('Skipping filename update with no change');
                continue;
              }
              
              // First update field value in relations table
              const relationsCount = await RelationsModel.updateFieldValue(
                relationType,
                oldFilename,
                newFilename
              );
              
              // Then update file status records
              const fileStatusCount = await FileStatusModel.updateFilename(
                oldFilename,
                newFilename
              );
              
              updatedCount += relationsCount + fileStatusCount;
              console.log(`Updated ${relationsCount} relation records and ${fileStatusCount} file status records for filename change`);
            } catch (err) {
              console.error('Error updating filename relations:', err);
            }
          }
          break;
          
        case 'internal_ip':
        case 'external_ip':
          // Process IP updates with deduplication
          const uniqueIpUpdates = deduplicateUpdates(updates);
          console.log(`Processing ${uniqueIpUpdates.length} unique ${fieldType} updates`);
          
          for (const update of uniqueIpUpdates) {
            try {
              // Update both generic 'ip' and specific IP type
              const genericCount = await RelationsModel.updateFieldValue(
                'ip', 
                update.oldValue, 
                update.newValue
              );
              
              const specificCount = await RelationsModel.updateFieldValue(
                fieldType, 
                update.oldValue, 
                update.newValue
              );
              
              updatedCount += genericCount + specificCount;
            } catch (err) {
              console.error(`Error updating ${fieldType} relation:`, err);
            }
          }
          break;
        
        case 'status':
          // Status doesn't have direct relations but affects file tracking
          updatedTypes.add('file');
          break;
          
        default:
          console.warn(`Unsupported field type for updates: ${fieldType}`);
          break;
      }
      
      totalUpdatedCount += updatedCount;
    }));
    
    // Schedule targeted analysis based on updated types
    if (updatedTypes.size > 0) {
      const targetedTypes = Array.from(updatedTypes);
      console.log(`Scheduling targeted analysis for types: ${targetedTypes.join(', ')}`);
      
      // Use smaller timeout for faster response
      setTimeout(async () => {
        try {
          // Use more targeted time window for analysis
          await RelationAnalyzer.analyzeLogs({
            targetedTypes,
            timeWindow: 7 // 7 days instead of default 30
          });
          console.log(`Completed targeted analysis for ${targetedTypes.join(', ')}`);
        } catch (err) {
          console.error('Error in targeted analysis:', err);
        }
      }, 50);
    }
    
    console.log(`Batch update completed: ${totalUpdatedCount} total records modified`);
    return totalUpdatedCount;
  } catch (error) {
    console.error('Error in batch update processor:', error);
    throw error;
  }
}

/**
 * Helper function to deduplicate updates
 * If there are multiple updates for the same old value, only keep the most recent
 */
function deduplicateUpdates(updates) {
  // Group by oldValue
  const updatesByOldValue = updates.reduce((groups, update) => {
    if (!groups[update.oldValue]) {
      groups[update.oldValue] = [];
    }
    groups[update.oldValue].push(update);
    return groups;
  }, {});
  
  // For each old value, keep only the most recent update
  return Object.values(updatesByOldValue).map(group => {
    // Sort by timestamp (newest first) and take the first item
    return group.sort((a, b) => {
      // Handle missing timestamps gracefully
      const timeA = a.timestamp ? new Date(a.timestamp) : new Date(0);
      const timeB = b.timestamp ? new Date(b.timestamp) : new Date(0);
      return timeB - timeA;
    })[0];
  });
}

/**
 * Get batch processing status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const metrics = batchService.getMetrics();
    res.json({
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting batch status:', error);
    res.status(500).json({ error: 'Failed to get batch status', details: error.message });
  }
});

/**
 * Force flush all field update batches - utility endpoint
 */
router.post('/flush', authenticateToken, async (req, res) => {
  try {
    console.log('Manual flush of field updates requested');
    await batchService.flushBatch('fieldUpdates');
    res.json({
      success: true,
      message: 'Field update batches flushed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error flushing batches:', error);
    res.status(500).json({ error: 'Failed to flush batches', details: error.message });
  }
});

module.exports = router;