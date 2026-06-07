// backend/models/relations.js
const db = require('../db');

const RELATIONS_CACHE_TTL = 30000;
let relationsCache = new Map();

class RelationsModel {
  static async upsertRelation(sourceType, sourceValue, targetType, targetValue, metadata = {}, operationTags = [], logId = null) {
    try {
      if (!sourceType || sourceValue === null || sourceValue === undefined ||
          !targetType || targetValue === null || targetValue === undefined) {
        console.log('Skipping relation with null/undefined values:', { sourceType, sourceValue, targetType, targetValue });
        return null;
      }

      sourceValue = sourceValue || '[empty]';
      targetValue = targetValue || '[empty]';

      if (sourceType === 'mac_address') {
        sourceValue = sourceValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || sourceValue;
      }
      if (targetType === 'mac_address') {
        targetValue = targetValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || targetValue;
      }

      if (sourceType === 'username' && targetType === 'command') {
        const timestamp = metadata.timestamp || new Date();
        const uniqueId = `${timestamp.getTime()}_${Math.random().toString(36).substring(2, 12)}`;
        const originalCommand = targetValue;
        const uniqueCommand = `${targetValue}#${uniqueId}`;
        metadata.originalCommand = originalCommand;
        this._invalidateCache(sourceType);
        this._invalidateCache(targetType);

        const result = await db.query(`
          INSERT INTO relations (source_type, source_value, target_type, target_value,
            metadata, first_seen, last_seen, strength, connection_count, operation_tags, source_log_ids)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1, $8, $9)
          RETURNING *`,
          [sourceType, sourceValue, targetType, uniqueCommand, metadata,
           metadata.firstSeen || timestamp, timestamp, operationTags || [], logId ? [logId] : []]
        );
        return result.rows[0];
      }

      this._invalidateCache(sourceType);
      this._invalidateCache(targetType);

      const result = await db.query(`
        INSERT INTO relations (source_type, source_value, target_type, target_value,
          metadata, first_seen, last_seen, strength, connection_count, operation_tags, source_log_ids)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1, $8, $9)
        ON CONFLICT (source_type, source_value, target_type, target_value)
        DO UPDATE SET
          last_seen = CASE WHEN EXCLUDED.last_seen > relations.last_seen THEN EXCLUDED.last_seen ELSE relations.last_seen END,
          metadata = EXCLUDED.metadata,
          strength = relations.strength + 1,
          connection_count = relations.connection_count + 1,
          operation_tags = ARRAY(SELECT DISTINCT unnest(relations.operation_tags || EXCLUDED.operation_tags)),
          source_log_ids = ARRAY(SELECT DISTINCT unnest(relations.source_log_ids || EXCLUDED.source_log_ids))
        RETURNING *`,
        [sourceType, sourceValue, targetType, targetValue, metadata,
         metadata.firstSeen || new Date(), metadata.timestamp || new Date(), operationTags || [], logId ? [logId] : []]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error upserting relation:', error);
      throw error;
    }
  }

  static async getMacAddressRelations(limit = 100, operationTagId = null, isAdmin = false) {
    try {
      const cacheKey = `mac_address_${limit}_${operationTagId || 'all'}_${isAdmin}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;

      // Fetch both mac→ip and mac→hostname in one query.
      // Explicitly restrict to source_type='mac_address' so user→mac (user_mac)
      // rows never bleed into this view — those belong in the User↔MAC tab.
      const params = [limit];
      let query = `
        SELECT source_value as mac_address, target_value as related_value,
          target_type, first_seen, last_seen, strength, connection_count, metadata
        FROM relations
        WHERE source_type = 'mac_address'
          AND target_type IN ('ip', 'hostname')`;

      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$2]::INTEGER[]`;
        params.push(operationTagId);
      }

      query += ` ORDER BY last_seen DESC LIMIT $1`;

      const result = await db.query(query, params);

      const macAddressMap = new Map();
      result.rows.forEach(row => {
        const mac = row.mac_address;
        if (!macAddressMap.has(mac)) {
          macAddressMap.set(mac, { source: mac, type: 'mac_address', related: [], _seen: new Set() });
        }
        const relation = macAddressMap.get(mac);
        const dedupeKey = `${row.target_type}:${row.related_value}`;
        if (!relation._seen.has(dedupeKey)) {
          relation._seen.add(dedupeKey);
          relation.related.push({
            target: row.related_value,
            type: row.target_type,
            strength: row.strength,
            connectionCount: row.connection_count,
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            metadata: row.metadata || {}
          });
        }
      });

      macAddressMap.forEach(r => delete r._seen);
      const formattedRelations = Array.from(macAddressMap.values());
      this._cacheData(cacheKey, formattedRelations);
      return formattedRelations;
    } catch (error) {
      console.error('Error getting MAC address relations:', error);
      throw error;
    }
  }

  static async batchUpsertRelations(relations) {
    if (!relations || relations.length === 0) return [];
    const typesToInvalidate = new Set();
    try {
      const client = await db.pool.connect();
      const results = [];
      try {
        await client.query('BEGIN');
        for (const relation of relations) {
          const { sourceType, sourceValue, targetType, targetValue, metadata = {} } = relation;
          if (!sourceType || sourceValue === null || sourceValue === undefined || !targetType || targetValue === null || targetValue === undefined) continue;

          let normSourceValue = sourceType === 'mac_address' ? sourceValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || sourceValue : sourceValue;
          let normTargetValue = targetType === 'mac_address' ? targetValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || targetValue : targetValue;

          typesToInvalidate.add(sourceType);
          typesToInvalidate.add(targetType);

          const result = await client.query(`
            INSERT INTO relations (source_type, source_value, target_type, target_value, metadata, first_seen, last_seen, strength, connection_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1)
            ON CONFLICT (source_type, source_value, target_type, target_value)
            DO UPDATE SET last_seen = CASE WHEN EXCLUDED.last_seen > relations.last_seen THEN EXCLUDED.last_seen ELSE relations.last_seen END, metadata = EXCLUDED.metadata, strength = relations.strength + 1, connection_count = relations.connection_count + 1
            RETURNING *`,
            [sourceType, normSourceValue, targetType, normTargetValue, metadata, metadata.firstSeen || new Date(), metadata.timestamp || new Date()]
          );
          if (result.rows.length > 0) results.push(result.rows[0]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      typesToInvalidate.forEach(type => this._invalidateCache(type));
      return results;
    } catch (error) {
      console.error('Error in batch upsert relations:', error);
      throw error;
    }
  }

  static async getRelations(type, limit = 100, operationTagId = null, isAdmin = false) {
    try {
      const cacheKey = `${type}_${limit}_${operationTagId || 'all'}_${isAdmin}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;

      let query = `
        WITH ranked_relations AS (
          SELECT source_type, source_value, target_type, target_value,
            strength, connection_count, first_seen, last_seen, metadata,
            ROW_NUMBER() OVER(PARTITION BY CASE WHEN source_type = $1 THEN source_value ELSE target_value END ORDER BY last_seen DESC) as row_num
          FROM relations
          WHERE (source_type = $1 OR target_type = $1)`;
      const params = [type, limit];

      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$3]::INTEGER[]`;
        params.push(operationTagId);
      }

      query += `) SELECT * FROM ranked_relations WHERE row_num <= $2 ORDER BY last_seen DESC`;

      const result = await db.query(query, params);
      const formattedRelations = this.formatRelations(result.rows);
      this._cacheData(cacheKey, formattedRelations);
      return formattedRelations;
    } catch (error) {
      console.error('Error getting relations:', error);
      throw error;
    }
  }

  static async getRelationsByMetadataType(metaType, limit = 100, operationTagId = null, isAdmin = false) {
    try {
      const cacheKey = `meta_${metaType}_${limit}_${operationTagId || 'all'}_${isAdmin}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;

      let query = `
        WITH ranked_relations AS (
          SELECT source_type, source_value, target_type, target_value,
            strength, connection_count, first_seen, last_seen, metadata,
            ROW_NUMBER() OVER(PARTITION BY source_value ORDER BY last_seen DESC) as row_num
          FROM relations
          WHERE metadata->>'type' = $1`;
      const params = [metaType, limit];

      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$3]::INTEGER[]`;
        params.push(operationTagId);
      }

      query += `) SELECT * FROM ranked_relations WHERE row_num <= $2 ORDER BY last_seen DESC`;

      const result = await db.query(query, params);
      const formattedRelations = this.formatRelations(result.rows);
      this._cacheData(cacheKey, formattedRelations);
      return formattedRelations;
    } catch (error) {
      console.error('Error getting relations by metadata type:', error);
      throw error;
    }
  }

  static async getUserCommands(operationTagId = null, isAdmin = false) {
    try {
      const cacheKey = `user_commands_${operationTagId || 'all'}_${isAdmin}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;

      let query = `
        SELECT source_value as username, target_value as command, first_seen, last_seen, metadata
        FROM relations
        WHERE source_type = 'username' AND target_type = 'command'`;
      const params = [];

      if (operationTagId) {
        query += ` AND operation_tags @> ARRAY[$1]::INTEGER[]`;
        params.push(operationTagId);
      }
      query += ` ORDER BY last_seen DESC`;

      const result = await db.query(query, params);
      const commandsByUser = {};

      result.rows.forEach(row => {
        let cleanCommand;
        if (row.metadata && row.metadata.originalCommand) cleanCommand = row.metadata.originalCommand;
        else if (row.command.includes('#')) cleanCommand = row.command.split('#')[0];
        else cleanCommand = row.command;

        const username = row.username;
        const timestamp = new Date(row.last_seen).getTime();
        const key = `${username}_${cleanCommand}_${timestamp}`;

        if (!commandsByUser[key]) {
          commandsByUser[key] = { username, command: cleanCommand, first_seen: row.first_seen, last_seen: row.last_seen, metadata: row.metadata };
        }
      });

      const processedRows = Object.values(commandsByUser).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
      this._cacheData(cacheKey, processedRows);
      return processedRows;
    } catch (error) {
      console.error('Error getting user commands:', error);
      throw error;
    }
  }

  static async getRelationsByValue(type, value, operationTagId = null, isAdmin = false) {
    try {
      let query = `
        SELECT source_type, source_value, target_type, target_value,
          strength, connection_count, first_seen, last_seen, metadata
        FROM relations
        WHERE ((source_type = $1 AND source_value = $2) OR (target_type = $1 AND target_value = $2))`;
      const params = [type, value];
      if (operationTagId) { query += ` AND operation_tags @> ARRAY[$3]::INTEGER[]`; params.push(operationTagId); }
      query += ` ORDER BY last_seen DESC`;
      const result = await db.query(query, params);
      return this.formatRelations(result.rows);
    } catch (error) {
      console.error('Error getting relations by value:', error);
      throw error;
    }
  }

  static async updateFieldValue(fieldType, oldValue, newValue) {
    try {
      if (!oldValue || !newValue || oldValue === newValue) return 0;
      if (fieldType === 'mac_address') {
        oldValue = oldValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || oldValue;
        newValue = newValue.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || newValue;
      }
      this._invalidateCache(fieldType);
      if (['ip', 'internal_ip', 'external_ip', 'hostname'].includes(fieldType)) this._invalidateCache('mac_address');

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const sourceResult = await client.query(`SELECT source_type, source_value, target_type, target_value, metadata, strength, connection_count, first_seen, last_seen, operation_tags, source_log_ids FROM relations WHERE source_type = $1 AND source_value = $2`, [fieldType, oldValue]);
        const targetResult = await client.query(`SELECT source_type, source_value, target_type, target_value, metadata, strength, connection_count, first_seen, last_seen, operation_tags, source_log_ids FROM relations WHERE target_type = $1 AND target_value = $2`, [fieldType, oldValue]);
        await client.query(`DELETE FROM relations WHERE source_type = $1 AND source_value = $2`, [fieldType, oldValue]);
        await client.query(`DELETE FROM relations WHERE target_type = $1 AND target_value = $2`, [fieldType, oldValue]);

        const upsertSql = `INSERT INTO relations (source_type, source_value, target_type, target_value, strength, connection_count, first_seen, last_seen, metadata, operation_tags, source_log_ids)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (source_type, source_value, target_type, target_value)
          DO UPDATE SET last_seen = EXCLUDED.last_seen, strength = GREATEST(relations.strength, EXCLUDED.strength), connection_count = relations.connection_count + 1, metadata = EXCLUDED.metadata,
            operation_tags = ARRAY(SELECT DISTINCT unnest(relations.operation_tags || EXCLUDED.operation_tags)),
            source_log_ids = ARRAY(SELECT DISTINCT unnest(relations.source_log_ids || EXCLUDED.source_log_ids))`;

        for (const r of sourceResult.rows) {
          await client.query(upsertSql, [r.source_type, newValue, r.target_type, r.target_value, r.strength, r.connection_count, r.first_seen, new Date(), r.metadata, r.operation_tags || [], r.source_log_ids || []]);
        }
        for (const r of targetResult.rows) {
          await client.query(upsertSql, [r.source_type, r.source_value, r.target_type, newValue, r.strength, r.connection_count, r.first_seen, new Date(), r.metadata, r.operation_tags || [], r.source_log_ids || []]);
        }
        await client.query('COMMIT');
        return sourceResult.rowCount + targetResult.rowCount;
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

  static async updateUserCommands(oldUsername, newUsername) {
    try {
      this._invalidateCache('username');
      this._invalidateCache('user_commands');
      const result = await db.query(`UPDATE relations SET source_value = $1 WHERE source_type = 'username' AND source_value = $2 RETURNING id`, [newUsername, oldUsername]);
      return result.rowCount;
    } catch (error) {
      console.error('Error updating user commands:', error);
      throw error;
    }
  }

  static async getCommandSequences(limit = 100) {
    try {
      const cacheKey = 'command_sequences';
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;

      const result = await db.query(`
        SELECT r.source_value as command1, r.target_value as command2,
          r.first_seen, r.last_seen, r.metadata, r.strength, r.connection_count
        FROM relations r
        WHERE r.source_type = 'command' AND r.target_type = 'command'
          AND (r.metadata->>'type' = 'command_sequence' OR r.metadata->>'type' = 'multi_command_sequence')
        ORDER BY (r.metadata->>'confidence')::float DESC, r.last_seen DESC
        LIMIT $1
      `, [limit]);

      const sequences = result.rows.map(row => ({
        command1: row.command1, command2: row.command2,
        fullSequence: row.metadata.type === 'multi_command_sequence' ? row.metadata.fullSequence : null,
        length: row.metadata.type === 'multi_command_sequence' ? row.metadata.length : 2,
        firstSeen: row.first_seen, lastSeen: row.last_seen, strength: row.strength,
        occurrences: row.metadata.occurrences || row.connection_count,
        confidence: parseFloat(row.metadata.confidence || 0.5),
        avgTimeDiff: row.metadata.avgTimeDiff || 0,
        username: row.metadata.username || null, hostname: row.metadata.hostname || null,
        internal_ip: row.metadata.internal_ip || null
      }));

      this._cacheData(cacheKey, sequences);
      return sequences;
    } catch (error) {
      console.error('Error getting command sequences:', error);
      throw error;
    }
  }

  static async deleteOldRelations(days = 30) {
    try {
      const result = await db.query(`DELETE FROM relations WHERE last_seen < NOW() - INTERVAL '1 day' * $1 RETURNING *`, [days]);
      this._clearAllCaches();
      return result.rowCount;
    } catch (error) {
      console.error('Error deleting old relations:', error);
      throw error;
    }
  }

  static formatRelations(rows) {
    const relationMap = new Map();
    rows.forEach(row => {
      let targetValue = row.target_value;
      if (row.target_type === 'command' && targetValue.includes('#')) {
        targetValue = (row.metadata && row.metadata.originalCommand) ? row.metadata.originalCommand : targetValue.split('#')[0];
      }
      const source = row.source_value;
      const mapKey = source;
      if (!relationMap.has(mapKey)) {
        relationMap.set(mapKey, { source, type: row.source_type, related: [] });
      }
      const existingRelated = relationMap.get(mapKey).related.find(item => item.type === row.target_type && item.target === targetValue);
      if (!existingRelated) {
        relationMap.get(mapKey).related.push({ target: targetValue, type: row.target_type, strength: row.strength, connectionCount: row.connection_count, firstSeen: row.first_seen, lastSeen: row.last_seen, metadata: row.metadata });
      } else {
        if (new Date(row.last_seen) > new Date(existingRelated.lastSeen)) existingRelated.lastSeen = row.last_seen;
        if (new Date(row.first_seen) < new Date(existingRelated.firstSeen)) existingRelated.firstSeen = row.first_seen;
        existingRelated.strength += row.strength;
        existingRelated.connectionCount += row.connection_count;
      }
    });
    return Array.from(relationMap.values());
  }

  static _getCachedData(key) {
    const cachedItem = relationsCache.get(key);
    if (cachedItem && (Date.now() - cachedItem.timestamp) < RELATIONS_CACHE_TTL) return cachedItem.data;
    return null;
  }

  static _cacheData(key, data) {
    relationsCache.set(key, { data, timestamp: Date.now() });
  }

  static _invalidateCache(relationType) {
    for (const key of relationsCache.keys()) {
      if (key.startsWith(relationType)) relationsCache.delete(key);
    }
  }

  static _clearAllCaches() {
    relationsCache.clear();
  }
}

module.exports = RelationsModel;
