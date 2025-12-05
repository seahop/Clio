// relation-service/src/routes/relations.js
const express = require('express');
const router = express.Router();
const RelationsModel = require('../models/relations');
const RelationAnalyzer = require('../services/relationAnalyzer');
const { authenticateToken, verifyAdmin } = require('../middleware/auth.middleware');
const _ = require('lodash');
const db = require('../db');

// Get all relations (base route)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const allRelations = [];

    // Get operation filtering context
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.user.activeOperation?.tag_id;

    // Non-admin users must have an active operation
    if (!isAdmin && !operationTagId) {
      return res.json([]);
    }

    // Get relations for each type - remove command_sequence from the types array
    const types = ['ip', 'hostname', 'domain', 'username', 'command', 'mac_address'];

    for (const type of types) {
      const relations = await RelationsModel.getRelations(type, parseInt(limit), operationTagId, isAdmin);
      allRelations.push(...relations);
    }

    // Deduplicate relations by source+type combination
    // This is needed because getRelations() returns relations where the type is either source OR target
    // So MAC→IP gets returned both when querying for 'mac_address' and 'ip'
    const uniqueRelations = new Map();
    allRelations.forEach(relation => {
      const key = `${relation.type}:${relation.source}`;
      if (uniqueRelations.has(key)) {
        // Merge related items
        const existing = uniqueRelations.get(key);
        relation.related.forEach(newRelated => {
          const existingRelated = existing.related.find(r =>
            r.type === newRelated.type && r.target === newRelated.target
          );
          if (!existingRelated) {
            existing.related.push(newRelated);
          }
        });
      } else {
        uniqueRelations.set(key, relation);
      }
    });

    const deduplicatedRelations = Array.from(uniqueRelations.values());
    console.log(`[DEBUG] Before dedup: ${allRelations.length}, After dedup: ${deduplicatedRelations.length}`);

    res.json(deduplicatedRelations);
  } catch (error) {
    console.error('Error getting all relations:', error);
    res.status(500).json({ error: 'Failed to get relations' });
  }
});

// Get relations by type
router.get('/:type', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const { limit } = req.query;

    // Get operation filtering context
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.user.activeOperation?.tag_id;

    console.log(`[DEBUG] Relations request - User: ${req.user.username}, Type: ${type}, IsAdmin: ${isAdmin}, OperationTagId: ${operationTagId}`);

    // Non-admin users must have an active operation
    if (!isAdmin && !operationTagId) {
      console.log('[DEBUG] Non-admin user without active operation - returning empty array');
      return res.json([]);
    }

    // Validate relation type - remove command_sequence from valid types
    const validTypes = ['ip', 'hostname', 'domain', 'username', 'command', 'user', 'mac_address'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid relation type',
        validTypes
      });
    }

    // Special handling for user commands
    if (type === 'user') {
      console.log('Fetching user commands for relation view');
      const userCommands = await RelationsModel.getUserCommands(operationTagId, isAdmin);
      
      // Log what we're sending back to help with debugging
      if (userCommands && userCommands.length > 0) {
        console.log(`Returning ${userCommands.length} user commands`);
        console.log('Sample command from response:', {
          username: userCommands[0].username,
          command: userCommands[0].command ? 
            (userCommands[0].command.substring(0, 50) + 
             (userCommands[0].command.length > 50 ? '...' : '')) : 
            'null'
        });
      }
      
      return res.json(userCommands);
    }
    
    // Special handling for MAC address relations
    if (type === 'mac_address') {
      console.log('Fetching MAC address relations');
      const macRelations = await RelationsModel.getMacAddressRelations(parseInt(limit) || 100, operationTagId, isAdmin);
      return res.json(macRelations);
    }

    const relations = await RelationsModel.getRelations(
      type,
      parseInt(limit) || 100,
      operationTagId,
      isAdmin
    );

    // Format the response
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

router.post('/notify/template-update', authenticateToken, async (req, res) => {
  try {
    console.log('Template update notification received');
    
    // Only get recent logs (last 48 hours) instead of ALL logs
    const logs = await db.query(`
      SELECT *
      FROM logs
      WHERE timestamp > NOW() - INTERVAL '48 hours'
      ORDER BY timestamp DESC
      LIMIT 1000
    `);
    
    console.log(`Scheduling re-analysis for ${logs.rows.length} logs after template update`);
    
    // Respond immediately to prevent timeout
    res.json({
      success: true,
      message: 'Template update received, analysis scheduled',
      logsToAnalyze: logs.rows.length
    });
    
    // Then run the analysis asynchronously (after responding)
    // This won't block the response
    RelationAnalyzer.analyzeSpecificLogs(logs.rows, { 
      types: ['user', 'hostname', 'ip', 'mac_address', 'domain'] 
    }).catch(error => {
      console.error('Async analysis error:', error);
    });
    
  } catch (error) {
    console.error('Error in template update notification:', error);
    res.status(500).json({ error: 'Failed to schedule re-analysis', details: error.message });
  }
});

// Get specific relations
router.get('/:type/:value', authenticateToken, async (req, res) => {
  try {
    const { type, value } = req.params;

    // Get operation filtering context
    const isAdmin = req.user.role === 'admin';
    const operationTagId = req.user.activeOperation?.tag_id;

    // Non-admin users must have an active operation
    if (!isAdmin && !operationTagId) {
      return res.json([]);
    }

    // Special handling for MAC addresses - ensure consistent format
    if (type === 'mac_address') {
      // Normalize MAC address to dashed format
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

// Handle log deletion notification (cascade delete relations)
router.post('/notify/log-delete', authenticateToken, async (req, res) => {
  try {
    const { logId, logIds } = req.body;

    // Support both single log deletion and bulk deletion
    const idsToProcess = logIds || (logId ? [logId] : []);

    if (idsToProcess.length === 0) {
      return res.status(400).json({ error: 'No log IDs provided' });
    }

    console.log(`Processing cascade delete for ${idsToProcess.length} log(s)`);

    // Remove these log IDs from all relations
    await db.query(`
      UPDATE relations
      SET source_log_ids = ARRAY(
        SELECT unnest(source_log_ids)
        EXCEPT
        SELECT unnest($1::INTEGER[])
      )
      WHERE source_log_ids && $1::INTEGER[]
    `, [idsToProcess]);

    // Delete relations that now have no source logs
    const relationsDeleted = await db.query(`
      DELETE FROM relations
      WHERE source_log_ids = '{}'
      RETURNING id
    `);

    // Same for file_status
    await db.query(`
      UPDATE file_status
      SET source_log_ids = ARRAY(
        SELECT unnest(source_log_ids)
        EXCEPT
        SELECT unnest($1::INTEGER[])
      )
      WHERE source_log_ids && $1::INTEGER[]
    `, [idsToProcess]);

    const filesDeleted = await db.query(`
      DELETE FROM file_status
      WHERE source_log_ids = '{}'
      RETURNING id
    `);

    console.log(`Cascade delete complete: ${relationsDeleted.rows.length} relations, ${filesDeleted.rows.length} file statuses removed`);

    res.json({
      success: true,
      relationsRemoved: relationsDeleted.rows.length,
      fileStatusesRemoved: filesDeleted.rows.length
    });
  } catch (error) {
    console.error('Error handling log deletion:', error);
    res.status(500).json({ error: 'Failed to cleanup relations', details: error.message });
  }
});

// Manually trigger analysis (admin only)
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
    res.json({
      message: 'Cleanup completed successfully',
      deletedCount
    });
  } catch (error) {
    console.error('Error cleaning up relations:', error);
    res.status(500).json({ error: 'Failed to cleanup relations' });
  }
});

// Clear all caches (admin only)
router.post('/clear-cache', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    RelationsModel._clearAllCaches();
    console.log('All relation caches cleared');
    res.json({
      message: 'All caches cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing caches:', error);
    res.status(500).json({ error: 'Failed to clear caches' });
  }
});

module.exports = router;