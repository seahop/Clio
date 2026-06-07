// backend/services/relations/analyzers/userDomainAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class UserDomainAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userDomainRelations');
  }

  async analyze(logs) {
    console.log('Analyzing user↔domain relations...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const relations = this._extractUserDomainRelations(logs);

    if (relations.length === 0) {
      console.log('No user↔domain relations found to analyze');
      return true;
    }

    console.log(`Processing ${relations.length} user↔domain relations`);

    await this._processBatch(relations, async (batch) => {
      await Promise.all(
        batch.map(async (data) => {
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
          return RelationsModel.upsertRelation(
            'username', data.username, 'domain', data.domain,
            { type: 'user_domain', hostname: data.hostname, timestamp: data.lastSeen, firstSeen: data.firstSeen },
            operationTags, data.logId
          );
        })
      );
    });

    return true;
  }

  _extractUserDomainRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.username && log.domain,
      groupBy: log => `${log.username}§${log.domain}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        const username = key.substring(0, sepIdx);
        const domain = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        const hostnames = _.uniq(entries.map(e => e.hostname).filter(Boolean));
        return {
          username, domain,
          hostname: hostnames[0] || null,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }
}

module.exports = { UserDomainAnalyzer };
