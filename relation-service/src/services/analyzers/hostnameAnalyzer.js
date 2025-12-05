// relation-service/src/services/analyzers/hostnameAnalyzer.js
const _ = require('lodash');
const db = require('../../db');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for hostname relations
 * Identifies and stores relationships between hostnames and domains
 * Enhanced to also track commands executed on hostnames
 */
class HostnameAnalyzer extends BaseAnalyzer {
  constructor() {
    super('hostnameRelations');
  }

  /**
   * Analyze logs for hostname-domain relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing hostname relations with parallel batch processing...');

    // Fetch operation tags for all logs upfront
    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    // Extract hostname relations from logs
    const hostnameRelations = this._extractHostnameRelations(logs);

    // Extract hostname-command relations - new enhancement
    const hostnameCommandRelations = this._extractHostnameCommandRelations(logs);
    
    let processedCount = 0;
    
    if (hostnameRelations.length > 0) {
      // Process the hostname relations in batches
      await this._processBatch(hostnameRelations, async (hostnameBatch) => {
        // Process hostname relations in parallel within each batch
        await Promise.all(
          hostnameBatch.map(data => {
            // Get operation tags for this log
            const operationTags = operationTagsMap.get(data.logId) || [];

            return RelationsModel.upsertRelation(
              'hostname',
              data.hostname,
              'domain',
              data.domain,
              {
                type: 'hostname_domain',
                timestamp: data.lastSeen,
                firstSeen: data.firstSeen
              },
              operationTags,
              data.logId
            );
          })
        );
      });

      processedCount += hostnameRelations.length;
    }
    
    // Process the hostname command relations - new enhancement
    if (hostnameCommandRelations.length > 0) {
      console.log(`Processing ${hostnameCommandRelations.length} hostname command relations`);

      await this._processBatch(hostnameCommandRelations, async (batchItems) => {
        // Process hostname-command relations in parallel within each batch
        await Promise.all(
          batchItems.map(data => {
            // Get operation tags for this log
            const operationTags = operationTagsMap.get(data.logId) || [];

            return RelationsModel.upsertRelation(
              'hostname',
              data.hostname,
              'command',
              data.command,
              {
                type: 'hostname_command',
                username: data.username,
                internal_ip: data.internal_ip,
                timestamp: data.lastSeen,
                firstSeen: data.firstSeen
              },
              operationTags,
              data.logId
            );
          })
        );
      });

      processedCount += hostnameCommandRelations.length;
    }
    
    console.log(`Hostname analyzer processed ${processedCount} total relations`);
    return true;
  }

  /**
   * Extract hostname relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted hostname relations
   * @private
   */
  _extractHostnameRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both hostname and domain
      filter: log => log.hostname && log.domain,

      // Group by hostname and domain
      groupBy: log => `${log.hostname}:${log.domain}`,

      // Map each group to a hostname relation object
      mapFn: (entries, key) => {
        const [hostname, domain] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          hostname,
          domain,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }
  
  /**
   * Extract hostname-command relations from logs - new method
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted hostname-command relations
   * @private
   */
  _extractHostnameCommandRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both command and hostname
      filter: log => log.command && log.hostname && log.command.trim() !== '',

      // Group by hostname and command to avoid duplicates
      groupBy: log => `${log.hostname}:${log.command}`,

      // Map each group to a relation object
      mapFn: (entries, key) => {
        // Split by first colon only to preserve command content with colons
        const colonIndex = key.indexOf(':');
        if (colonIndex === -1) return null;

        const hostname = key.substring(0, colonIndex);
        const command = key.substring(colonIndex + 1);

        const timestamps = _.map(entries, 'timestamp');
        const usernames = _.uniq(entries.map(entry => entry.username).filter(Boolean));
        const internalIPs = _.uniq(entries.map(entry => entry.internal_ip).filter(Boolean));

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          hostname,
          command,
          username: usernames.length > 0 ? usernames[0] : null,
          internal_ip: internalIPs.length > 0 ? internalIPs[0] : null,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }

  /**
   * Fetch operation tags for a set of log IDs
   * @param {Array} logIds - Array of log IDs
   * @returns {Promise<Map>} Map of logId -> operation tag IDs
   */
  async _fetchOperationTags(logIds) {
    if (logIds.length === 0) {
      return new Map();
    }

    try {
      const result = await db.query(`
        SELECT
          lt.log_id,
          ARRAY_AGG(DISTINCT lt.tag_id) as tag_ids
        FROM log_tags lt
        WHERE lt.log_id = ANY($1)
        GROUP BY lt.log_id
      `, [logIds]);

      const tagMap = new Map();
      result.rows.forEach(row => {
        tagMap.set(row.log_id, row.tag_ids || []);
      });

      return tagMap;
    } catch (error) {
      console.error('Error fetching operation tags:', error);
      return new Map();
    }
  }
}

module.exports = { HostnameAnalyzer };