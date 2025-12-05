// relation-service/src/services/analyzers/domainAnalyzer.js
const _ = require('lodash');
const db = require('../../db');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for domain relations
 * Identifies and stores relationships between domains and IP addresses
 */
class DomainAnalyzer extends BaseAnalyzer {
  constructor() {
    super('domainRelations');
  }

  /**
   * Analyze logs for domain-IP relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing domain relations with parallel batch processing...');

    // Fetch operation tags for all logs upfront
    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    // Extract domain relations from logs
    const domainRelations = this._extractDomainRelations(logs);

    if (domainRelations.length === 0) {
      console.log('No domain relations found to analyze');
      return true;
    }

    // Process the domain relations in batches
    await this._processBatch(domainRelations, async (domainBatch) => {
      // Process domain relations in parallel within each batch
      await Promise.all(
        domainBatch.map(data => {
          // Get operation tags for this log
          const operationTags = operationTagsMap.get(data.logId) || [];

          return RelationsModel.upsertRelation(
            'domain',
            data.domain,
            'ip',
            data.ip,
            {
              type: 'domain_ip',
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            },
            operationTags,
            data.logId
          );
        })
      );
    });

    return true;
  }

  /**
   * Extract domain relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted domain relations
   * @private
   */
  _extractDomainRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both domain and internal_ip
      filter: log => log.domain && log.internal_ip,

      // Group by domain and IP
      groupBy: log => `${log.domain}:${log.internal_ip}`,

      // Map each group to a domain relation object
      mapFn: (entries, key) => {
        const [domain, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          domain,
          ip,
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

module.exports = { DomainAnalyzer };
