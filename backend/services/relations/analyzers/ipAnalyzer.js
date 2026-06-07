// backend/services/relations/analyzers/ipAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class IPAnalyzer extends BaseAnalyzer {
  constructor() {
    super('ipRelations');
  }

  async analyze(logs) {
    console.log('Analyzing IP relations with parallel batch processing...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const ipRelations = this._extractIPRelations(logs);
    const ipCommandRelations = this._extractIPCommandRelations(logs);

    let processedCount = 0;

    if (ipRelations.length > 0) {
      await this._processBatch(ipRelations, async (ipBatch) => {
        await Promise.all(
          ipBatch.map(async (data) => {
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
            return RelationsModel.upsertRelation(
              'ip', data.internal, 'ip', data.external,
              { type: 'ip_connection', timestamp: data.lastSeen, firstSeen: data.firstSeen },
              operationTags, data.logId
            );
          })
        );
      });
      processedCount += ipRelations.length;
    }

    if (ipCommandRelations.length > 0) {
      console.log(`Processing ${ipCommandRelations.length} IP command relations`);
      await this._processBatch(ipCommandRelations, async (batchItems) => {
        await Promise.all(
          batchItems.map(async (data) => {
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
            return RelationsModel.upsertRelation(
              'ip', data.ip, 'command', data.command,
              { type: 'ip_command', username: data.username, timestamp: data.lastSeen, firstSeen: data.firstSeen, ipType: data.ipType },
              operationTags, data.logId
            );
          })
        );
      });
      processedCount += ipCommandRelations.length;
    }

    console.log(`IP analyzer processed ${processedCount} total relations`);
    return true;
  }

  _extractIPRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.internal_ip && log.external_ip,
      // Use § separator — safe against IPv6 addresses which contain colons
      groupBy: log => `${log.internal_ip}§${log.external_ip}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        const internal = key.substring(0, sepIdx);
        const external = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { internal, external, firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });
  }

  _extractIPCommandRelations(logs) {
    const internalIPCommands = this._extractFromLogs(logs, {
      filter: log => log.command && log.internal_ip && log.command.trim() !== '',
      groupBy: log => `${log.internal_ip}§${log.command}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        if (sepIdx === -1) return null;
        const ip = key.substring(0, sepIdx);
        const command = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const usernames = _.uniq(entries.map(e => e.username).filter(Boolean));
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { ip, command, username: usernames[0] || null, ipType: 'internal', firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });

    const externalIPCommands = this._extractFromLogs(logs, {
      filter: log => log.command && log.external_ip && log.command.trim() !== '',
      groupBy: log => `${log.external_ip}§${log.command}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        if (sepIdx === -1) return null;
        const ip = key.substring(0, sepIdx);
        const command = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const usernames = _.uniq(entries.map(e => e.username).filter(Boolean));
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { ip, command, username: usernames[0] || null, ipType: 'external', firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });

    return [...internalIPCommands, ...externalIPCommands].filter(item => item !== null);
  }
}

module.exports = { IPAnalyzer };
