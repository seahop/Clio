// backend/routes/updates.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt: authenticateToken } = require('../middleware/jwt.middleware');
const RelationsModel = require('../models/relations');
const FileStatusModel = require('../models/fileStatus');
const RelationAnalyzer = require('../services/relations/relationAnalyzer');
const batchService = require('../services/relations/batchService');

router.post('/field-update', authenticateToken, async (req, res) => {
  try {
    const { fieldType, oldValue, newValue, username } = req.body;

    if (!fieldType) {
      return res.status(400).json({ error: 'Missing required field: fieldType', requiredFields: ['fieldType'] });
    }

    const safeOldValue = oldValue === undefined ? '' : oldValue;
    const safeNewValue = newValue === undefined ? '' : newValue;

    console.log(`Updating relations: ${fieldType} from "${safeOldValue}" to "${safeNewValue}"`);

    batchService.addToBatch('fieldUpdates', {
      fieldType, oldValue: safeOldValue, newValue: safeNewValue,
      username, timestamp: new Date().toISOString(), operation: 'field_update'
    }, batchUpdateProcessor);

    res.json({
      success: true,
      message: `Update for ${fieldType} scheduled for processing`,
      details: { fieldType, oldValue: safeOldValue, newValue: safeNewValue, updatedBy: username, status: 'processing' }
    });
  } catch (error) {
    console.error('Error updating relations:', error);
    res.status(500).json({ error: 'Failed to update relations', details: error.message });
  }
});

async function batchUpdateProcessor(batchItems) {
  try {
    console.log(`Processing batch of ${batchItems.length} field updates`);

    const updatesByField = batchItems.reduce((groups, item) => {
      if (!groups[item.fieldType]) groups[item.fieldType] = [];
      groups[item.fieldType].push(item);
      return groups;
    }, {});

    const updatedTypes = new Set();
    let totalUpdatedCount = 0;

    const fieldToRelationType = {
      'internal_ip': 'ip', 'external_ip': 'ip', 'hostname': 'hostname', 'domain': 'domain',
      'username': 'username', 'command': 'command', 'filename': 'filename', 'mac_address': 'mac_address'
    };
    const fieldToAnalysisType = {
      'internal_ip': ['ip', 'user_ip'], 'external_ip': ['ip', 'user_ip'],
      'hostname': ['hostname', 'user_hostname'], 'domain': 'domain',
      'username': ['user', 'user_hostname', 'user_ip'], 'command': 'command',
      'filename': 'file', 'status': 'file', 'mac_address': 'mac_address'
    };

    await Promise.all(Object.entries(updatesByField).map(async ([fieldType, updates]) => {
      const relationType = fieldToRelationType[fieldType] || fieldType;
      if (fieldToAnalysisType[fieldType]) {
        const types = fieldToAnalysisType[fieldType];
        if (Array.isArray(types)) types.forEach(t => updatedTypes.add(t));
        else updatedTypes.add(types);
      }

      let updatedCount = 0;

      switch (fieldType) {
        case 'username':
        case 'hostname':
        case 'domain':
        case 'command':
        case 'mac_address': {
          const uniqueUpdates = deduplicateUpdates(updates);
          for (const update of uniqueUpdates) {
            try {
              updatedCount += await RelationsModel.updateFieldValue(relationType, update.oldValue, update.newValue);
            } catch (err) {
              console.error(`Error updating ${fieldType} relation:`, err);
            }
          }
          break;
        }
        case 'filename': {
          const uniqueFilenameUpdates = deduplicateUpdates(updates);
          for (const update of uniqueFilenameUpdates) {
            try {
              const oldFilename = update.oldValue == null ? '' : update.oldValue;
              const newFilename = update.newValue == null ? '' : update.newValue;
              if (oldFilename === newFilename) continue;
              updatedCount += await RelationsModel.updateFieldValue(relationType, oldFilename, newFilename);
              updatedCount += await FileStatusModel.updateFilename(oldFilename, newFilename);
            } catch (err) {
              console.error('Error updating filename relations:', err);
            }
          }
          break;
        }
        case 'internal_ip':
        case 'external_ip': {
          const uniqueIpUpdates = deduplicateUpdates(updates);
          for (const update of uniqueIpUpdates) {
            try {
              updatedCount += await RelationsModel.updateFieldValue('ip', update.oldValue, update.newValue);
              updatedCount += await RelationsModel.updateFieldValue(fieldType, update.oldValue, update.newValue);
            } catch (err) {
              console.error(`Error updating ${fieldType} relation:`, err);
            }
          }
          break;
        }
        case 'status':
          updatedTypes.add('file');
          break;
        default:
          console.warn(`Unsupported field type for updates: ${fieldType}`);
      }

      totalUpdatedCount += updatedCount;
    }));

    if (updatedTypes.size > 0) {
      const targetedTypes = Array.from(updatedTypes);
      setTimeout(async () => {
        try {
          await RelationAnalyzer.analyzeLogs({ targetedTypes, timeWindow: 7 });
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

function deduplicateUpdates(updates) {
  const updatesByOldValue = updates.reduce((groups, update) => {
    if (!groups[update.oldValue]) groups[update.oldValue] = [];
    groups[update.oldValue].push(update);
    return groups;
  }, {});
  return Object.values(updatesByOldValue).map(group =>
    group.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp) : new Date(0);
      const timeB = b.timestamp ? new Date(b.timestamp) : new Date(0);
      return timeB - timeA;
    })[0]
  );
}

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const metrics = batchService.getMetrics();
    res.json({ metrics, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error getting batch status:', error);
    res.status(500).json({ error: 'Failed to get batch status', details: error.message });
  }
});

router.post('/flush', authenticateToken, async (req, res) => {
  try {
    await batchService.flushBatch('fieldUpdates');
    res.json({ success: true, message: 'Field update batches flushed successfully', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error flushing batches:', error);
    res.status(500).json({ error: 'Failed to flush batches', details: error.message });
  }
});

module.exports = router;
module.exports.batchUpdateProcessor = batchUpdateProcessor;
