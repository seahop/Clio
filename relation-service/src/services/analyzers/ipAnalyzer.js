// relation-service/src/services/analyzers/ipAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for IP relations
 * Identifies and stores relationships between internal and external IP addresses
 */
class IPAnalyzer extends BaseAnalyzer {
  constructor() {
    super('ipRelations');
  }

  /**
   * Analyze logs for IP relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing IP relations with parallel batch processing...');
    
    // Extract IP relations from logs
    const ipRelations = this._extractIPRelations(logs);
    
    if (ipRelations.length === 0) {
      console.log('No IP relations found to analyze');
      return true;
    }
    
    // Process the IP relations in batches
    await this._processBatch(ipRelations, async (ipBatch) => {
      // Process IP relations in parallel within each batch
      await Promise.all(
        ipBatch.map(data => 
          RelationsModel.upsertRelation(
            'ip',
            data.internal,
            'ip',
            data.external,
            {
              type: 'ip_connection',
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
   * Extract IP relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted IP relations
   * @private
   */
  _extractIPRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both internal and external IPs
      filter: log => log.internal_ip && log.external_ip,
      
      // Group by internal and external IPs
      groupBy: log => `${log.internal_ip}:${log.external_ip}`,
      
      // Map each group to an IP relation object
      mapFn: (entries, key) => {
        const [internal, external] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          internal,
          external,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      }
    });
  }
}

module.exports = { IPAnalyzer };