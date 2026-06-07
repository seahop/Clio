// backend/services/relations/analyzers/macAddressAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

class MacAddressAnalyzer extends BaseAnalyzer {
  constructor() {
    super('macAddressRelations');
  }

  async analyze(logs) {
    console.log('Analyzing MAC address relations with parallel batch processing...');

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const macInternalIpRelations = this._extractMacInternalIpRelations(logs);
    const macHostnameRelations = this._extractMacHostnameRelations(logs);

    const totalRelations = macInternalIpRelations.length + macHostnameRelations.length;
    if (totalRelations === 0) {
      console.log('No MAC address relations found to analyze');
      return true;
    }

    console.log(`Found ${totalRelations} MAC address relations to process`);

    if (macInternalIpRelations.length > 0) {
      await this._processBatch(macInternalIpRelations, async (macBatch) => {
        const validBatch = macBatch.filter(data => data && data.macAddress && data.ipAddress);
        await Promise.all(
          validBatch.map(async (data) => {
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
            return RelationsModel.upsertRelation(
              'mac_address', data.macAddress, 'ip', data.ipAddress,
              { type: 'mac_ip_mapping', hostname: data.hostname, ipType: 'internal', timestamp: data.lastSeen, firstSeen: data.firstSeen },
              operationTags, data.logId
            );
          })
        );
      });
    }

    if (macHostnameRelations.length > 0) {
      await this._processBatch(macHostnameRelations, async (macBatch) => {
        const validBatch = macBatch.filter(data => data && data.macAddress && data.hostname);
        await Promise.all(
          validBatch.map(async (data) => {
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
            return RelationsModel.upsertRelation(
              'mac_address', data.macAddress, 'hostname', data.hostname,
              { type: 'mac_hostname_mapping', internal_ip: data.internal_ip, ipType: 'internal', timestamp: data.lastSeen, firstSeen: data.firstSeen },
              operationTags, data.logId
            );
          })
        );
      });
    }

    return true;
  }

  _extractMacInternalIpRelations(logs) {
    const macLogs = logs.filter(log => log.mac_address && log.internal_ip);
    if (macLogs.length === 0) return [];

    const internalRelations = this._extractFromLogs(macLogs, {
      filter: log => log.mac_address && log.internal_ip,
      groupBy: log => {
        const normalizedMac = log.mac_address.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || log.mac_address;
        return `${normalizedMac}:${log.internal_ip}`;
      },
      mapFn: (entries, key) => {
        const parts = key.split(':');
        if (parts.length < 2 || !parts[0] || !parts[1]) return null;
        const macAddress = parts[0];
        const ipAddress = parts[1];
        const timestamps = _.map(entries, 'timestamp');
        const hostnames = _.uniq(entries.map(e => e.hostname).filter(Boolean));
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { macAddress, ipAddress, hostname: hostnames[0] || null, ipType: 'internal', firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });

    return internalRelations.filter(r => r && r.macAddress && r.ipAddress);
  }

  _extractMacHostnameRelations(logs) {
    const macHostnameLogs = logs.filter(log => log.mac_address && log.hostname);
    if (macHostnameLogs.length === 0) return [];

    const relations = this._extractFromLogs(macHostnameLogs, {
      filter: log => log.mac_address && log.hostname,
      groupBy: log => {
        const normalizedMac = log.mac_address.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || log.mac_address;
        return `${normalizedMac}:${log.hostname}`;
      },
      mapFn: (entries, key) => {
        const parts = key.split(':');
        if (parts.length < 2 || !parts[0] || !parts[1]) return null;
        const macAddress = parts[0];
        const hostname = parts[1];
        const timestamps = _.map(entries, 'timestamp');
        const entriesWithInternalIp = entries.filter(e => e.internal_ip);
        const mostRecentInternalIp = entriesWithInternalIp.length > 0 ? _.maxBy(entriesWithInternalIp, 'timestamp').internal_ip : null;
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { macAddress, hostname, internal_ip: mostRecentInternalIp, firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });

    return relations.filter(r => r && r.macAddress && r.hostname);
  }
}

module.exports = { MacAddressAnalyzer };
