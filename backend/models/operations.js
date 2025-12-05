// backend/models/operations.js - Fixed Redis caching bug
const db = require('../db');
const { redisClient } = require('../lib/redis');

class OperationsModel {
  /**
   * Create a new operation
   */
  static async createOperation(data) {
    try {
      const result = await db.query(
        `INSERT INTO operations (name, description, created_by)
         VALUES ($1, $2, $3)
         RETURNING *, 
         (SELECT t.name FROM tags t WHERE t.id = operations.tag_id) as tag_name,
         (SELECT t.color FROM tags t WHERE t.id = operations.tag_id) as tag_color`,
        [data.name, data.description, data.created_by]
      );
      
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Operation with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Get all operations
   */
  static async getAllOperations(includeInactive = false) {
    try {
      const query = includeInactive
        ? `SELECT o.*, t.name as tag_name, t.color as tag_color,
           (SELECT COUNT(*) FROM user_operations uo WHERE uo.operation_id = o.id) as user_count
           FROM operations o
           LEFT JOIN tags t ON o.tag_id = t.id
           ORDER BY o.created_at DESC`
        : `SELECT o.*, t.name as tag_name, t.color as tag_color,
           (SELECT COUNT(*) FROM user_operations uo WHERE uo.operation_id = o.id) as user_count
           FROM operations o
           LEFT JOIN tags t ON o.tag_id = t.id
           WHERE o.is_active = true
           ORDER BY o.created_at DESC`;
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error fetching operations:', error);
      throw error;
    }
  }

  /**
   * Get operation by ID
   */
  static async getOperationById(id) {
    try {
      const result = await db.query(
        `SELECT o.*, t.name as tag_name, t.color as tag_color
         FROM operations o
         LEFT JOIN tags t ON o.tag_id = t.id
         WHERE o.id = $1`,
        [id]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching operation:', error);
      throw error;
    }
  }

  /**
   * Get operation by name
   */
  static async getOperationByName(name) {
    try {
      const result = await db.query(
        `SELECT o.*, t.id as tag_id, t.name as tag_name, t.color as tag_color
         FROM operations o
         LEFT JOIN tags t ON o.tag_id = t.id
         WHERE o.name = $1 AND o.is_active = true`,
        [name]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error fetching operation by name:', error);
      throw error;
    }
  }

  /**
   * Update an operation
   */
  static async updateOperation(id, updates) {
    try {
      const fields = [];
      const values = [];
      let valueIndex = 1;
      
      if (updates.name !== undefined) {
        fields.push(`name = $${valueIndex++}`);
        values.push(updates.name);
      }
      
      if (updates.description !== undefined) {
        fields.push(`description = $${valueIndex++}`);
        values.push(updates.description);
      }
      
      if (updates.is_active !== undefined) {
        fields.push(`is_active = $${valueIndex++}`);
        values.push(updates.is_active);
      }
      
      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);
      
      const result = await db.query(
        `UPDATE operations 
         SET ${fields.join(', ')}
         WHERE id = $${valueIndex}
         RETURNING *, 
         (SELECT t.name FROM tags t WHERE t.id = operations.tag_id) as tag_name`,
        values
      );
      
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new Error('Operation with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Delete an operation (soft delete by deactivating)
   */
  static async deleteOperation(id) {
    try {
      const result = await db.query(
        `UPDATE operations SET is_active = false WHERE id = $1 RETURNING *`,
        [id]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting operation:', error);
      throw error;
    }
  }

  /**
   * Assign user to operation
   */
  static async assignUserToOperation(username, operationId, assignedBy, isPrimary = false) {
    try {
      // If setting as primary, unset other primary operations for this user
      if (isPrimary) {
        await db.query(
          `UPDATE user_operations SET is_primary = false WHERE username = $1`,
          [username]
        );
      }
      
      const result = await db.query(
        `INSERT INTO user_operations (username, operation_id, is_primary, assigned_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username, operation_id) 
         DO UPDATE SET is_primary = EXCLUDED.is_primary, last_accessed = CURRENT_TIMESTAMP
         RETURNING *`,
        [username, operationId, isPrimary, assignedBy]
      );
      
      // Clear Redis cache for user's operations
      try {
        await redisClient.del(`user:${username}:operations`);
      } catch (redisError) {
        console.error('Error clearing Redis cache:', redisError);
      }
      
      // If primary, set as active operation
      if (isPrimary) {
        try {
          await redisClient.set(`user:${username}:active_operation`, operationId.toString());
        } catch (redisError) {
          console.error('Error setting active operation in Redis:', redisError);
        }
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error assigning user to operation:', error);
      throw error;
    }
  }

  /**
   * Remove user from operation
   */
  static async removeUserFromOperation(username, operationId) {
    try {
      const result = await db.query(
        `DELETE FROM user_operations WHERE username = $1 AND operation_id = $2 RETURNING *`,
        [username, operationId]
      );
      
      // Clear Redis cache
      try {
        await redisClient.del(`user:${username}:operations`);
        const activeOp = await redisClient.get(`user:${username}:active_operation`);
        if (activeOp === operationId.toString()) {
          await redisClient.del(`user:${username}:active_operation`);
        }
      } catch (redisError) {
        console.error('Error clearing Redis cache:', redisError);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error removing user from operation:', error);
      throw error;
    }
  }

  /**
   * Get user's operations - FIXED Redis caching issue
   */
  static async getUserOperations(username) {
    try {
      // Check Redis cache first
      let cached = null;
      try {
        cached = await redisClient.get(`user:${username}:operations`);
      } catch (redisError) {
        console.error('Redis error, continuing without cache:', redisError);
      }
      
      if (cached) {
        try {
          // FIX: Check if cached is already a string that needs parsing
          if (typeof cached === 'string') {
            // Additional check to ensure it's valid JSON
            // Avoid parsing "[object Object]" strings
            if (cached.startsWith('[') || cached.startsWith('{')) {
              return JSON.parse(cached);
            } else {
              console.warn('Invalid cached data format, fetching fresh data');
              // Delete the corrupted cache entry
              try {
                await redisClient.del(`user:${username}:operations`);
              } catch (delError) {
                console.error('Error deleting corrupted cache:', delError);
              }
            }
          } else {
            // If it's already an object, return it directly
            console.warn('Cached data was not a string, returning as-is');
            return cached;
          }
        } catch (parseError) {
          console.error('Error parsing cached operations, fetching fresh data:', parseError);
          // Delete the corrupted cache entry
          try {
            await redisClient.del(`user:${username}:operations`);
          } catch (delError) {
            console.error('Error deleting corrupted cache:', delError);
          }
        }
      }
      
      const result = await db.query(
        `SELECT 
          uo.*,
          o.name as operation_name,
          o.description as operation_description,
          o.tag_id,
          t.name as tag_name,
          t.color as tag_color
         FROM user_operations uo
         JOIN operations o ON uo.operation_id = o.id
         LEFT JOIN tags t ON o.tag_id = t.id
         WHERE uo.username = $1 AND o.is_active = true
         ORDER BY uo.is_primary DESC, uo.last_accessed DESC`,
        [username]
      );
      
      // Cache for 5 minutes
      try {
        await redisClient.setEx(
          `user:${username}:operations`,
          300,
          JSON.stringify(result.rows)
        );
      } catch (redisError) {
        console.error('Error caching operations:', redisError);
        // Continue without caching
      }
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching user operations:', error);
      throw error;
    }
  }

  /**
   * Get user's active operation
   */
  static async getUserActiveOperation(username) {
    try {
      // Check Redis for active operation
      let activeOpId = null;
      try {
        activeOpId = await redisClient.get(`user:${username}:active_operation`);
      } catch (redisError) {
        console.error('Redis error, continuing without cache:', redisError);
      }
      
      if (activeOpId) {
        const operation = await this.getOperationById(activeOpId);
        if (operation && operation.is_active) {
          return operation;
        }
      }
      
      // Fallback to primary operation from database
      const result = await db.query(
        `SELECT o.*, t.name as tag_name, t.color as tag_color
         FROM user_operations uo
         JOIN operations o ON uo.operation_id = o.id
         LEFT JOIN tags t ON o.tag_id = t.id
         WHERE uo.username = $1 AND o.is_active = true
         ORDER BY uo.is_primary DESC, uo.last_accessed DESC
         LIMIT 1`,
        [username]
      );
      
      if (result.rows[0]) {
        // Cache the active operation
        try {
          await redisClient.set(
            `user:${username}:active_operation`,
            result.rows[0].id.toString()
          );
        } catch (redisError) {
          console.error('Error caching active operation:', redisError);
        }
        return result.rows[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user active operation:', error);
      throw error;
    }
  }

  /**
   * Set user's active operation
   */
  static async setUserActiveOperation(username, operationId) {
    try {
      // Verify user has access to this operation
      const result = await db.query(
        `UPDATE user_operations 
         SET last_accessed = CURRENT_TIMESTAMP
         WHERE username = $1 AND operation_id = $2
         RETURNING *`,
        [username, operationId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('User does not have access to this operation');
      }
      
      // Update Redis
      try {
        await redisClient.set(`user:${username}:active_operation`, operationId.toString());
      } catch (redisError) {
        console.error('Error updating active operation in Redis:', redisError);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error setting active operation:', error);
      throw error;
    }
  }

  /**
   * Get users assigned to an operation
   */
  static async getOperationUsers(operationId) {
    try {
      const result = await db.query(
        `SELECT 
          uo.*,
          uo.username,
          uo.is_primary,
          uo.assigned_by,
          uo.assigned_at,
          uo.last_accessed
         FROM user_operations uo
         WHERE uo.operation_id = $1
         ORDER BY uo.username`,
        [operationId]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching operation users:', error);
      throw error;
    }
  }

  /**
   * Auto-tag logs with operation tag
   */
  static async autoTagLogWithOperation(logId, username) {
    try {
      // Get user's active operation
      const activeOp = await this.getUserActiveOperation(username);
      
      if (!activeOp || !activeOp.tag_id) {
        return null;
      }
      
      // Add tag to log
      const result = await db.query(
        `INSERT INTO log_tags (log_id, tag_id, tagged_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (log_id, tag_id) DO NOTHING
         RETURNING *`,
        [logId, activeOp.tag_id, username]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error auto-tagging log:', error);
      // Don't throw - auto-tagging failure shouldn't break log creation
      return null;
    }
  }
}

module.exports = OperationsModel;