// relation-service/src/routes/relations.js
const express = require('express');
const router = express.Router();
const RelationsModel = require('../models/relations');
const RelationAnalyzer = require('../services/relationAnalyzer');
const { authenticateToken, verifyAdmin } = require('../middleware/auth.middleware');

// Get all relations (base route)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const allRelations = [];
    
    // Get relations for each type
    const types = ['ip', 'hostname', 'domain', 'username', 'command', 'command_sequence'];
    
    for (const type of types) {
      const relations = await RelationsModel.getRelations(type, parseInt(limit));
      allRelations.push(...relations);
    }

    res.json(allRelations);
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

    // Validate relation type
    const validTypes = ['ip', 'hostname', 'domain', 'username', 'command', 'command_sequence', 'user'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid relation type',
        validTypes
      });
    }

    // Special handling for user commands
    if (type === 'user') {
      const userCommands = await RelationsModel.getUserCommands();
      return res.json(userCommands);
    }

    // Special handling for command patterns
    if (type === 'command_sequence') {
      const sequences = await RelationsModel.getCommandSequences();
      return res.json(sequences);
    }

    const relations = await RelationsModel.getRelations(
      type,
      parseInt(limit) || 100
    );

    // Format the response
    const formattedRelations = relations.map(relation => ({
      source: relation.source,
      type: relation.type,
      connections: relation.related.length,
      related: relation.related.map(r => ({
        target: r.target,
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

// Get specific relations
router.get('/:type/:value', authenticateToken, async (req, res) => {
  try {
    const { type, value } = req.params;
    const relations = await RelationsModel.getRelationsByValue(type, value);
    res.json(relations);
  } catch (error) {
    console.error('Error getting specific relations:', error);
    res.status(500).json({ error: 'Failed to get specific relations' });
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

module.exports = router;