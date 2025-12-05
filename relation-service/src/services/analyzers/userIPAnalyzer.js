// relation-service/src/services/analyzers/userIPAnalyzer.js
const _ = require('lodash');
const db = require('../../db');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for user-IP relations
 * Identifies and stores relationships between users and the IP addresses they use
 */
class UserIPAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userIPRelations');
  }

  /**
   * Analyze logs for user-IP relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing user-IP relations with parallel batch processing...');

    // Fetch operation tags for all logs upfront
    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    // Extract both internal and external IP relations
    const userInternalIPs = this._extractUserInternalIPRelations(logs);
    const userExternalIPs = this._extractUserExternalIPRelations(logs);

    // Combine both types of IP relations
    const userIPs = [...userInternalIPs, ...userExternalIPs];

    // Early exit if no user-IP pairs to process
    if (userIPs.length === 0) {
      console.log('No user-IP relations found to analyze');
      return true;
    }

    console.log(`Found ${userIPs.length} user-IP relations to process (${userInternalIPs.length} internal, ${userExternalIPs.length} external)`);

    // Process the user-IP relations in batches
    await this._processBatch(userIPs, async (userIPBatch) => {
      // Process relations in parallel within each batch
      await Promise.all(
        userIPBatch.map(async (data) => {
          // Get operation tags for this log with fallback
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);

          return RelationsModel.upsertRelation(
            'username',
            data.username,
            'ip',
            data.ip,
            {
              type: 'user_ip',
              ipType: data.ipType,
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
   * Extract user-internal IP relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted user-internal IP relations
   * @private
   */
  _extractUserInternalIPRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both username and internal_ip
      filter: log => log.username && log.internal_ip,

      // Group by username and internal IP
      groupBy: log => `${log.username}:${log.internal_ip}`,

      // Map each group to a user-IP relation object
      mapFn: (entries, key) => {
        const [username, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          username,
          ip,
          ipType: 'internal',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }

  /**
   * Extract user-external IP relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted user-external IP relations
   * @private
   */
  _extractUserExternalIPRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both username and external_ip
      filter: log => log.username && log.external_ip,

      // Group by username and external IP
      groupBy: log => `${log.username}:${log.external_ip}`,

      // Map each group to a user-IP relation object
      mapFn: (entries, key) => {
        const [username, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          username,
          ip,
          ipType: 'external',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }

  // _fetchOperationTags and _getOperationTagsWithFallback are now in BaseAnalyzer
}

module.exports = { UserIPAnalyzer };
