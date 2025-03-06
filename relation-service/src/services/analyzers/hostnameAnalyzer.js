// relation-service/src/services/analyzers/hostnameAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for hostname relations
 * Identifies and stores relationships between hostnames and domains
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
    
    // Extract hostname relations from logs
    const hostnameRelations = this._extractHostnameRelations(logs);
    
    if (hostnameRelations.length === 0) {
      console.log('No hostname relations found to analyze');
      return true;
    }
    
    // Process the hostname relations in batches
    await this._processBatch(hostnameRelations, async (hostnameBatch) => {
      // Process hostname relations in parallel within each batch
      await Promise.all(
        hostnameBatch.map(data => 
          RelationsModel.upsertRelation(
            'hostname',
            data.hostname,
            'domain',
            data.domain,
            {
              type: 'hostname_domain',
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
        
        return {
          hostname,
          domain,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      }
    });
  }
}

module.exports = { HostnameAnalyzer };