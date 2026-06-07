// backend/services/relations/analyzers/domainAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class DomainAnalyzer extends BaseAnalyzer {
  constructor() {
    super('domainRelations');
  }

  async analyze(logs) {
    console.log('Analyzing domain relations with parallel batch processing...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const internalRelations = this._extractDomainIPRelations(logs, 'internal');
    const externalRelations = this._extractDomainIPRelations(logs, 'external');
    const allRelations = [...internalRelations, ...externalRelations];

    if (allRelations.length === 0) {
      console.log('No domain relations found to analyze');
      return true;
    }

    console.log(`Processing ${internalRelations.length} domain→internal_ip and ${externalRelations.length} domain→external_ip relations`);

    await this._processBatch(allRelations, async (domainBatch) => {
      await Promise.all(
        domainBatch.map(async (data) => {
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
          return RelationsModel.upsertRelation(
            'domain', data.domain, 'ip', data.ip,
            { type: 'domain_ip', ipType: data.ipType, timestamp: data.lastSeen, firstSeen: data.firstSeen },
            operationTags, data.logId
          );
        })
      );
    });

    return true;
  }

  _extractDomainIPRelations(logs, ipType) {
    const ipField = ipType === 'internal' ? 'internal_ip' : 'external_ip';
    return this._extractFromLogs(logs, {
      filter: log => log.domain && log[ipField],
      // Use § as separator — safe against colons in domain names or IPv6 addresses
      groupBy: log => `${log.domain}§${log[ipField]}`,
      mapFn: (entries, key) => {
        const [domain, ip] = key.split('§');
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return {
          domain, ip, ipType,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }
}

module.exports = { DomainAnalyzer };
