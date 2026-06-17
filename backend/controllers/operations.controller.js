// backend/controllers/operations.controller.js
const OperationsModel = require('../models/operations');
const { redisClient } = require('../lib/redis');
const eventLogger = require('../lib/eventLogger');

const operationsController = {
  /**
   * Create a new operation (admin only)
   */
  async createOperation(req, res) {
    try {
      const { name, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Operation name is required' });
      }
      
      const operation = await OperationsModel.createOperation({
        name,
        description,
        created_by: req.user.username
      });
      
      await eventLogger.logAuditEvent('operation_created', req.user.username, {
        operationId: operation.id,
        operationName: operation.name,
        ip: req.ip
      });
      
      res.status(201).json(operation);
    } catch (error) {
      console.error('Error creating operation:', error);
      res.status(500).json({ error: error.message || 'Failed to create operation' });
    }
  },

  /**
   * Get all operations
   */
  async getAllOperations(req, res) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const operations = await OperationsModel.getAllOperations(includeInactive);
      res.json(operations);
    } catch (error) {
      console.error('Error fetching operations:', error);
      res.status(500).json({ error: 'Failed to fetch operations' });
    }
  },

  /**
   * Update an operation (admin only)
   */
  async updateOperation(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const operation = await OperationsModel.updateOperation(id, updates);
      
      if (!operation) {
        return res.status(404).json({ error: 'Operation not found' });
      }
      
      await eventLogger.logAuditEvent('operation_updated', req.user.username, {
        operationId: id,
        updates,
        ip: req.ip
      });
      
      res.json(operation);
    } catch (error) {
      console.error('Error updating operation:', error);
      res.status(500).json({ error: error.message || 'Failed to update operation' });
    }
  },

  /**
   * Delete an operation (admin only)
   */
  async deleteOperation(req, res) {
    try {
      const { id } = req.params;
      
      const operation = await OperationsModel.deleteOperation(id);
      
      if (!operation) {
        return res.status(404).json({ error: 'Operation not found' });
      }
      
      await eventLogger.logAuditEvent('operation_deleted', req.user.username, {
        operationId: id,
        operationName: operation.name,
        ip: req.ip
      });
      
      res.json({ message: 'Operation deactivated successfully' });
    } catch (error) {
      console.error('Error deleting operation:', error);
      res.status(500).json({ error: 'Failed to delete operation' });
    }
  },

  /**
   * Assign user to operation (admin only)
   */
  async assignUserToOperation(req, res) {
    try {
      const { id } = req.params;
      const { username, isPrimary } = req.body;
      
      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }
      
      const assignment = await OperationsModel.assignUserToOperation(
        username,
        id,
        req.user.username,
        isPrimary
      );
      
      await eventLogger.logAuditEvent('user_assigned_to_operation', req.user.username, {
        operationId: id,
        assignedUser: username,
        isPrimary,
        ip: req.ip
      });
      
      res.json(assignment);
    } catch (error) {
      console.error('Error assigning user:', error);
      res.status(500).json({ error: 'Failed to assign user to operation' });
    }
  },

  /**
   * Remove user from operation (admin only)
   */
  async removeUserFromOperation(req, res) {
    try {
      const { id, username } = req.params;
      
      const removed = await OperationsModel.removeUserFromOperation(username, id);
      
      if (!removed) {
        return res.status(404).json({ error: 'Assignment not found' });
      }
      
      await eventLogger.logAuditEvent('user_removed_from_operation', req.user.username, {
        operationId: id,
        removedUser: username,
        ip: req.ip
      });
      
      res.json({ message: 'User removed from operation successfully' });
    } catch (error) {
      console.error('Error removing user:', error);
      res.status(500).json({ error: 'Failed to remove user from operation' });
    }
  },

  /**
   * Get users assigned to an operation (admin only)
   */
  async getOperationUsers(req, res) {
    try {
      const { id } = req.params;
      const users = await OperationsModel.getOperationUsers(id);
      res.json(users);
    } catch (error) {
      console.error('Error fetching operation users:', error);
      res.status(500).json({ error: 'Failed to fetch operation users' });
    }
  },

  /**
   * Get current user's operations.
   * Admins receive every operation and a canViewAll flag so the UI can show
   * the "All Operations" option.  Regular users get their assigned operations.
   */
  async getMyOperations(req, res) {
    try {
      const isAdmin = req.user.role === 'admin';
      const username = req.user.username;

      if (isAdmin) {
        const allOps = await OperationsModel.getAllOperations(false);
        // Reshape to match the user_operations join shape the frontend expects
        const operations = allOps.map(op => ({
          operation_id: op.id,
          operation_name: op.name,
          operation_description: op.description,
          tag_id: op.tag_id,
          tag_name: op.tag_name,
          tag_color: op.tag_color,
          is_primary: false,
        }));

        const viewOp = await OperationsModel.getAdminViewOperation(username);
        return res.json({
          operations,
          activeOperationId: viewOp ? viewOp.id : null,
          canViewAll: true,
        });
      }

      const operations = await OperationsModel.getUserOperations(username);
      const activeOp = await OperationsModel.getUserActiveOperation(username);
      res.json({
        operations,
        activeOperationId: activeOp ? activeOp.id : null,
      });
    } catch (error) {
      console.error('Error fetching user operations:', error);
      res.status(500).json({ error: 'Failed to fetch user operations' });
    }
  },

  /**
   * Set the active (view) operation.
   * Admins: operationId === null means "All Operations" — stores the "ALL"
   * sentinel in Redis and does not touch user_operations.  For a real operation
   * ID the view filter and the log-creation active_operation are both updated.
   * Regular users: existing behaviour (validates user_operations membership).
   */
  async setActiveOperation(req, res) {
    try {
      const { operationId } = req.body;
      const isAdmin = req.user.role === 'admin';
      const username = req.user.username;

      if (isAdmin) {
        if (!operationId) {
          // "All Operations" mode
          await redisClient.set(`user:${username}:admin_view_filter`, 'ALL');
          await eventLogger.logAuditEvent('active_operation_changed', username, {
            operationId: null,
            viewMode: 'all',
            ip: req.ip,
          });
          return res.json({ message: 'Viewing all operations', operationId: null });
        }

        // Scope view to a specific operation and also set it as the active
        // operation so new logs get auto-tagged with it.
        await redisClient.set(`user:${username}:admin_view_filter`, operationId.toString());
        await redisClient.set(`user:${username}:active_operation`, operationId.toString());
        await eventLogger.logAuditEvent('active_operation_changed', username, {
          operationId,
          ip: req.ip,
        });
        return res.json({ message: 'Active operation updated successfully', operationId });
      }

      // Non-admin path — unchanged
      if (!operationId) {
        return res.status(400).json({ error: 'Operation ID is required' });
      }

      await OperationsModel.setUserActiveOperation(username, operationId);
      await eventLogger.logAuditEvent('active_operation_changed', username, {
        operationId,
        ip: req.ip,
      });
      res.json({ message: 'Active operation updated successfully', operationId });
    } catch (error) {
      console.error('Error setting active operation:', error);
      res.status(500).json({ error: error.message || 'Failed to set active operation' });
    }
  },

  /**
   * Get current user's active operation
   */
  async getActiveOperation(req, res) {
    try {
      const activeOp = await OperationsModel.getUserActiveOperation(req.user.username);

      if (!activeOp) {
        return res.json(null);
      }

      res.json({
        id: activeOp.id,
        name: activeOp.name,
        tag_id: activeOp.tag_id,
        tag_name: activeOp.tag_name,
        tag_color: activeOp.tag_color
      });
    } catch (error) {
      console.error('Error fetching active operation:', error);
      res.status(500).json({ error: 'Failed to fetch active operation' });
    }
  }
};

module.exports = operationsController;