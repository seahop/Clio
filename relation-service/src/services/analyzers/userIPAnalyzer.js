// relation-service/src/services/analyzers/userIPAnalyzer.js
const _ = require('lodash');
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
        userIPBatch.map(data => 
          RelationsModel.upsertRelation(
            'username',
            data.username,
            'ip',
            data.ip,
            {
              type: 'user_ip',
              ipType: data.ipType,
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            }
          )
        )
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
        
        return {
          username,
          ip,
          ipType: 'internal',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
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
        
        return {
          username,
          ip,
          ipType: 'external',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      }
    });
  }
}

module.exports = { UserIPAnalyzer };