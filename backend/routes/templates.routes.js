// routes/templates.routes.js
const express = require('express');
const router = express.Router();
const TemplatesModel = require('../models/templates');
const eventLogger = require('../lib/eventLogger');
const { authenticateJwt } = require('../middleware/jwt.middleware');

// Get all templates
router.get('/', authenticateJwt, async (req, res, next) => {
  try {
    const templates = await TemplatesModel.getAllTemplates();
    
    // Log the template access for audit purposes
    await eventLogger.logAuditEvent('view_templates', req.user.username, {
      count: templates.length,
      timestamp: new Date().toISOString()
    });
    
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    await eventLogger.logDataEvent('view_templates_error', req.user.username, {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

// Create a new template
router.post('/', authenticateJwt, async (req, res, next) => {
  try {
    const { name, data } = req.body;
    
    // Validate input
    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Template data is required' });
    }
    
    // Create the template
    const newTemplate = await TemplatesModel.createTemplate({
      name,
      data,
      created_by: req.user.username
    });
    
    // Log the template creation
    await eventLogger.logAuditEvent('create_template', req.user.username, {
      templateName: name,
      templateId: newTemplate.id,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('Error creating template:', error);
    await eventLogger.logDataEvent('create_template_error', req.user.username, {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

// Update a template
router.put('/:id', authenticateJwt, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, data } = req.body;
    
    // Validate input
    if (!name && !data) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }
    
    const updatedTemplate = await TemplatesModel.updateTemplate(id, { name, data });
    
    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Log the template update
    await eventLogger.logAuditEvent('update_template', req.user.username, {
      templateId: id,
      templateName: updatedTemplate.name,
      timestamp: new Date().toISOString()
    });
    
    res.json(updatedTemplate);
  } catch (error) {
    console.error('Error updating template:', error);
    await eventLogger.logDataEvent('update_template_error', req.user.username, {
      error: error.message,
      templateId: parseInt(req.params.id),
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

// Delete a template
router.delete('/:id', authenticateJwt, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    
    const deletedTemplate = await TemplatesModel.deleteTemplate(id);
    
    if (!deletedTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Log the template deletion
    await eventLogger.logAuditEvent('delete_template', req.user.username, {
      templateId: id,
      templateName: deletedTemplate.name,
      timestamp: new Date().toISOString()
    });
    
    res.json({ message: 'Template deleted successfully', id });
  } catch (error) {
    console.error('Error deleting template:', error);
    await eventLogger.logDataEvent('delete_template_error', req.user.username, {
      error: error.message,
      templateId: parseInt(req.params.id),
      timestamp: new Date().toISOString()
    });
    next(error);
  }
});

module.exports = router;