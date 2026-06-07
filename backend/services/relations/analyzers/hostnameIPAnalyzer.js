// backend/services/relations/analyzers/hostnameIPAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class HostnameIPAnalyzer extends BaseAnalyzer {
  constructor() {
    super('hostnameIPRelations');
  }

  async analyze(logs) {
    console.log('Analyzing hostname↔IP relations...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const relations = this._extractHostnameIPRelations(logs);

    if (relations.length === 0) {
      console.log('No hostname↔IP relations found to analyze');
      return true;
    }

    console.log(`Processing ${relations.length} hostname↔IP relations`);

    await this._processBatch(relations, async (batch) => {
      await Promise.all(
        batch.map(async (data) => {
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
          return RelationsModel.upsertRelation(
            'hostname', data.hostname, 'ip', data.ip,
            { type: 'hostname_ip', ipType: data.ipType, timestamp: data.lastSeen, firstSeen: data.firstSeen },
            operationTags, data.logId
          );
        })
      );
    });

    return true;
  }

  _extractHostnameIPRelations(logs) {
    const internalRelations = this._extractFromLogs(logs, {
      filter: log => log.hostname && log.internal_ip,
      groupBy: log => `${log.hostname}§${log.internal_ip}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        const hostname = key.substring(0, sepIdx);
        const ip = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { hostname, ip, ipType: 'internal', firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });

    const externalRelations = this._extractFromLogs(logs, {
      filter: log => log.hostname && log.external_ip,
      groupBy: log => `${log.hostname}§${log.external_ip}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        const hostname = key.substring(0, sepIdx);
        const ip = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { hostname, ip, ipType: 'external', firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });

    return [...internalRelations, ...externalRelations];
  }
}

module.exports = { HostnameIPAnalyzer };
