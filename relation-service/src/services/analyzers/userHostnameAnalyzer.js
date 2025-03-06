// relation-service/src/services/analyzers/userHostnameAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for user-hostname relations
 * Identifies and stores relationships between users and the hosts they access
 */
class UserHostnameAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userHostnameRelations');
  }

  /**
   * Analyze logs for user-hostname relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing user-hostname relations with parallel batch processing...');
    
    // Extract user-hostname relations from logs
    const userHostnames = this._extractUserHostnameRelations(logs);
    
    // Early exit if no user-hostname pairs to process
    if (userHostnames.length === 0) {
      console.log('No user-hostname relations found to analyze');
      return true;
    }
    
    console.log(`Found ${userHostnames.length} user-hostname relations to process`);
    
    // Process the user-hostname relations in batches
    await this._processBatch(userHostnames, async (userHostnameBatch) => {
      // Process relations in parallel within each batch
      await Promise.all(
        userHostnameBatch.map(data => 
          RelationsModel.upsertRelation(
            'username',
            data.username,
            'hostname',
            data.hostname,
            {
              type: 'user_hostname',
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
   * Extract user-hostname relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted user-hostname relations
   * @private
   */
  _extractUserHostnameRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both username and hostname
      filter: log => log.username && log.hostname,
      
      // Group by username and hostname
      groupBy: log => `${log.username}:${log.hostname}`,
      
      // Map each group to a user-hostname relation object
      mapFn: (entries, key) => {
        const [username, hostname] = key.split(':');
        // Find min and max timestamps in one pass
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          username,
          hostname,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      }
    });
  }
}

module.exports = { UserHostnameAnalyzer };