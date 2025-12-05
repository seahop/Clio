// relation-service/src/services/analyzers/ipAnalyzer.js
const _ = require('lodash');
const db = require('../../db');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for IP relations
 * Identifies and stores relationships between internal and external IP addresses
 * Enhanced to also track commands executed on IPs
 */
class IPAnalyzer extends BaseAnalyzer {
  constructor() {
    super('ipRelations');
  }

  /**
   * Analyze logs for IP relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing IP relations with parallel batch processing...');

    // Fetch operation tags for all logs upfront
    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    // Extract IP relations from logs
    const ipRelations = this._extractIPRelations(logs);

    // Extract IP command relations - new enhancement
    const ipCommandRelations = this._extractIPCommandRelations(logs);

    let processedCount = 0;

    if (ipRelations.length > 0) {
      // Process the IP relations in batches
      await this._processBatch(ipRelations, async (ipBatch) => {
        // Process IP relations in parallel within each batch
        await Promise.all(
          ipBatch.map(async (data) => {
            // Get operation tags for this log with fallback
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);

            return RelationsModel.upsertRelation(
              'ip',
              data.internal,
              'ip',
              data.external,
              {
                type: 'ip_connection',
                timestamp: data.lastSeen,
                firstSeen: data.firstSeen
              },
              operationTags,
              data.logId
            );
          })
        );
      });

      processedCount += ipRelations.length;
    }
    
    // Process the IP command relations - new enhancement
    if (ipCommandRelations.length > 0) {
      console.log(`Processing ${ipCommandRelations.length} IP command relations`);

      await this._processBatch(ipCommandRelations, async (batchItems) => {
        // Process relations in parallel within each batch
        await Promise.all(
          batchItems.map(async (data) => {
            // Get operation tags for this log with fallback
            const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);

            return RelationsModel.upsertRelation(
              'ip',
              data.ip,
              'command',
              data.command,
              {
                type: 'ip_command',
                username: data.username,
                timestamp: data.lastSeen,
                firstSeen: data.firstSeen,
                ipType: data.ipType
              },
              operationTags,
              data.logId
            );
          })
        );
      });

      processedCount += ipCommandRelations.length;
    }
    
    console.log(`IP analyzer processed ${processedCount} total relations`);
    return true;
  }

  /**
   * Extract IP relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted IP relations
   * @private
   */
  _extractIPRelations(logs) {
    return this._extractFromLogs(logs, {
      // Filter logs that have both internal and external IPs
      filter: log => log.internal_ip && log.external_ip,

      // Group by internal and external IPs
      groupBy: log => `${log.internal_ip}:${log.external_ip}`,

      // Map each group to an IP relation object
      mapFn: (entries, key) => {
        const [internal, external] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          internal,
          external,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
  }
  
  /**
   * Extract IP command relations from logs - new method
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted IP-command relations
   * @private
   */
  _extractIPCommandRelations(logs) {
    // Extract internal IP command relations
    const internalIPCommands = this._extractFromLogs(logs, {
      // Filter logs that have both command and internal_ip
      filter: log => log.command && log.internal_ip && log.command.trim() !== '',

      // Group by IP and command to avoid duplicates
      groupBy: log => `${log.internal_ip}:${log.command}`,

      // Map each group to a relation object
      mapFn: (entries, key) => {
        // Split by first colon only to preserve command content with colons
        const colonIndex = key.indexOf(':');
        if (colonIndex === -1) return null;

        const ip = key.substring(0, colonIndex);
        const command = key.substring(colonIndex + 1);

        const timestamps = _.map(entries, 'timestamp');
        const usernames = _.uniq(entries.map(entry => entry.username).filter(Boolean));

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          ip,
          command,
          username: usernames.length > 0 ? usernames[0] : null,
          ipType: 'internal',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
    
    // Extract external IP command relations
    const externalIPCommands = this._extractFromLogs(logs, {
      // Filter logs that have both command and external_ip
      filter: log => log.command && log.external_ip && log.command.trim() !== '',

      // Group by IP and command to avoid duplicates
      groupBy: log => `${log.external_ip}:${log.command}`,

      // Map each group to a relation object
      mapFn: (entries, key) => {
        // Split by first colon only to preserve command content with colons
        const colonIndex = key.indexOf(':');
        if (colonIndex === -1) return null;

        const ip = key.substring(0, colonIndex);
        const command = key.substring(colonIndex + 1);

        const timestamps = _.map(entries, 'timestamp');
        const usernames = _.uniq(entries.map(entry => entry.username).filter(Boolean));

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          ip,
          command,
          username: usernames.length > 0 ? usernames[0] : null,
          ipType: 'external',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });
    
    // Filter out any null entries that might have been created
    const combined = [...internalIPCommands, ...externalIPCommands].filter(item => item !== null);

    return combined;
  }

  // _fetchOperationTags and _getOperationTagsWithFallback are now in BaseAnalyzer
}

module.exports = { IPAnalyzer };