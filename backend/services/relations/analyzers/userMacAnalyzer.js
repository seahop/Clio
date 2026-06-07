// backend/services/relations/analyzers/userMacAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class UserMacAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userMacRelations');
  }

  async analyze(logs) {
    console.log('Analyzing user↔MAC address relations...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const relations = this._extractUserMacRelations(logs);

    if (relations.length === 0) {
      console.log('No user↔MAC relations found to analyze');
      return true;
    }

    console.log(`Processing ${relations.length} user↔MAC relations`);

    await this._processBatch(relations, async (batch) => {
      await Promise.all(
        batch.map(async (data) => {
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
          return RelationsModel.upsertRelation(
            'username', data.username, 'mac_address', data.macAddress,
            { type: 'user_mac', hostname: data.hostname, internal_ip: data.internal_ip, timestamp: data.lastSeen, firstSeen: data.firstSeen },
            operationTags, data.logId
          );
        })
      );
    });

    return true;
  }

  _extractUserMacRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.username && log.mac_address,
      groupBy: log => {
        const normalizedMac = log.mac_address.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || log.mac_address;
        return `${log.username}§${normalizedMac}`;
      },
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        const username = key.substring(0, sepIdx);
        const macAddress = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        const hostnames = _.uniq(entries.map(e => e.hostname).filter(Boolean));
        const internalIPs = _.uniq(entries.map(e => e.internal_ip).filter(Boolean));
        return {
          username, macAddress,
          hostname: hostnames[0] || null,
          internal_ip: internalIPs[0] || null,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }
}

module.exports = { UserMacAnalyzer };
