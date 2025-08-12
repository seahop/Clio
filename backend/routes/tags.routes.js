// backend/routes/tags.routes.js
const express = require('express');
const router = express.Router();
const TagsModel = require('../models/tags');
const eventLogger = require('../lib/eventLogger');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const { sanitizeRequestMiddleware } = require('../middleware/sanitize.middleware');
const db = require('../db'); // Add this import for the protection check

// Get all tags
router.get('/', authenticateJwt, async (req, res, next) => {
  try {
    const tags = await TagsModel.getAllTags();
    
    await eventLogger.logDataEvent('view_tags', req.user.username, {
      count: tags.length,
      timestamp: new Date().toISOString()
    });
    
    res.json(tags);
  } catch (error) {
    console.error('Error getting tags:', error);
    await eventLogger.logDataEvent('view_tags_error', req.user.username, {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

// Search tags (for autocomplete)
router.get('/search', authenticateJwt, async (req, res, next) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 1) {
      return res.json([]);
    }
    
    const tags = await TagsModel.searchTags(q);
    res.json(tags);
  } catch (error) {
    console.error('Error searching tags:', error);
    next(error);
  }
});

// Get tag statistics
router.get('/stats', authenticateJwt, async (req, res, next) => {
  try {
    const stats = await TagsModel.getTagStats();
    
    await eventLogger.logDataEvent('view_tag_stats', req.user.username, {
      timestamp: new Date().toISOString()
    });
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting tag stats:', error);
    next(error);
  }
});

// Get tags for a specific log
router.get('/log/:logId', authenticateJwt, async (req, res, next) => {
  try {
    const logId = parseInt(req.params.logId);
    
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log ID' });
    }
    
    const tags = await TagsModel.getLogTags(logId);
    res.json(tags);
  } catch (error) {
    console.error('Error getting log tags:', error);
    next(error);
  }
});

// Get tags for multiple logs (batch)
router.post('/logs/batch', authenticateJwt, async (req, res, next) => {
  try {
    const { logIds } = req.body;
    
    if (!Array.isArray(logIds)) {
      return res.status(400).json({ error: 'logIds must be an array' });
    }
    
    const tagsByLogId = await TagsModel.getTagsForLogs(logIds);
    res.json(tagsByLogId);
  } catch (error) {
    console.error('Error getting tags for multiple logs:', error);
    next(error);
  }
});

// Get tag co-occurrence data
router.get('/:tagId/related', authenticateJwt, async (req, res, next) => {
  try {
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid tag ID' });
    }
    
    const relatedTags = await TagsModel.getTagCoOccurrence(tagId);
    res.json(relatedTags);
  } catch (error) {
    console.error('Error getting related tags:', error);
    next(error);
  }
});

// Create a new tag
router.post('/', authenticateJwt, sanitizeRequestMiddleware, async (req, res, next) => {
  try {
    const { name, color, category, description } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const newTag = await TagsModel.createTag({
      name,
      color,
      category,
      description,
      created_by: req.user.username
    });
    
    await eventLogger.logDataEvent('create_tag', req.user.username, {
      tagId: newTag.id,
      tagName: newTag.name,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json(newTag);
  } catch (error) {
    console.error('Error creating tag:', error);
    
    // Check for duplicate tag name
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Tag with this name already exists' });
    }
    
    next(error);
  }
});

// Add tags to a log - FIXED VERSION
router.post('/log/:logId', authenticateJwt, sanitizeRequestMiddleware, async (req, res, next) => {
  try {
    const logId = parseInt(req.params.logId);
    const { tagIds, tagNames } = req.body;
    
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log ID' });
    }
    
    console.log('Adding tags to log:', { logId, tagIds, tagNames }); // Debug logging
    
    let updatedTags = [];
    
    // Process tag IDs first (existing tags)
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      await TagsModel.addTagsToLog(logId, tagIds, req.user.username);
    }
    
    // Then process tag names (new tags to create)
    if (tagNames && Array.isArray(tagNames) && tagNames.length > 0) {
      // This will create the tags and add them
      updatedTags = await TagsModel.addTagsByNameToLog(logId, tagNames, req.user.username);
    } else if (tagIds && tagIds.length > 0) {
      // If only tagIds were provided, get all tags for the log
      updatedTags = await TagsModel.getLogTags(logId);
    }
    
    await eventLogger.logDataEvent('add_tags_to_log', req.user.username, {
      logId,
      tagIdsCount: tagIds?.length || 0,
      tagNamesCount: tagNames?.length || 0,
      totalTags: updatedTags.length,
      timestamp: new Date().toISOString()
    });
    
    console.log('Tags successfully added, returning:', updatedTags); // Debug logging
    
    res.json(updatedTags);
  } catch (error) {
    console.error('Error adding tags to log:', error);
    next(error);
  }
});

// Remove a tag from a log - Let the model handle protection
router.delete('/log/:logId/tag/:tagId', authenticateJwt, async (req, res, next) => {
  try {
    const logId = parseInt(req.params.logId);
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(logId) || isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid log ID or tag ID' });
    }
    
    // Let the model handle all protection logic
    await TagsModel.removeTagFromLog(logId, tagId);
    
    await eventLogger.logDataEvent('remove_tag_from_log', req.user.username, {
      logId,
      tagId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ message: 'Tag removed successfully' });
  } catch (error) {
    console.error('Error removing tag from log:', error);
    
    // Handle operation tag protection error from model
    if (error.message === 'Cannot remove the native operation tag from this log') {
      return res.status(403).json({ 
        error: 'Cannot remove native operation tag',
        message: 'This is the primary operation tag for this log and cannot be removed. Other operation tags can be removed.'
      });
    }
    
    next(error);
  }
});

// Remove all tags from a log
router.delete('/log/:logId/all', authenticateJwt, async (req, res, next) => {
  try {
    const logId = parseInt(req.params.logId);
    
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log ID' });
    }
    
    const removedTags = await TagsModel.removeAllTagsFromLog(logId);
    
    await eventLogger.logDataEvent('remove_all_tags_from_log', req.user.username, {
      logId,
      removedCount: removedTags.length,
      timestamp: new Date().toISOString()
    });
    
    res.json({ message: 'All tags removed successfully', count: removedTags.length });
  } catch (error) {
    console.error('Error removing all tags from log:', error);
    next(error);
  }
});

// Update a tag (admin only) - PROTECTED VERSION
router.put('/:tagId', authenticateJwt, verifyAdmin, sanitizeRequestMiddleware, async (req, res, next) => {
  try {
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid tag ID' });
    }
    
    const updatedTag = await TagsModel.updateTag(tagId, req.body);
    
    if (!updatedTag) {
      return res.status(404).json({ error: 'Tag not found or no valid updates provided' });
    }
    
    await eventLogger.logDataEvent('update_tag', req.user.username, {
      tagId,
      updates: Object.keys(req.body),
      timestamp: new Date().toISOString()
    });
    
    res.json(updatedTag);
  } catch (error) {
    console.error('Error updating tag:', error);
    
    // Check for operation tag protection
    if (error.message === 'Cannot modify operation tags') {
      return res.status(403).json({ 
        error: 'Operation tags cannot be modified',
        message: 'This tag is associated with an operation and cannot be changed'
      });
    }
    
    // Check for duplicate tag name
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Tag with this name already exists' });
    }
    
    next(error);
  }
});

// Delete a tag (admin only) - PROTECTED VERSION
router.delete('/:tagId', authenticateJwt, verifyAdmin, async (req, res, next) => {
  try {
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid tag ID' });
    }
    
    const deletedTag = await TagsModel.deleteTag(tagId);
    
    if (!deletedTag) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    await eventLogger.logDataEvent('delete_tag', req.user.username, {
      tagId,
      tagName: deletedTag.name,
      timestamp: new Date().toISOString()
    });
    
    res.json({ message: 'Tag deleted successfully', tag: deletedTag });
  } catch (error) {
    console.error('Error deleting tag:', error);
    
    // Check for operation tag protection
    if (error.message === 'Cannot delete operation tags') {
      return res.status(403).json({ 
        error: 'Operation tags cannot be deleted',
        message: 'This tag is associated with an operation and cannot be removed'
      });
    }
    
    next(error);
  }
});

// Get logs by tag filter
router.post('/filter', authenticateJwt, async (req, res, next) => {
  try {
    const { tagIds, tagNames } = req.body;
    
    let logs;
    
    if (tagIds && Array.isArray(tagIds)) {
      logs = await TagsModel.getLogsByTagIds(tagIds);
    } else if (tagNames && Array.isArray(tagNames)) {
      logs = await TagsModel.getLogsByTagNames(tagNames);
    } else {
      return res.status(400).json({ error: 'Either tagIds or tagNames array is required' });
    }
    
    await eventLogger.logDataEvent('filter_logs_by_tags', req.user.username, {
      filterType: tagIds ? 'ids' : 'names',
      filterCount: tagIds?.length || tagNames?.length,
      resultCount: logs.length,
      timestamp: new Date().toISOString()
    });
    
    res.json(logs);
  } catch (error) {
    console.error('Error filtering logs by tags:', error);
    next(error);
  }
});

module.exports = router;