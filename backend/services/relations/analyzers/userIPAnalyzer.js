// backend/services/relations/analyzers/userIPAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class UserIPAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userIPRelations');
  }

  async analyze(logs) {
    console.log('Analyzing user-IP relations with parallel batch processing...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const userInternalIPs = this._extractUserInternalIPRelations(logs);
    const userExternalIPs = this._extractUserExternalIPRelations(logs);
    const userIPs = [...userInternalIPs, ...userExternalIPs];

    if (userIPs.length === 0) {
      console.log('No user-IP relations found to analyze');
      return true;
    }

    console.log(`Found ${userIPs.length} user-IP relations to process (${userInternalIPs.length} internal, ${userExternalIPs.length} external)`);

    await this._processBatch(userIPs, async (userIPBatch) => {
      await Promise.all(
        userIPBatch.map(async (data) => {
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
          return RelationsModel.upsertRelation(
            'username', data.username, 'ip', data.ip,
            { type: 'user_ip', ipType: data.ipType, timestamp: data.lastSeen, firstSeen: data.firstSeen },
            operationTags, data.logId
          );
        })
      );
    });

    return true;
  }

  _extractUserInternalIPRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.username && log.internal_ip,
      groupBy: log => `${log.username}:${log.internal_ip}`,
      mapFn: (entries, key) => {
        const [username, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { username, ip, ipType: 'internal', firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });
  }

  _extractUserExternalIPRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.username && log.external_ip,
      groupBy: log => `${log.username}:${log.external_ip}`,
      mapFn: (entries, key) => {
        const [username, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { username, ip, ipType: 'external', firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });
  }
}

module.exports = { UserIPAnalyzer };
