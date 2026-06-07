// backend/routes/relations.routes.js
const express = require('express');
const router = express.Router();
const RelationsModel = require('../models/relations');
const RelationAnalyzer = require('../services/relations/relationAnalyzer');
const cascadeDeleteRelations = require('../services/relations/cascadeDeleteRelations');
const { authenticateJwt: authenticateToken, verifyAdmin } = require('../middleware/jwt.middleware');
const OperationsModel = require('../models/operations');
const db = require('../db');

// Attach the user's active operation tag to req before any relations handler.
// authenticateJwt only sets {id, username, role} — it does not look up the
// active operation, so we do it here once for all read routes.
const attachActiveOp = async (req, res, next) => {
  try {
    const activeOp = await OperationsModel.getUserActiveOperation(req.user.username);
    req.activeOperationTagId = activeOp?.tag_id || null;
  } catch (err) {
    console.error('Failed to load active operation for relations:', err);
    req.activeOperationTagId = null;
  }
  next();
};

// Get all relations
router.get('/', authenticateToken, attachActiveOp, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.activeOperationTagId;

    if (!isAdmin && !operationTagId) return res.json([]);

    // Use getMacAddressRelations for mac_address so only source_type='mac_address'
    // entries are included. getRelations('mac_address') also catches target_type='mac_address'
    // (user→mac rows) which belong in the User↔MAC tab, not here.
    const lim = parseInt(limit);
    const [ipRels, hostnameRels, domainRels, usernameRels, commandRels, macRels] = await Promise.all([
      RelationsModel.getRelations('ip',       lim, operationTagId, isAdmin),
      RelationsModel.getRelations('hostname', lim, operationTagId, isAdmin),
      RelationsModel.getRelations('domain',   lim, operationTagId, isAdmin),
      RelationsModel.getRelations('username', lim, operationTagId, isAdmin),
      RelationsModel.getRelations('command',  lim, operationTagId, isAdmin),
      RelationsModel.getMacAddressRelations(  lim, operationTagId, isAdmin),
    ]);
    const allRelations = [...ipRels, ...hostnameRels, ...domainRels, ...usernameRels, ...commandRels, ...macRels];

    const uniqueRelations = new Map();
    allRelations.forEach(relation => {
      const key = `${relation.type}:${relation.source}`;
      if (uniqueRelations.has(key)) {
        const existing = uniqueRelations.get(key);
        relation.related.forEach(newRelated => {
          if (!existing.related.find(r => r.type === newRelated.type && r.target === newRelated.target)) {
            existing.related.push(newRelated);
          }
        });
      } else {
        uniqueRelations.set(key, relation);
      }
    });

    res.json(Array.from(uniqueRelations.values()));
  } catch (error) {
    console.error('Error getting all relations:', error);
    res.status(500).json({ error: 'Failed to get relations' });
  }
});

// Get relations by type
router.get('/:type', authenticateToken, attachActiveOp, async (req, res) => {
  try {
    const { type } = req.params;
    const { limit } = req.query;
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.activeOperationTagId;

    if (!isAdmin && !operationTagId) return res.json([]);

    const validTypes = ['ip', 'hostname', 'hostname_ip', 'domain', 'username', 'command', 'user', 'mac_address', 'user_mac', 'user_domain'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid relation type', validTypes });
    }

    if (type === 'user') {
      const userCommands = await RelationsModel.getUserCommands(operationTagId, isAdmin);
      return res.json(userCommands);
    }

    if (type === 'mac_address') {
      const macRelations = await RelationsModel.getMacAddressRelations(parseInt(limit) || 100, operationTagId, isAdmin);
      return res.json(macRelations);
    }

    // Compound filter types — stored in the DB with their constituent source/target types,
    // not as a literal 'hostname_ip' or 'user_mac' source_type. Query by metadata.type instead.
    const COMPOUND_META_TYPES = {
      hostname_ip:  'hostname_ip',
      user_mac:     'user_mac',
      user_domain:  'user_domain',
    };

    const lim = parseInt(limit) || 100;
    let relations;
    if (COMPOUND_META_TYPES[type]) {
      relations = await RelationsModel.getRelationsByMetadataType(COMPOUND_META_TYPES[type], lim, operationTagId, isAdmin);
    } else {
      relations = await RelationsModel.getRelations(type, lim, operationTagId, isAdmin);
    }

    const formattedRelations = relations.map(relation => ({
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

    res.json(formattedRelations);
  } catch (error) {
    console.error('Error getting relations:', error);
    res.status(500).json({ error: 'Failed to get relations' });
  }
});

// Template update notification — triggers re-analysis
router.post('/notify/template-update', authenticateToken, async (req, res) => {
  try {
    const logs = await db.query(`
      SELECT * FROM logs WHERE timestamp > NOW() - INTERVAL '48 hours'
      ORDER BY timestamp DESC LIMIT 1000
    `);

    res.json({ success: true, message: 'Template update received, analysis scheduled', logsToAnalyze: logs.rows.length });

    RelationAnalyzer.analyzeSpecificLogs(logs.rows, { types: ['user', 'hostname', 'hostname_ip', 'ip', 'mac_address', 'domain', 'user_hostname', 'user_ip', 'user_domain', 'user_mac'] })
      .catch(error => console.error('Async analysis error:', error));
  } catch (error) {
    console.error('Error in template update notification:', error);
    res.status(500).json({ error: 'Failed to schedule re-analysis', details: error.message });
  }
});

// Get relations for a specific value
router.get('/:type/:value', authenticateToken, attachActiveOp, async (req, res) => {
  try {
    const { type, value } = req.params;
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.activeOperationTagId;

    if (!isAdmin && !operationTagId) return res.json([]);

    if (type === 'mac_address') {
      const normalizedMac = value.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || value;
      const relations = await RelationsModel.getRelationsByValue(type, normalizedMac, operationTagId, isAdmin);
      return res.json(relations);
    }

    const relations = await RelationsModel.getRelationsByValue(type, value, operationTagId, isAdmin);
    res.json(relations);
  } catch (error) {
    console.error('Error getting specific relations:', error);
    res.status(500).json({ error: 'Failed to get specific relations' });
  }
});

// Cascade delete relations when logs are deleted
router.post('/notify/log-delete', authenticateToken, async (req, res) => {
  try {
    const { logId, logIds } = req.body;
    const idsToProcess = logIds || (logId ? [logId] : []);
    if (idsToProcess.length === 0) return res.status(400).json({ error: 'No log IDs provided' });

    const result = await cascadeDeleteRelations(idsToProcess);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error handling log deletion:', error);
    res.status(500).json({ error: 'Failed to cleanup relations', details: error.message });
  }
});

// Manually trigger full analysis (admin only)
router.post('/analyze', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    await RelationAnalyzer.analyzeLogs();
    res.json({ message: 'Analysis completed successfully' });
  } catch (error) {
    console.error('Error triggering analysis:', error);
    res.status(500).json({ error: 'Failed to analyze relations' });
  }
});

// Delete old relations (admin only)
router.delete('/cleanup', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { days } = req.query;
    const deletedCount = await RelationsModel.deleteOldRelations(parseInt(days) || 30);
    res.json({ message: 'Cleanup completed successfully', deletedCount });
  } catch (error) {
    console.error('Error cleaning up relations:', error);
    res.status(500).json({ error: 'Failed to cleanup relations' });
  }
});

// Clear all caches (admin only)
router.post('/clear-cache', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    RelationsModel._clearAllCaches();
    res.json({ message: 'All caches cleared successfully' });
  } catch (error) {
    console.error('Error clearing caches:', error);
    res.status(500).json({ error: 'Failed to clear caches' });
  }
});

module.exports = router;
