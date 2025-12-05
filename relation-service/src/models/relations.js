// relation-service/src/models/relations.js
const db = require('../db');

// Cache for relations data
const RELATIONS_CACHE_TTL = 30000; // 30 seconds
let relationsCache = new Map();

class RelationsModel {
  /**
   * Upsert a relation with optimized query
   * @param {Array} operationTags - Array of operation tag IDs from source logs
   * @param {Number} logId - ID of the source log creating this relation
   */
  static async upsertRelation(sourceType, sourceValue, targetType, targetValue, metadata = {}, operationTags = [], logId = null) {
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
      
      // Special handling for user commands to allow duplicates
      if (sourceType === 'username' && targetType === 'command') {
        // Create a unique relation by using the timestamp plus random string
        const timestamp = metadata.timestamp || new Date();
        // Add randomness to guarantee uniqueness
        const uniqueId = `${timestamp.getTime()}_${Math.random().toString(36).substring(2, 12)}`;
        
        // Create a new unique command by appending a unique ID
        const originalCommand = targetValue;
        const uniqueCommand = `${targetValue}#${uniqueId}`;
        
        // Store the original command in metadata for retrieval
        metadata.originalCommand = originalCommand;
        
        // Invalidate cache for this relation type
        this._invalidateCache(sourceType);
        this._invalidateCache(targetType);
        
        // Insert this as a completely new relation rather than updating
        const result = await db.query(`
          INSERT INTO relations (
            source_type, source_value, target_type, target_value,
            metadata, first_seen, last_seen, strength, connection_count,
            operation_tags, source_log_ids
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1, $8, $9)
          RETURNING *`,
          [
            sourceType,
            sourceValue,
            targetType,
            uniqueCommand, // Store the unique command with timestamp
            metadata,
            metadata.firstSeen || timestamp,
            timestamp,
            operationTags || [],
            logId ? [logId] : []
          ]
        );

        return result.rows[0];
      }

      // For non-command relations, use the standard behavior with ON CONFLICT
      // Invalidate cache for this relation type
      this._invalidateCache(sourceType);
      this._invalidateCache(targetType);

      const result = await db.query(`
        INSERT INTO relations (
          source_type, source_value, target_type, target_value,
          metadata, first_seen, last_seen, strength, connection_count,
          operation_tags, source_log_ids
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1, $8, $9)
        ON CONFLICT (source_type, source_value, target_type, target_value)
        DO UPDATE SET
          last_seen = CASE
            WHEN EXCLUDED.last_seen > relations.last_seen
            THEN EXCLUDED.last_seen
            ELSE relations.last_seen
          END,
          metadata = EXCLUDED.metadata,
          strength = relations.strength + 1,
          connection_count = relations.connection_count + 1,
          operation_tags = ARRAY(
            SELECT DISTINCT unnest(relations.operation_tags || EXCLUDED.operation_tags)
          ),
          source_log_ids = ARRAY(
            SELECT DISTINCT unnest(relations.source_log_ids || EXCLUDED.source_log_ids)
          )
        RETURNING *`,
        [
          sourceType,
          sourceValue,
          targetType,
          targetValue,
          metadata,
          metadata.firstSeen || new Date(),
          metadata.timestamp || new Date(),
          operationTags || [],
          logId ? [logId] : []
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
   * @param {Number} operationTagId - Optional operation tag ID for filtering
   * @param {Boolean} isAdmin - Whether the user is an admin
   * @returns {Promise<Array>} Formatted MAC address relations
   */
  static async getMacAddressRelations(limit = 100, operationTagId = null, isAdmin = false) {
    try {
      // Check cache first (include operation context in cache key)
      const cacheKey = `mac_address_${limit}_${operationTagId || 'all'}_${isAdmin}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      console.log(`[DEBUG] getMacAddressRelations - limit: ${limit}, operationTagId: ${operationTagId}, isAdmin: ${isAdmin}`);

      // Build query with operation filtering
      let query = `
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
          WHERE source_type = 'mac_address' AND target_type = 'ip'`;

      const params = [limit];

      // Add operation filtering for non-admins or admins with active operation
      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$2]::INTEGER[]`;
        params.push(operationTagId);
        console.log(`[DEBUG] Filtering MAC relations by operationTagId: ${operationTagId}`);
      } else {
        console.log('[DEBUG] No operation filter applied for MAC relations');
      }

      query += `
          ORDER BY last_seen DESC
          LIMIT $1
        )
        SELECT * FROM mac_relations`;

      const result = await db.query(query, params);

      console.log(`[DEBUG] MAC address query returned ${result.rows.length} rows`);
      if (result.rows.length > 0) {
        console.log('[DEBUG] First 5 MAC results:');
        result.rows.slice(0, 5).forEach(row => {
          console.log(`  ${row.mac_address} → ${row.ip_address} (strength: ${row.strength}, seen: ${row.last_seen})`);
        });
      }

      // Check for duplicates
      const macIpPairs = result.rows.map(r => `${r.mac_address}→${r.ip_address}`);
      const uniquePairs = new Set(macIpPairs);
      if (macIpPairs.length !== uniquePairs.size) {
        console.log('[WARNING] Found duplicate MAC→IP pairs in database!');
        const duplicates = macIpPairs.filter((item, index) => macIpPairs.indexOf(item) !== index);
        console.log('[WARNING] Duplicate pairs:', [...new Set(duplicates)]);
      }

      // Group by MAC address and deduplicate IP addresses
      const macAddressMap = new Map();

      result.rows.forEach(row => {
        // Use the MAC address as-is since we're standardizing on dashes in input
        const macAddress = row.mac_address;

        if (!macAddressMap.has(macAddress)) {
          macAddressMap.set(macAddress, {
            source: macAddress,
            type: 'mac_address',
            related: [],
            ipSet: new Set() // Track unique IPs to prevent duplicates
          });
        }

        const relation = macAddressMap.get(macAddress);

        // Only add this IP if we haven't seen it before for this MAC
        if (!relation.ipSet.has(row.ip_address)) {
          relation.ipSet.add(row.ip_address);

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
        } else {
          console.log(`[DEBUG] Skipping duplicate IP ${row.ip_address} for MAC ${macAddress}`);
        }
      });

      // Remove the temporary ipSet before returning
      macAddressMap.forEach(relation => {
        delete relation.ipSet;
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
  static async getRelations(type, limit = 100, operationTagId = null, isAdmin = false) {
    try {
      console.log(`[DEBUG] getRelations - type: ${type}, limit: ${limit}, operationTagId: ${operationTagId}, isAdmin: ${isAdmin}`);

      // Check cache first (include operation context in cache key)
      const cacheKey = `${type}_${limit}_${operationTagId || 'all'}_${isAdmin}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        console.log(`[DEBUG] Returning cached data for ${type} (${cachedData.length} items)`);
        return cachedData;
      }

      // Build query with operation filtering
      let query = `
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
          WHERE (source_type = $1 OR target_type = $1)`;

      const params = [type, limit];

      // Add operation filtering for non-admins or admins with active operation
      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$3]::INTEGER[]`;
        params.push(operationTagId);
        console.log(`[DEBUG] Filtering ${type} relations by operationTagId: ${operationTagId}`);
      } else {
        console.log(`[DEBUG] No operation filter applied for ${type} relations`);
      }

      query += `
        )
        SELECT * FROM ranked_relations
        WHERE row_num <= $2
        ORDER BY last_seen DESC`;

      const result = await db.query(query, params);

      console.log(`[DEBUG] Query for ${type} returned ${result.rows.length} rows`);

      const formattedRelations = this.formatRelations(result.rows);

      console.log(`[DEBUG] Formatted to ${formattedRelations.length} relations`);

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
  static async getUserCommands(operationTagId = null, isAdmin = false) {
    try {
      // Check cache first (include operation context in cache key)
      const cacheKey = `user_commands_${operationTagId || 'all'}_${isAdmin}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      // Not in cache, fetch from database with optimized query
      console.log('Fetching user commands from database');

      // Build query with operation filtering
      let query = `
        SELECT
          source_value as username,
          target_value as command,
          first_seen,
          last_seen,
          metadata
        FROM relations
        WHERE source_type = 'username'
          AND target_type = 'command'`;

      const params = [];

      // Add operation filtering for non-admins or admins with active operation
      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$1]::INTEGER[]`;
        params.push(operationTagId);
      }

      query += ` ORDER BY last_seen DESC`;

      const result = await db.query(query, params);
      
      // Process commands to clean them up
      const commandsByUser = {};
      
      result.rows.forEach(row => {
        let cleanCommand;
        
        // Extract the original command from metadata or by splitting at #
        if (row.metadata && row.metadata.originalCommand) {
          cleanCommand = row.metadata.originalCommand;
        } else if (row.command.includes('#')) {
          cleanCommand = row.command.split('#')[0];
        } else {
          cleanCommand = row.command;
        }
        
        const username = row.username;
        
        // Create key to track actual duplicate commands (same user, same command, same time)
        const timestamp = new Date(row.last_seen).getTime();
        const key = `${username}_${cleanCommand}_${timestamp}`;
        
        // If we haven't processed this user/command/timestamp combination yet
        if (!commandsByUser[key]) {
          commandsByUser[key] = {
            username,
            command: cleanCommand,
            first_seen: row.first_seen,
            last_seen: row.last_seen,
            metadata: row.metadata
          };
        }
      });
      
      // Convert to array and sort by timestamp
      const processedRows = Object.values(commandsByUser)
        .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
      
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
  static async getRelationsByValue(type, value, operationTagId = null, isAdmin = false) {
    try {
      // Build query with operation filtering
      let query = `
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
        WHERE ((source_type = $1 AND source_value = $2)
           OR (target_type = $1 AND target_value = $2))`;

      const params = [type, value];

      // Add operation filtering for non-admins or admins with active operation
      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$3]::INTEGER[]`;
        params.push(operationTagId);
      }

      query += ` ORDER BY last_seen DESC`;

      const result = await db.query(query, params);

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

      // If updating IP addresses, also invalidate MAC cache since MACs are linked to IPs
      if (fieldType === 'ip' || fieldType === 'internal_ip' || fieldType === 'external_ip') {
        this._invalidateCache('mac_address');
        console.log('[DEBUG] Invalidated MAC address cache due to IP update');
      }

      // If updating hostname, invalidate MAC cache as well
      if (fieldType === 'hostname') {
        this._invalidateCache('mac_address');
        console.log('[DEBUG] Invalidated MAC address cache due to hostname update');
      }
      
      // Use a transaction for data consistency
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        // First, identify all relations that use the old value (include operation_tags and source_log_ids)
        const sourceResult = await client.query(`
          SELECT source_type, source_value, target_type, target_value, metadata,
                 strength, connection_count, first_seen, last_seen,
                 operation_tags, source_log_ids
          FROM relations
          WHERE source_type = $1 AND source_value = $2
        `, [fieldType, oldValue]);

        const targetResult = await client.query(`
          SELECT source_type, source_value, target_type, target_value, metadata,
                 strength, connection_count, first_seen, last_seen,
                 operation_tags, source_log_ids
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
              strength, connection_count, first_seen, last_seen, metadata,
              operation_tags, source_log_ids
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (source_type, source_value, target_type, target_value)
            DO UPDATE SET
              last_seen = EXCLUDED.last_seen,
              strength = GREATEST(relations.strength, EXCLUDED.strength),
              connection_count = relations.connection_count + 1,
              metadata = EXCLUDED.metadata,
              operation_tags = ARRAY(
                SELECT DISTINCT unnest(relations.operation_tags || EXCLUDED.operation_tags)
              ),
              source_log_ids = ARRAY(
                SELECT DISTINCT unnest(relations.source_log_ids || EXCLUDED.source_log_ids)
              )
          `, [
            relation.source_type,
            newValue, // Use new value
            relation.target_type,
            relation.target_value,
            relation.strength,
            relation.connection_count,
            relation.first_seen,
            new Date(), // Update last_seen
            relation.metadata,
            relation.operation_tags || [],
            relation.source_log_ids || []
          ]);
        }
        
        // Insert new relations for those that had the old value as target
        for (const relation of targetResult.rows) {
          await client.query(`
            INSERT INTO relations (
              source_type, source_value, target_type, target_value,
              strength, connection_count, first_seen, last_seen, metadata,
              operation_tags, source_log_ids
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (source_type, source_value, target_type, target_value)
            DO UPDATE SET
              last_seen = EXCLUDED.last_seen,
              strength = GREATEST(relations.strength, EXCLUDED.strength),
              connection_count = relations.connection_count + 1,
              metadata = EXCLUDED.metadata,
              operation_tags = ARRAY(
                SELECT DISTINCT unnest(relations.operation_tags || EXCLUDED.operation_tags)
              ),
              source_log_ids = ARRAY(
                SELECT DISTINCT unnest(relations.source_log_ids || EXCLUDED.source_log_ids)
              )
          `, [
            relation.source_type,
            relation.source_value,
            relation.target_type,
            newValue, // Use new value
            relation.strength,
            relation.connection_count,
            relation.first_seen,
            new Date(), // Update last_seen
            relation.metadata,
            relation.operation_tags || [],
            relation.source_log_ids || []
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
  * Get command sequences with optimization
  */
  static async getCommandSequences(limit = 100) {
    try {
      // Check cache first
      const cacheKey = 'command_sequences';
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }
        
      // Not in cache, fetch from database with optimized query
      console.log('Fetching command sequences from database');
      
      // Fetch both regular command sequences and multi-command sequences
      const result = await db.query(`
        SELECT 
          r.source_value as command1,
          r.target_value as command2,
          r.first_seen,
          r.last_seen,
          r.metadata,
          r.strength,
          r.connection_count
        FROM relations r
        WHERE r.source_type = 'command'
          AND r.target_type = 'command'
          AND (r.metadata->>'type' = 'command_sequence' OR r.metadata->>'type' = 'multi_command_sequence')
        ORDER BY 
          (r.metadata->>'confidence')::float DESC, 
          r.last_seen DESC
        LIMIT $1
      `, [limit]);
        
      // Process the results
      const sequences = result.rows.map(row => {
        const isMultiSequence = row.metadata.type === 'multi_command_sequence';
        
        return {
          command1: row.command1,
          command2: row.command2,
          // For multi-command sequences, include the full sequence
          fullSequence: isMultiSequence ? row.metadata.fullSequence : null,
          length: isMultiSequence ? row.metadata.length : 2,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          strength: row.strength,
          occurrences: row.metadata.occurrences || row.connection_count,
          confidence: parseFloat(row.metadata.confidence || 0.5),
          avgTimeDiff: row.metadata.avgTimeDiff || 0,
          username: row.metadata.username || null,
          hostname: row.metadata.hostname || null,
          internal_ip: row.metadata.internal_ip || null
        };
      });
        
      // Cache the result
      this._cacheData(cacheKey, sequences);
        
      return sequences;
    } catch (error) {
      console.error('Error getting command sequences:', error);
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
      // For commands, clean up the targetValue by removing the unique suffix
      let targetValue = row.target_value;
      let sourceValue = row.source_value;
      
      // If this is a command relationship, clean up the command
      if (row.target_type === 'command' && targetValue.includes('#')) {
        // Try to get original command from metadata first
        if (row.metadata && row.metadata.originalCommand) {
          targetValue = row.metadata.originalCommand;
        } else {
          // Otherwise extract command by removing suffix
          targetValue = targetValue.split('#')[0];
        }
      }
      
      // Create a key that doesn't include the unique suffix for commands
      const source = sourceValue;
      const mapKey = source;
      
      if (!relationMap.has(mapKey)) {
        relationMap.set(mapKey, {
          source,
          type: row.source_type,
          related: []
        });
      }
  
      // Check if this exact target already exists in the related items
      // This prevents showing duplicate commands in the relations view
      const existingRelated = relationMap.get(mapKey).related.find(item => 
        item.type === row.target_type && item.target === targetValue
      );
      
      if (!existingRelated) {
        // Only add if not already present
        relationMap.get(mapKey).related.push({
          target: targetValue,
          type: row.target_type,
          strength: row.strength,
          connectionCount: row.connection_count,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          metadata: row.metadata
        });
      } else {
        // Update the existing related item's timestamps if newer
        if (new Date(row.last_seen) > new Date(existingRelated.lastSeen)) {
          existingRelated.lastSeen = row.last_seen;
        }
        if (new Date(row.first_seen) < new Date(existingRelated.firstSeen)) {
          existingRelated.firstSeen = row.first_seen;
        }
        
        // Update strength and connection count (combine totals)
        existingRelated.strength += row.strength;
        existingRelated.connectionCount += row.connection_count;
      }
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