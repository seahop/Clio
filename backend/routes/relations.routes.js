// backend/routes/relations.routes.js
const express = require('express');
const router = express.Router();
const RelationsModel = require('../models/relations');
const RelationAnalyzer = require('../services/relations/relationAnalyzer');
const cascadeDeleteRelations = require('../services/relations/cascadeDeleteRelations');
const { authenticateJwt: authenticateToken, verifyAdmin } = require('../middleware/jwt.middleware');
const OperationsModel = require('../models/operations');
const db = require('../db');

// Attach the effective operation tag filter to req before any relations handler.
// For admins, respect admin_view_filter (null = "All Operations").
// For regular users, use their active operation.
const attachActiveOp = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    if (isAdmin) {
      req.activeOperationTagId = await OperationsModel.getAdminViewFilter(req.user.username).catch(() => null);
    } else {
      const activeOp = await OperationsModel.getUserActiveOperation(req.user.username);
      req.activeOperationTagId = activeOp?.tag_id || null;
    }
  } catch (err) {
    console.error('Failed to load active operation for relations:', err);
    req.activeOperationTagId = null;
  }
  next();
};

// Build the effective operation filter for the relation-list endpoints from the
// user's accessible operations and the ?operations / ?opMatch query params.
//   ?operations=<op ids csv>  — restrict to these operations (default: all the
//                               user can access)
//   ?opMatch=any|all          — any = union (default), all = intersection
// A non-admin can only ever request operations they are a member of; anything
// else is silently dropped. Sets:
//   req.opFilter      null (all operations) | { tagIds, mode }
//   req.opRequestEmpty  true → the caller has no operations in scope, return []
const attachOpFilter = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';

    // Map of operation id → tag id for every operation this user may see.
    const accessible = new Map();
    if (isAdmin) {
      const all = await OperationsModel.getAllOperations(true);
      all.forEach(o => { if (o.tag_id) accessible.set(o.id, o.tag_id); });
    } else {
      const mine = await OperationsModel.getUserOperations(req.user.username);
      mine.forEach(o => { if (o.tag_id) accessible.set(o.id, o.tag_id); });
    }

    const mode = req.query.opMatch === 'all' ? 'all' : 'any';
    // Presence of the param — even empty — means an explicit selection, so
    // deselecting every operation yields no results rather than the default.
    const hasOpParam = req.query.operations !== undefined;
    const requested = String(req.query.operations || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(Number.isInteger);

    if (hasOpParam) {
      // Explicit selection — keep only operations the user is allowed to see
      const tagIds = [...new Set(
        requested.filter(id => accessible.has(id)).map(id => accessible.get(id))
      )];
      req.opFilter = { tagIds, mode };
      req.opRequestEmpty = tagIds.length === 0;
    } else if (isAdmin) {
      req.opFilter = null;              // admin default: all operations
      req.opRequestEmpty = false;
    } else {
      const tagIds = [...accessible.values()];
      req.opFilter = { tagIds, mode: 'any' };  // user default: union of their ops
      req.opRequestEmpty = tagIds.length === 0;
    }
    next();
  } catch (err) {
    console.error('Failed to build operation filter for relations:', err);
    req.opFilter = null;
    req.opRequestEmpty = req.user.role !== 'admin';  // fail closed for non-admins
    next();
  }
};

// Get all relations
router.get('/', authenticateToken, attachOpFilter, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const isAdmin = req.user.role === 'admin';

    if (req.opRequestEmpty) return res.json([]);
    const opFilter = req.opFilter;

    // Use getMacAddressRelations for mac_address so only source_type='mac_address'
    // entries are included. getRelations('mac_address') also catches target_type='mac_address'
    // (user→mac rows) which belong in the User↔MAC tab, not here.
    const lim = parseInt(limit);
    const [ipRels, hostnameRels, domainRels, usernameRels, commandRels, macRels] = await Promise.all([
      RelationsModel.getRelations('ip',       lim, opFilter, isAdmin),
      RelationsModel.getRelations('hostname', lim, opFilter, isAdmin),
      RelationsModel.getRelations('domain',   lim, opFilter, isAdmin),
      RelationsModel.getRelations('username', lim, opFilter, isAdmin),
      RelationsModel.getRelations('command',  lim, opFilter, isAdmin),
      RelationsModel.getMacAddressRelations(  lim, opFilter, isAdmin),
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
router.get('/:type', authenticateToken, attachOpFilter, async (req, res) => {
  try {
    const { type } = req.params;
    const { limit } = req.query;
    const isAdmin = req.user.role === 'admin';

    const validTypes = ['ip', 'hostname', 'hostname_ip', 'domain', 'username', 'command', 'user', 'mac_address', 'user_mac', 'user_domain'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid relation type', validTypes });
    }

    if (req.opRequestEmpty) return res.json([]);
    const opFilter = req.opFilter;

    if (type === 'user') {
      const userCommands = await RelationsModel.getUserCommands(opFilter, isAdmin);
      return res.json(userCommands);
    }

    if (type === 'mac_address') {
      const macRelations = await RelationsModel.getMacAddressRelations(parseInt(limit) || 100, opFilter, isAdmin);
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
      relations = await RelationsModel.getRelationsByMetadataType(COMPOUND_META_TYPES[type], lim, opFilter, isAdmin);
    } else {
      relations = await RelationsModel.getRelations(type, lim, opFilter, isAdmin);
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
// Called by the log-table UI for all users, so it cannot be admin-only;
// instead the re-analysis is scoped to the caller's operation.
router.post('/notify/template-update', authenticateToken, attachActiveOp, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.activeOperationTagId;

    // Fail closed: non-admins with no active operation have no logs in scope
    if (!isAdmin && !operationTagId) {
      return res.json({ success: true, message: 'Template update received, no logs in scope', logsToAnalyze: 0 });
    }

    const logs = operationTagId
      ? await db.query(`
          SELECT DISTINCT l.* FROM logs l
          JOIN log_tags lt ON l.id = lt.log_id
          WHERE lt.tag_id = $1 AND l.timestamp > NOW() - INTERVAL '48 hours'
          ORDER BY l.timestamp DESC LIMIT 1000
        `, [operationTagId])
      : await db.query(`
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
router.get('/:type/:value', authenticateToken, attachOpFilter, async (req, res) => {
  try {
    const { type, value } = req.params;
    const isAdmin = req.user.role === 'admin';

    if (req.opRequestEmpty) return res.json([]);
    const opFilter = req.opFilter;

    if (type === 'mac_address') {
      const normalizedMac = value.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || value;
      const relations = await RelationsModel.getRelationsByValue(type, normalizedMac, opFilter, isAdmin);
      return res.json(relations);
    }

    const relations = await RelationsModel.getRelationsByValue(type, value, opFilter, isAdmin);
    res.json(relations);
  } catch (error) {
    console.error('Error getting specific relations:', error);
    res.status(500).json({ error: 'Failed to get specific relations' });
  }
});

// Cascade delete relations when logs are deleted (admin only —
// log deletion in the app calls cascadeDeleteRelations directly)
router.post('/notify/log-delete', authenticateToken, verifyAdmin, async (req, res) => {
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
