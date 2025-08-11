// backend/models/tags.js
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
   * Remove a tag from a log
   */
  static async removeTagFromLog(logId, tagId) {
    try {
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
   * Remove all tags from a log
   */
  static async removeAllTagsFromLog(logId) {
    try {
      const result = await db.query(
        `DELETE FROM log_tags WHERE log_id = $1 RETURNING *`,
        [logId]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error removing all tags from log:', error);
      throw error;
    }
  }

  /**
   * Update a tag (admin only)
   */
  static async updateTag(tagId, updates) {
    try {
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
   * Delete a tag (admin only)
   * This will cascade delete all log_tags references
   */
  static async deleteTag(tagId) {
    try {
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