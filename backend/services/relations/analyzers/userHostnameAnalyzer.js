// backend/services/relations/analyzers/userHostnameAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class UserHostnameAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userHostnameRelations');
  }

  async analyze(logs) {
    console.log('Analyzing user-hostname relations with parallel batch processing...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const userHostnames = this._extractUserHostnameRelations(logs);

    if (userHostnames.length === 0) {
      console.log('No user-hostname relations found to analyze');
      return true;
    }

    console.log(`Found ${userHostnames.length} user-hostname relations to process`);

    await this._processBatch(userHostnames, async (userHostnameBatch) => {
      await Promise.all(
        userHostnameBatch.map(async (data) => {
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
          return RelationsModel.upsertRelation(
            'username', data.username, 'hostname', data.hostname,
            { type: 'user_hostname', timestamp: data.lastSeen, firstSeen: data.firstSeen },
            operationTags, data.logId
          );
        })
      );
    });

    return true;
  }

  _extractUserHostnameRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.username && log.hostname,
      groupBy: log => `${log.username}:${log.hostname}`,
      mapFn: (entries, key) => {
        const [username, hostname] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { username, hostname, firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });
  }
}

module.exports = { UserHostnameAnalyzer };
