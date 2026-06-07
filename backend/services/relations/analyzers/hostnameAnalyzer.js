// backend/services/relations/analyzers/hostnameAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class HostnameAnalyzer extends BaseAnalyzer {
  constructor() {
    super('hostnameRelations');
  }

  async analyze(logs) {
    console.log('Analyzing hostname relations with parallel batch processing...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const hostnameRelations = this._extractHostnameRelations(logs);
    const hostnameCommandRelations = this._extractHostnameCommandRelations(logs);

    let processedCount = 0;

    if (hostnameRelations.length > 0) {
      await this._processBatch(hostnameRelations, async (hostnameBatch) => {
        await Promise.all(
          hostnameBatch.map(async (data) => {
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
            return RelationsModel.upsertRelation(
              'hostname', data.hostname, 'domain', data.domain,
              { type: 'hostname_domain', timestamp: data.lastSeen, firstSeen: data.firstSeen },
              operationTags, data.logId
            );
          })
        );
      });
      processedCount += hostnameRelations.length;
    }

    if (hostnameCommandRelations.length > 0) {
      console.log(`Processing ${hostnameCommandRelations.length} hostname command relations`);
      await this._processBatch(hostnameCommandRelations, async (batchItems) => {
        await Promise.all(
          batchItems.map(async (data) => {
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
            return RelationsModel.upsertRelation(
              'hostname', data.hostname, 'command', data.command,
              { type: 'hostname_command', username: data.username, internal_ip: data.internal_ip, timestamp: data.lastSeen, firstSeen: data.firstSeen },
              operationTags, data.logId
            );
          })
        );
      });
      processedCount += hostnameCommandRelations.length;
    }

    console.log(`Hostname analyzer processed ${processedCount} total relations`);
    return true;
  }

  _extractHostnameRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.hostname && log.domain,
      // Use § separator — safe against colons in hostnames or domains
      groupBy: log => `${log.hostname}§${log.domain}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        const hostname = key.substring(0, sepIdx);
        const domain = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { hostname, domain, firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });
  }

  _extractHostnameCommandRelations(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.command && log.hostname && log.command.trim() !== '',
      groupBy: log => `${log.hostname}§${log.command}`,
      mapFn: (entries, key) => {
        const sepIdx = key.indexOf('§');
        if (sepIdx === -1) return null;
        const hostname = key.substring(0, sepIdx);
        const command = key.substring(sepIdx + 1);
        const timestamps = _.map(entries, 'timestamp').filter(Boolean);
        const usernames = _.uniq(entries.map(e => e.username).filter(Boolean));
        const internalIPs = _.uniq(entries.map(e => e.internal_ip).filter(Boolean));
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { hostname, command, username: usernames[0] || null, internal_ip: internalIPs[0] || null, firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });
  }
}

module.exports = { HostnameAnalyzer };
