// relation-service/src/services/analyzers/domainAnalyzer.js
const _ = require('lodash');
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
        domainBatch.map(data => 
          RelationsModel.upsertRelation(
            'domain',
            data.domain,
            'ip',
            data.ip,
            {
              type: 'domain_ip',
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
        
        return {
          domain,
          ip,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      }
    });
  }
}

module.exports = { DomainAnalyzer };