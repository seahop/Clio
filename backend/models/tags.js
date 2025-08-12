// backend/models/tags.js - Updated with smart operation tag protection
const db = require('../db');

class TagsModel {
  /**
   * Get all tags
   */
  static async getAllTags() {
    try {
      const result = await db.query(
        `SELECT * FROM tags ORDER BY category, name`
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting all tags:', error);
      throw error;
    }
  }

  /**
   * Get tags for a specific log
   */
  static async getLogTags(logId) {
    try {
      const result = await db.query(
        `SELECT t.*, lt.tagged_by, lt.tagged_at
         FROM tags t
         JOIN log_tags lt ON t.id = lt.tag_id
         WHERE lt.log_id = $1
         ORDER BY lt.tagged_at DESC`,
        [logId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting log tags:', error);
      throw error;
    }
  }

  /**
   * Get tags for multiple logs (batch operation)
   */
  static async getTagsForLogs(logIds) {
    try {
      if (!logIds || logIds.length === 0) {
        return {};
      }

      const result = await db.query(
        `SELECT lt.log_id, t.*, lt.tagged_by, lt.tagged_at
         FROM tags t
         JOIN log_tags lt ON t.id = lt.tag_id
         WHERE lt.log_id = ANY($1)
         ORDER BY lt.log_id, lt.tagged_at DESC`,
        [logIds]
      );

      // Group tags by log_id
      const tagsByLogId = {};
      result.rows.forEach(row => {
        if (!tagsByLogId[row.log_id]) {
          tagsByLogId[row.log_id] = [];
        }
        tagsByLogId[row.log_id].push({
          id: row.id,
          name: row.name,
          color: row.color,
          category: row.category,
          description: row.description,
          tagged_by: row.tagged_by,
          tagged_at: row.tagged_at
        });
      });

      return tagsByLogId;
    } catch (error) {
      console.error('Error getting tags for multiple logs:', error);
      throw error;
    }
  }

  /**
   * Check if a tag is the native operation tag for a log
   * A native operation tag is one that was auto-assigned when the log was created
   */
  static async isNativeOperationTag(logId, tagId) {
    try {
      // Get the log's analyst and creation time
      const logResult = await db.query(
        `SELECT analyst, created_at FROM logs WHERE id = $1`,
        [logId]
      );
      
      if (logResult.rows.length === 0) {
        return false;
      }
      
      const { analyst, created_at } = logResult.rows[0];
      
      // Get the user's active operation at the time of log creation
      // This would be the native operation
      const nativeOpResult = await db.query(
        `SELECT 
          o.tag_id
         FROM user_operations uo
         JOIN operations o ON uo.operation_id = o.id
         WHERE uo.username = $1
           AND o.tag_id = $2
           AND o.is_active = true`,
        [analyst, tagId]
      );
      
      // If this tag matches the user's active operation, it's likely native
      // But we also need to check timing to be sure
      if (nativeOpResult.rows.length > 0) {
        // Check when this tag was added to the log
        const tagTimingResult = await db.query(
          `SELECT 
            lt.tagged_at,
            lt.tagged_by
           FROM log_tags lt
           WHERE lt.log_id = $1 AND lt.tag_id = $2`,
          [logId, tagId]
        );
        
        if (tagTimingResult.rows.length > 0) {
          const { tagged_at, tagged_by } = tagTimingResult.rows[0];
          
          // Check if this tag was added at approximately the same time as log creation
          // (within 10 seconds) and by the same user
          const createdAt = new Date(created_at);
          const taggedAt = new Date(tagged_at);
          const timeDiff = Math.abs(taggedAt - createdAt) / 1000; // difference in seconds
          
          // It's a native operation tag if:
          // 1. It was tagged within 10 seconds of log creation (increased from 5)
          // 2. It was tagged by the same user who created the log
          const isNative = timeDiff <= 10 && tagged_by === analyst;
          
          console.log(`Native tag check for log ${logId}, tag ${tagId}:`);
          console.log(`  - Created at: ${createdAt.toISOString()}`);
          console.log(`  - Tagged at: ${taggedAt.toISOString()}`);
          console.log(`  - Time diff: ${timeDiff}s`);
          console.log(`  - Tagged by: ${tagged_by}, Analyst: ${analyst}`);
          console.log(`  - Is native: ${isNative}`);
          
          return isNative;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking if tag is native operation tag:', error);
      return false;
    }
  }

  /**
   * Create a new tag (normalized to lowercase)
   */
  static async createTag(tagData) {
    try {
      const { name, color, category, description, created_by } = tagData;
      
      // Normalize tag name to lowercase
      const normalizedName = name.toLowerCase().trim();
      
      // Validate color format (hex)
      const colorRegex = /^#[0-9A-F]{6}$/i;
      const validColor = colorRegex.test(color) ? color : '#6B7280';
      
      const result = await db.query(
        `INSERT INTO tags (name, color, category, description, created_by, is_default)
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT (name) DO UPDATE 
         SET updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [normalizedName, validColor, category, description, created_by]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating tag:', error);
      throw error;
    }
  }

  /**
   * Get or create a tag by name - WITHOUT TRANSACTIONS VERSION
   */
  static async getOrCreateTag(name, username) {
    try {
      const normalizedName = name.toLowerCase().trim();
      
      // First try to get existing tag
      let result = await db.query(
        `SELECT * FROM tags WHERE name = $1`,
        [normalizedName]
      );
      
      if (result.rows.length > 0) {
        console.log('Found existing tag:', result.rows[0]);
        return result.rows[0];
      }
      
      // If not found, create new tag
      // Use ON CONFLICT to handle race conditions
      result = await db.query(
        `INSERT INTO tags (name, color, category, description, created_by, is_default)
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT (name) DO UPDATE 
         SET updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [normalizedName, '#6B7280', 'custom', null, username]
      );
      
      console.log('Created new tag:', result.rows[0]);
      return result.rows[0];
      
    } catch (error) {
      console.error('Error in getOrCreateTag:', error);
      
      // If we get a unique constraint error, try to fetch the tag again
      // This handles race conditions where another request created the tag
      if (error.code === '23505') {
        const result = await db.query(
          `SELECT * FROM tags WHERE name = $1`,
          [name.toLowerCase().trim()]
        );
        
        if (result.rows.length > 0) {
          return result.rows[0];
        }
      }
      
      throw error;
    }
  }

  /**
   * Add tags to a log (batch operation)
   */
  static async addTagsToLog(logId, tagIds, username) {
    try {
      if (!tagIds || tagIds.length === 0) {
        return [];
      }

      // Build batch insert query
      const values = tagIds.map((tagId, index) => 
        `($1, $${index + 2}, $${tagIds.length + 2})`
      ).join(',');
      
      const params = [logId, ...tagIds, username];
      
      const result = await db.query(
        `INSERT INTO log_tags (log_id, tag_id, tagged_by)
         VALUES ${values}
         ON CONFLICT (log_id, tag_id) DO NOTHING
         RETURNING *`,
        params
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error adding tags to log:', error);
      throw error;
    }
  }

  /**
   * Add tags by name to a log (creates tags if they don't exist)
   */
  static async addTagsByNameToLog(logId, tagNames, username) {
    try {
      if (!tagNames || tagNames.length === 0) {
        return [];
      }

      const tagIds = [];
      const createdTags = []; // Track newly created tags
      
      // Get or create each tag
      for (const tagName of tagNames) {
        const tag = await this.getOrCreateTag(tagName, username);
        tagIds.push(tag.id);
        createdTags.push(tag);
      }
      
      // Add tags to log
      await this.addTagsToLog(logId, tagIds, username);
      
      // Return ALL tags for this log (not just the newly added ones)
      // This ensures the response includes both new and existing tags
      return await this.getLogTags(logId);
    } catch (error) {
      console.error('Error adding tags by name to log:', error);
      throw error;
    }
  }

  /**
   * Remove a tag from a log - ONLY protect the FIRST operation tag (native)
   * The first operation tag added to a log is considered native and protected
   */
  static async removeTagFromLog(logId, tagId) {
    try {
      // First, check if this is an operation tag
      const tagResult = await db.query(
        `SELECT category, name FROM tags WHERE id = $1`,
        [tagId]
      );
      
      if (tagResult.rows.length > 0) {
        const tag = tagResult.rows[0];
        // If it's an operation tag, check if it's the first/native one
        if (tag.category === 'operation' && tag.name.startsWith('OP:')) {
          // Get all operation tags for this log, ordered by when they were added
          const allOpTags = await db.query(
            `SELECT 
              lt.tag_id,
              lt.tagged_at,
              t.name
             FROM log_tags lt
             JOIN tags t ON lt.tag_id = t.id
             WHERE lt.log_id = $1
               AND t.category = 'operation'
               AND t.name LIKE 'OP:%'
             ORDER BY lt.tagged_at ASC`,
            [logId]
          );
          
          // If this is the FIRST operation tag (native), protect it
          if (allOpTags.rows.length > 0 && allOpTags.rows[0].tag_id === tagId) {
            console.warn(`Attempted to remove native operation tag: ${tag.name} from log ${logId}`);
            console.log('This was the first operation tag added to the log');
            throw new Error('Cannot remove the native operation tag from this log');
          }
          
          // If it's not the first operation tag, allow removal
          console.log(`Allowing removal of manually added operation tag: ${tag.name} from log ${logId}`);
          console.log(`This log has ${allOpTags.rows.length} operation tags, removing tag at position ${allOpTags.rows.findIndex(r => r.tag_id === tagId) + 1}`);
        }
      }
      
      // Proceed with removal (either not an operation tag, or not the first one)
      const result = await db.query(
        `DELETE FROM log_tags
         WHERE log_id = $1 AND tag_id = $2
         RETURNING *`,
        [logId, tagId]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error removing tag from log:', error);
      throw error;
    }
  }

  /**
   * Remove all tags from a log - EXCEPT the first operation tag (native)
   */
  static async removeAllTagsFromLog(logId) {
    try {
      // Get the first operation tag for this log (native)
      const firstOpTag = await db.query(
        `SELECT lt.tag_id
         FROM log_tags lt
         JOIN tags t ON lt.tag_id = t.id
         WHERE lt.log_id = $1 
           AND t.category = 'operation' 
           AND t.name LIKE 'OP:%'
         ORDER BY lt.tagged_at ASC
         LIMIT 1`,
        [logId]
      );
      
      // Remove all tags except the first operation tag if it exists
      let query;
      let params;
      
      if (firstOpTag.rows.length > 0) {
        query = `DELETE FROM log_tags 
                 WHERE log_id = $1 
                 AND tag_id != $2
                 RETURNING *`;
        params = [logId, firstOpTag.rows[0].tag_id];
      } else {
        // No operation tags, can remove all
        query = `DELETE FROM log_tags WHERE log_id = $1 RETURNING *`;
        params = [logId];
      }
      
      const result = await db.query(query, params);
      
      return result.rows;
    } catch (error) {
      console.error('Error removing all tags from log:', error);
      throw error;
    }
  }

  /**
   * Update a tag (admin only) - PROTECTED against operation tag modification
   */
  static async updateTag(tagId, updates) {
    try {
      // First check if this is an operation tag
      const tagCheck = await db.query(
        `SELECT category, name FROM tags WHERE id = $1`,
        [tagId]
      );
      
      if (tagCheck.rows.length > 0) {
        const tag = tagCheck.rows[0];
        // Prevent modification of any operation tags (both native and manual)
        // This is for data integrity - operation tags should remain consistent
        if (tag.category === 'operation' && tag.name.startsWith('OP:')) {
          throw new Error('Cannot modify operation tags');
        }
      }
      
      const allowedUpdates = ['name', 'color', 'category', 'description'];
      
      // Filter out any fields that aren't in allowedUpdates
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key];
          return obj;
        }, {});

      // If name is being updated, normalize it
      if (filteredUpdates.name) {
        filteredUpdates.name = filteredUpdates.name.toLowerCase().trim();
      }
      
      // Validate color if provided
      if (filteredUpdates.color) {
        const colorRegex = /^#[0-9A-F]{6}$/i;
        if (!colorRegex.test(filteredUpdates.color)) {
          delete filteredUpdates.color;
        }
      }

      // If there are no valid updates, return null
      if (Object.keys(filteredUpdates).length === 0) {
        return null;
      }

      // Build the SET clause dynamically
      const setClause = Object.keys(filteredUpdates)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');

      const values = [tagId, ...Object.values(filteredUpdates)];

      const result = await db.query(
        `UPDATE tags SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error updating tag:', error);
      throw error;
    }
  }

  /**
   * Delete a tag (admin only) - PROTECTED against operation tag deletion
   * This will cascade delete all log_tags references
   */
  static async deleteTag(tagId) {
    try {
      // First check if this is an operation tag
      const tagCheck = await db.query(
        `SELECT category, name FROM tags WHERE id = $1`,
        [tagId]
      );
      
      if (tagCheck.rows.length > 0) {
        const tag = tagCheck.rows[0];
        // Prevent deletion of any operation tags
        if (tag.category === 'operation' && tag.name.startsWith('OP:')) {
          throw new Error('Cannot delete operation tags');
        }
      }
      
      const result = await db.query(
        `DELETE FROM tags WHERE id = $1 RETURNING *`,
        [tagId]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting tag:', error);
      throw error;
    }
  }

  /**
   * Get tag usage statistics
   */
  static async getTagStats() {
    try {
      const result = await db.query(
        `SELECT 
          t.*,
          COUNT(lt.log_id) as usage_count,
          MAX(lt.tagged_at) as last_used
         FROM tags t
         LEFT JOIN log_tags lt ON t.id = lt.tag_id
         GROUP BY t.id
         ORDER BY usage_count DESC, t.name`
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting tag statistics:', error);
      throw error;
    }
  }

  /**
   * Search tags by name (autocomplete)
   */
  static async searchTags(query) {
    try {
      const searchTerm = `%${query.toLowerCase()}%`;
      
      const result = await db.query(
        `SELECT * FROM tags
         WHERE LOWER(name) LIKE $1
         ORDER BY 
           CASE WHEN LOWER(name) = $2 THEN 0 ELSE 1 END,
           LENGTH(name),
           name
         LIMIT 20`,
        [searchTerm, query.toLowerCase()]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error searching tags:', error);
      throw error;
    }
  }

  /**
   * Get logs by tag IDs
   */
  static async getLogsByTagIds(tagIds) {
    try {
      if (!tagIds || tagIds.length === 0) {
        return [];
      }

      const result = await db.query(
        `SELECT DISTINCT l.*
         FROM logs l
         JOIN log_tags lt ON l.id = lt.log_id
         WHERE lt.tag_id = ANY($1)
         ORDER BY l.timestamp DESC`,
        [tagIds]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting logs by tag IDs:', error);
      throw error;
    }
  }

  /**
   * Get logs by tag names
   */
  static async getLogsByTagNames(tagNames) {
    try {
      if (!tagNames || tagNames.length === 0) {
        return [];
      }

      // Normalize tag names
      const normalizedNames = tagNames.map(name => name.toLowerCase().trim());

      const result = await db.query(
        `SELECT DISTINCT l.*
         FROM logs l
         JOIN log_tags lt ON l.id = lt.log_id
         JOIN tags t ON lt.tag_id = t.id
         WHERE t.name = ANY($1)
         ORDER BY l.timestamp DESC`,
        [normalizedNames]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting logs by tag names:', error);
      throw error;
    }
  }

  /**
   * Get tag co-occurrence data for analysis
   */
  static async getTagCoOccurrence(tagId) {
    try {
      const result = await db.query(
        `SELECT 
          t2.id,
          t2.name,
          t2.color,
          t2.category,
          COUNT(*) as co_occurrence_count
         FROM log_tags lt1
         JOIN log_tags lt2 ON lt1.log_id = lt2.log_id AND lt1.tag_id != lt2.tag_id
         JOIN tags t2 ON lt2.tag_id = t2.id
         WHERE lt1.tag_id = $1
         GROUP BY t2.id
         ORDER BY co_occurrence_count DESC
         LIMIT 10`,
        [tagId]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting tag co-occurrence:', error);
      throw error;
    }
  }
}

module.exports = TagsModel;