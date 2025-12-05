// relation-service/src/services/analyzers/macAddressAnalyzer.js
const _ = require('lodash');
const db = require('../../db');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for MAC address relations
 * Identifies and stores relationships between MAC addresses, IP addresses, and hostnames
 */
class MacAddressAnalyzer extends BaseAnalyzer {
  constructor() {
    super('macAddressRelations');
  }

  /**
   * Analyze logs for MAC-IP relationships and MAC-hostname relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing MAC address relations with parallel batch processing...');

    // Fetch operation tags for all logs upfront
    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    // Extract MAC address relations from logs - focus on internal IPs
    const macInternalIpRelations = this._extractMacInternalIpRelations(logs);
    const macHostnameRelations = this._extractMacHostnameRelations(logs);

    const totalRelations = macInternalIpRelations.length + macHostnameRelations.length;

    if (totalRelations === 0) {
      console.log('No MAC address relations found to analyze');
      return true;
    }

    console.log(`Found ${totalRelations} MAC address relations to process (${macInternalIpRelations.length} internal IP, ${macHostnameRelations.length} hostname)`);

    // Process the MAC-internal IP relations in batches
    if (macInternalIpRelations.length > 0) {
      await this._processBatch(macInternalIpRelations, async (macBatch) => {
        // Additional validation to prevent null values
        const validBatch = macBatch.filter(data =>
          data && data.macAddress && data.ipAddress
        );

        if (validBatch.length !== macBatch.length) {
          console.log(`Filtered out ${macBatch.length - validBatch.length} invalid MAC-IP relations`);
        }

        // Process MAC address relations in parallel within each batch
        await Promise.all(
          validBatch.map(data => {
            // Get operation tags for this log
            const operationTags = operationTagsMap.get(data.logId) || [];

            return RelationsModel.upsertRelation(
              'mac_address',
              data.macAddress,
              'ip',
              data.ipAddress,
              {
                type: 'mac_ip_mapping',
                hostname: data.hostname,
                ipType: 'internal', // Explicitly mark as internal
                timestamp: data.lastSeen,
                firstSeen: data.firstSeen
              },
              operationTags,
              data.logId
            );
          })
        );
      });
    }

    // Process the MAC-hostname relations in batches
    if (macHostnameRelations.length > 0) {
      await this._processBatch(macHostnameRelations, async (macBatch) => {
        // Additional validation to prevent null values
        const validBatch = macBatch.filter(data =>
          data && data.macAddress && data.hostname
        );

        if (validBatch.length !== macBatch.length) {
          console.log(`Filtered out ${macBatch.length - validBatch.length} invalid MAC-hostname relations`);
        }

        // Process MAC address-hostname relations in parallel within each batch
        await Promise.all(
          validBatch.map(data => {
            // Get operation tags for this log
            const operationTags = operationTagsMap.get(data.logId) || [];

            return RelationsModel.upsertRelation(
              'mac_address',
              data.macAddress,
              'hostname',
              data.hostname,
              {
                type: 'mac_hostname_mapping',
                internal_ip: data.internal_ip,
                ipType: 'internal',
                timestamp: data.lastSeen,
                firstSeen: data.firstSeen
              },
              operationTags,
              data.logId
            );
          })
        );
      });
    }

    return true;
  }

  /**
   * Extract MAC-internal IP relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted MAC-IP relations
   * @private
   */
  _extractMacInternalIpRelations(logs) {
    // Filter logs with both MAC address and internal IP
    const macLogs = logs.filter(log =>
      log.mac_address && log.internal_ip
    );

    if (macLogs.length === 0) {
      return [];
    }

    // Create relations for internal IPs
    const internalRelations = this._extractFromLogs(macLogs, {
      // Filter logs that have both MAC address and internal_ip
      filter: log => log.mac_address && log.internal_ip,

      // Group by MAC address and internal IP
      groupBy: log => {
        // Normalize MAC address to standard format with dashes
        const normalizedMac = log.mac_address.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || log.mac_address;
        return `${normalizedMac}:${log.internal_ip}`;
      },

      // Map each group to a MAC-IP relation object
      mapFn: (entries, key) => {
        // Extract parts from the key (format: macAddress:ipAddress)
        const parts = key.split(':');
        if (parts.length < 2 || !parts[0] || !parts[1]) {
          console.log(`Skipping invalid MAC-IP relation key: ${key}`);
          return null; // Will be filtered out later
        }

        const macAddress = parts[0]; // Already normalized with dashes
        const ipAddress = parts[1];
        const timestamps = _.map(entries, 'timestamp');
        const hostnames = _.uniq(entries.map(entry => entry.hostname).filter(Boolean));

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          macAddress,
          ipAddress,
          hostname: hostnames.length > 0 ? hostnames[0] : null,
          ipType: 'internal',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });

    // Filter out any null entries
    return internalRelations.filter(relation =>
      relation && relation.macAddress && relation.ipAddress
    );
  }

  /**
   * Extract MAC-hostname relations from logs
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted MAC-hostname relations
   * @private
   */
  _extractMacHostnameRelations(logs) {
    // Filter logs with both MAC address and hostname
    const macHostnameLogs = logs.filter(log =>
      log.mac_address &&
      log.hostname
    );

    if (macHostnameLogs.length === 0) {
      return [];
    }

    // Create relations for MAC-hostname
    const relations = this._extractFromLogs(macHostnameLogs, {
      // Filter logs that have both MAC address and hostname
      filter: log => log.mac_address && log.hostname,

      // Group by MAC address and hostname
      groupBy: log => {
        // Normalize MAC address to standard format with dashes
        const normalizedMac = log.mac_address.toUpperCase().replace(/[:-]/g, '').match(/.{1,2}/g)?.join('-') || log.mac_address;
        return `${normalizedMac}:${log.hostname}`;
      },

      // Map each group to a MAC-hostname relation object
      mapFn: (entries, key) => {
        // Extract parts from the key (format: macAddress:hostname)
        const parts = key.split(':');
        if (parts.length < 2 || !parts[0] || !parts[1]) {
          console.log(`Skipping invalid MAC-hostname relation key: ${key}`);
          return null; // Will be filtered out later
        }

        const macAddress = parts[0]; // Already normalized with dashes
        const hostname = parts[1];
        const timestamps = _.map(entries, 'timestamp');

        // Find the most recent entry with internal_ip
        const entriesWithInternalIp = entries.filter(entry => entry.internal_ip);
        const mostRecentInternalIp = entriesWithInternalIp.length > 0
          ? _.maxBy(entriesWithInternalIp, 'timestamp').internal_ip
          : null;

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          macAddress,
          hostname,
          internal_ip: mostRecentInternalIp,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id
        };
      }
    });

    // Filter out any null entries
    return relations.filter(relation =>
      relation && relation.macAddress && relation.hostname
    );
  }

  /**
   * Fetch operation tags for a set of log IDs
   * @param {Array} logIds - Array of log IDs
   * @returns {Promise<Map>} Map of logId -> operation tag IDs
   */
  async _fetchOperationTags(logIds) {
    if (logIds.length === 0) {
      return new Map();
    }

    try {
      const result = await db.query(`
        SELECT
          lt.log_id,
          ARRAY_AGG(DISTINCT lt.tag_id) as tag_ids
        FROM log_tags lt
        WHERE lt.log_id = ANY($1)
        GROUP BY lt.log_id
      `, [logIds]);

      const tagMap = new Map();
      result.rows.forEach(row => {
        tagMap.set(row.log_id, row.tag_ids || []);
      });

      return tagMap;
    } catch (error) {
      console.error('Error fetching operation tags:', error);
      return new Map();
    }
  }
}

module.exports = { MacAddressAnalyzer };
