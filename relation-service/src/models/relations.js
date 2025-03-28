// relation-service/src/models/relations.js
const db = require('../db');

// Cache for relations data
const RELATIONS_CACHE_TTL = 30000; // 30 seconds
let relationsCache = new Map();

class RelationsModel {
  /**
   * Upsert a relation with optimized query
   */
  static async upsertRelation(sourceType, sourceValue, targetType, targetValue, metadata = {}) {
    try {
      // Validate required values before proceeding
      if (!sourceType || sourceValue === null || sourceValue === undefined || 
          !targetType || targetValue === null || targetValue === undefined) {
        console.log('Skipping relation with null/undefined values:', {
          sourceType, sourceValue, targetType, targetValue
        });
        return null;
      }
      
      // Convert empty strings to placeholder values rather than null
      sourceValue = sourceValue || '[empty]';
      targetValue = targetValue || '[empty]';
      
      // Normalize MAC addresses if present
      if (sourceType === 'mac_address') {
        sourceValue = sourceValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || sourceValue;
      }
      if (targetType === 'mac_address') {
        targetValue = targetValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || targetValue;
      }
      
      // Invalidate cache for this relation type
      this._invalidateCache(sourceType);
      this._invalidateCache(targetType);
      
      const result = await db.query(`
        INSERT INTO relations (
          source_type, source_value, target_type, target_value,
          metadata, first_seen, last_seen, strength, connection_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1)
        ON CONFLICT (source_type, source_value, target_type, target_value)
        DO UPDATE SET
          last_seen = CASE 
            WHEN EXCLUDED.last_seen > relations.last_seen 
            THEN EXCLUDED.last_seen 
            ELSE relations.last_seen 
          END,
          metadata = EXCLUDED.metadata,
          strength = relations.strength + 1,
          connection_count = relations.connection_count + 1
        RETURNING *`,
        [
          sourceType,
          sourceValue,
          targetType,
          targetValue,
          metadata,
          metadata.firstSeen || new Date(),
          metadata.timestamp || new Date()
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error upserting relation:', error);
      throw error;
    }
  }

  /**
   * Get MAC address relations with optimized query
   * @param {Number} limit - Maximum number of relations to return
   * @returns {Promise<Array>} Formatted MAC address relations
   */
  static async getMacAddressRelations(limit = 100) {
    try {
      // Check cache first
      const cacheKey = `mac_address_${limit}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      
      console.log('Fetching MAC address relations...');
      
      // Not in cache, fetch from database with optimized query
      const result = await db.query(`
        WITH mac_relations AS (
          SELECT 
            source_value as mac_address,
            target_value as ip_address,
            first_seen,
            last_seen,
            strength,
            connection_count,
            metadata
          FROM relations
          WHERE source_type = 'mac_address' AND target_type = 'ip'
          ORDER BY last_seen DESC
          LIMIT $1
        )
        SELECT * FROM mac_relations
      `, [limit]);

      console.log('Raw query results:', result.rows.slice(0, 3));

      // Group by MAC address
      const macAddressMap = new Map();
      
      result.rows.forEach(row => {
        console.log('Processing MAC:', row.mac_address);
        
        // Use the MAC address as-is since we're standardizing on dashes in input
        const macAddress = row.mac_address;
        
        if (!macAddressMap.has(macAddress)) {
          macAddressMap.set(macAddress, {
            source: macAddress,
            type: 'mac_address',
            related: []
          });
        }
        
        const relation = macAddressMap.get(macAddress);
        
        // Add this IP to the related items
        relation.related.push({
          target: row.ip_address,
          type: 'ip',
          strength: row.strength,
          connectionCount: row.connection_count,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          metadata: row.metadata || {}
        });
      });
      
      // Convert map to array of relations
      const formattedRelations = Array.from(macAddressMap.values());
      
      // Store in cache
      this._cacheData(cacheKey, formattedRelations);
      
      return formattedRelations;
    } catch (error) {
      console.error('Error getting MAC address relations:', error);
      throw error;
    }
  }

  /**
   * Batch upsert multiple relations for improved performance
   * @param {Array} relations - Array of relation objects
   */
  static async batchUpsertRelations(relations) {
    if (!relations || relations.length === 0) {
      return [];
    }
    
    // Track cache invalidation needs
    const typesToInvalidate = new Set();
    
    try {
      // Start a transaction for consistency
      const client = await db.pool.connect();
      const results = [];
      
      try {
        await client.query('BEGIN');
        
        for (const relation of relations) {
          const { sourceType, sourceValue, targetType, targetValue, metadata = {} } = relation;
          
          // Skip invalid relations
          if (!sourceType || sourceValue === null || sourceValue === undefined || 
              !targetType || targetValue === null || targetValue === undefined) {
            console.log('Skipping invalid relation in batch:', relation);
            continue;
          }
          
          // Normalize MAC addresses if present
          let normSourceValue = sourceValue;
          let normTargetValue = targetValue;
          
          if (sourceType === 'mac_address') {
            normSourceValue = sourceValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || sourceValue;
          }
          if (targetType === 'mac_address') {
            normTargetValue = targetValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || targetValue;
          }
          
          // Track types for cache invalidation
          typesToInvalidate.add(sourceType);
          typesToInvalidate.add(targetType);
          
          // Execute upsert
          const result = await client.query(`
            INSERT INTO relations (
              source_type, source_value, target_type, target_value,
              metadata, first_seen, last_seen, strength, connection_count
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1)
            ON CONFLICT (source_type, source_value, target_type, target_value)
            DO UPDATE SET
              last_seen = CASE 
                WHEN EXCLUDED.last_seen > relations.last_seen 
                THEN EXCLUDED.last_seen 
                ELSE relations.last_seen 
              END,
              metadata = EXCLUDED.metadata,
              strength = relations.strength + 1,
              connection_count = relations.connection_count + 1
            RETURNING *`,
            [
              sourceType,
              normSourceValue,
              targetType,
              normTargetValue,
              metadata,
              metadata.firstSeen || new Date(),
              metadata.timestamp || new Date()
            ]
          );
          
          if (result.rows.length > 0) {
            results.push(result.rows[0]);
          }
        }
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
      // Invalidate caches
      typesToInvalidate.forEach(type => this._invalidateCache(type));
      
      return results;
    } catch (error) {
      console.error('Error in batch upsert relations:', error);
      throw error;
    }
  }

  /**
   * Get relations by type with caching optimization
   */
  static async getRelations(type, limit = 100) {
    try {
      // Check cache first
      const cacheKey = `${type}_${limit}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      
      // Not in cache, fetch from database with optimized query
      const result = await db.query(`
        WITH ranked_relations AS (
          SELECT 
            source_type,
            source_value,
            target_type,
            target_value,
            strength,
            connection_count,
            first_seen,
            last_seen,
            metadata,
            ROW_NUMBER() OVER(PARTITION BY 
              CASE WHEN source_type = $1 THEN source_value ELSE target_value END 
              ORDER BY last_seen DESC) as row_num
          FROM relations
          WHERE source_type = $1 OR target_type = $1
        )
        SELECT * FROM ranked_relations
        WHERE row_num <= $2
        ORDER BY last_seen DESC`,
        [type, limit]
      );

      const formattedRelations = this.formatRelations(result.rows);
      
      // Store in cache
      this._cacheData(cacheKey, formattedRelations);
      
      return formattedRelations;
    } catch (error) {
      console.error('Error getting relations:', error);
      throw error;
    }
  }

  /**
   * Get user commands with optimization
   */
  static async getUserCommands() {
    try {
      // Check cache first
      const cacheKey = 'user_commands';
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      
      // Not in cache, fetch from database with optimized query
      // Add some debugging to see if we have backslash issues
      console.log('Fetching user commands from database');
      
      const result = await db.query(`
        SELECT 
          source_value as username,
          target_value as command,
          first_seen,
          last_seen,
          metadata
        FROM relations
        WHERE source_type = 'username'
          AND target_type = 'command'
        ORDER BY last_seen DESC
      `);
  
      // Log the first few commands to check for backslash issues
      if (result.rows.length > 0) {
        console.log('Sample commands from database:');
        result.rows.slice(0, 3).forEach((row, i) => {
          console.log(`Command ${i+1}: ${row.username} - ${
            row.command ? 
              (row.command.length > 50 ? 
                row.command.substring(0, 50) + '...' : 
                row.command) : 
              'null'
          }`);
        });
      }
  
      // Make sure commands with backslashes are properly escaped in JSON
      const processedRows = result.rows.map(row => ({
        ...row,
        // Ensure command is passed as-is without manipulation
        command: row.command
      }));
  
      // Cache the result
      this._cacheData(cacheKey, processedRows);
      
      return processedRows;
    } catch (error) {
      console.error('Error getting user commands:', error);
      throw error;
    }
  }

  /**
   * Get relations by specific value with optimization
   */
  static async getRelationsByValue(type, value) {
    try {
      // Use a more efficient query with proper indexing
      const result = await db.query(`
        SELECT 
          source_type,
          source_value,
          target_type,
          target_value,
          strength,
          connection_count,
          first_seen,
          last_seen,
          metadata
        FROM relations
        WHERE (source_type = $1 AND source_value = $2)
           OR (target_type = $1 AND target_value = $2)
        ORDER BY last_seen DESC`,
        [type, value]
      );

      return this.formatRelations(result.rows);
    } catch (error) {
      console.error('Error getting relations by value:', error);
      throw error;
    }
  }

  /**
   * Update field values with improved transaction handling
   */
  static async updateFieldValue(fieldType, oldValue, newValue) {
    try {
      if (!oldValue || !newValue || oldValue === newValue) {
        return 0;
      }
      
      console.log(`Updating relations: ${fieldType} from "${oldValue}" to "${newValue}"`);
      
      // Normalize MAC addresses if needed
      if (fieldType === 'mac_address') {
        oldValue = oldValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || oldValue;
        newValue = newValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || newValue;
      }
      
      // Invalidate related caches
      this._invalidateCache(fieldType);
      
      // Use a transaction for data consistency
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        // First, identify all relations that use the old value
        const sourceResult = await client.query(`
          SELECT source_type, source_value, target_type, target_value, metadata,
                 strength, connection_count, first_seen, last_seen
          FROM relations
          WHERE source_type = $1 AND source_value = $2
        `, [fieldType, oldValue]);
        
        const targetResult = await client.query(`
          SELECT source_type, source_value, target_type, target_value, metadata,
                 strength, connection_count, first_seen, last_seen
          FROM relations
          WHERE target_type = $1 AND target_value = $2
        `, [fieldType, oldValue]);
        
        // Delete old relations
        await client.query(`
          DELETE FROM relations
          WHERE source_type = $1 AND source_value = $2
        `, [fieldType, oldValue]);
        
        await client.query(`
          DELETE FROM relations
          WHERE target_type = $1 AND target_value = $2
        `, [fieldType, oldValue]);
        
        // Insert new relations that had the old value as source
        for (const relation of sourceResult.rows) {
          await client.query(`
            INSERT INTO relations (
              source_type, source_value, target_type, target_value, 
              strength, connection_count, first_seen, last_seen, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (source_type, source_value, target_type, target_value)
            DO UPDATE SET
              last_seen = EXCLUDED.last_seen,
              strength = GREATEST(relations.strength, EXCLUDED.strength),
              connection_count = relations.connection_count + 1,
              metadata = EXCLUDED.metadata
          `, [
            relation.source_type,
            newValue, // Use new value
            relation.target_type,
            relation.target_value,
            relation.strength, 
            relation.connection_count,
            relation.first_seen,
            new Date(), // Update last_seen
            relation.metadata
          ]);
        }
        
        // Insert new relations for those that had the old value as target
        for (const relation of targetResult.rows) {
          await client.query(`
            INSERT INTO relations (
              source_type, source_value, target_type, target_value, 
              strength, connection_count, first_seen, last_seen, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (source_type, source_value, target_type, target_value)
            DO UPDATE SET
              last_seen = EXCLUDED.last_seen,
              strength = GREATEST(relations.strength, EXCLUDED.strength),
              connection_count = relations.connection_count + 1,
              metadata = EXCLUDED.metadata
          `, [
            relation.source_type,
            relation.source_value,
            relation.target_type,
            newValue, // Use new value
            relation.strength,
            relation.connection_count,
            relation.first_seen,
            new Date(), // Update last_seen
            relation.metadata
          ]);
        }
        
        await client.query('COMMIT');
        
        const totalUpdated = sourceResult.rowCount + targetResult.rowCount;
        console.log(`Updated ${totalUpdated} relation records with ${fieldType} from "${oldValue}" to "${newValue}"`);
        
        return totalUpdated;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Error updating ${fieldType} relations:`, error);
      throw error;
    }
  }
  
  /**
   * Update user commands with batch optimization
   */
  static async updateUserCommands(oldUsername, newUsername) {
    try {
      // Invalidate related caches
      this._invalidateCache('username');
      this._invalidateCache('user_commands');
      
      const result = await db.query(`
        UPDATE relations
        SET source_value = $1
        WHERE source_type = 'username' AND source_value = $2
        RETURNING id
      `, [newUsername, oldUsername]);
      
      return result.rowCount;
    } catch (error) {
      console.error('Error updating user commands:', error);
      throw error;
    }
  }
  
  /**
   * Efficiently delete old relations with batching
   */
  static async deleteOldRelations(days = 30) {
    try {
      // Use a more efficient query with proper indexing
      const result = await db.query(`
        DELETE FROM relations
        WHERE last_seen < NOW() - INTERVAL '1 day' * $1
        RETURNING *`,
        [days]
      );
      
      // Clear all caches after bulk delete
      this._clearAllCaches();
      
      return result.rowCount;
    } catch (error) {
      console.error('Error deleting old relations:', error);
      throw error;
    }
  }

  /**
   * Improved formatter that handles data grouping more efficiently
   */
  static formatRelations(rows) {
    const relationMap = new Map();

    rows.forEach(row => {
      const source = row.source_value;
      if (!relationMap.has(source)) {
        relationMap.set(source, {
          source,
          type: row.source_type,
          related: []
        });
      }

      relationMap.get(source).related.push({
        target: row.target_value,
        type: row.target_type,
        strength: row.strength,
        connectionCount: row.connection_count,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        metadata: row.metadata
      });
    });

    return Array.from(relationMap.values());
  }
  
  /**
   * Cache management methods
   */
  static _getCachedData(key) {
    const cachedItem = relationsCache.get(key);
    if (cachedItem && (Date.now() - cachedItem.timestamp) < RELATIONS_CACHE_TTL) {
      return cachedItem.data;
    }
    return null;
  }
  
  static _cacheData(key, data) {
    relationsCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  static _invalidateCache(relationType) {
    // Clear any cache entries related to this type
    for (const key of relationsCache.keys()) {
      if (key.startsWith(relationType)) {
        relationsCache.delete(key);
      }
    }
  }
  
  static _clearAllCaches() {
    relationsCache.clear();
  }
}

module.exports = RelationsModel;