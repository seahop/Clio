// backend/services/relations/relationAnalyzer.js
const db = require('../../db');
const _ = require('lodash');
const batchService = require('./batchService');
const {
  UserCommandAnalyzer,
  IPAnalyzer,
  HostnameAnalyzer,
  HostnameIPAnalyzer,
  DomainAnalyzer,
  FileStatusAnalyzer,
  UserHostnameAnalyzer,
  UserIPAnalyzer,
  UserMacAnalyzer,
  UserDomainAnalyzer,
  MacAddressAnalyzer
} = require('./analyzers');

class RelationAnalyzer {
  constructor() {
    this.analyzers = {
      user: new UserCommandAnalyzer(),
      ip: new IPAnalyzer(),
      hostname: new HostnameAnalyzer(),
      hostname_ip: new HostnameIPAnalyzer(),
      domain: new DomainAnalyzer(),
      file: new FileStatusAnalyzer(),
      command: new UserCommandAnalyzer(),
      user_hostname: new UserHostnameAnalyzer(),
      user_ip: new UserIPAnalyzer(),
      user_mac: new UserMacAnalyzer(),
      user_domain: new UserDomainAnalyzer(),
      mac_address: new MacAddressAnalyzer()
    };
  }

  async analyzeLogs(options = {}) {
    try {
      console.log('Starting log analysis with parallel processing...');

      const timeWindow = options.timeWindow || 30;
      const targetedTypes = options.targetedTypes || [];

      if (targetedTypes.length > 0) {
        console.log(`Targeted analysis requested for types: ${targetedTypes.join(', ')}`);
      }

      const logs = await db.query(`
        SELECT *
        FROM logs
        WHERE timestamp > NOW() - INTERVAL '${timeWindow} days'
        ORDER BY timestamp DESC
      `);

      const logCount = logs.rows.length;
      console.log(`Found ${logCount} logs to analyze within ${timeWindow} day window`);

      if (logCount === 0) return { status: 'success', processedCount: 0 };

      const analysisMap = this._buildAnalysisMap(logs.rows);
      const analysisPromises = [];

      if (targetedTypes.length > 0) {
        for (const type of targetedTypes) {
          if (analysisMap[type]) analysisPromises.push(analysisMap[type]());
          else console.warn(`Unknown analysis type requested: ${type}`);
        }
      } else {
        for (const analyzeFunc of Object.values(analysisMap)) {
          analysisPromises.push(analyzeFunc());
        }
      }

      await Promise.all(analysisPromises);
      await batchService.flushAllBatches();

      console.log('Parallel analysis completed successfully');
      return {
        status: 'success',
        processedCount: logCount,
        analyzedTypes: targetedTypes.length > 0 ? targetedTypes : Object.keys(this.analyzers)
      };
    } catch (error) {
      console.error('Error in parallel log analysis:', error);
      throw error;
    }
  }

  _buildAnalysisMap(logs) {
    const run = (key) => () => this.analyzers[key].analyze(logs).catch(e => console.error(`Error in ${key} analysis:`, e));
    return {
      'user':          run('user'),
      'ip':            run('ip'),
      'hostname':      run('hostname'),
      'hostname_ip':   run('hostname_ip'),
      'domain':        run('domain'),
      'file':          run('file'),
      'command':       run('command'),
      'user_hostname': run('user_hostname'),
      'user_ip':       run('user_ip'),
      'user_mac':      run('user_mac'),
      'user_domain':   run('user_domain'),
      'mac_address':   run('mac_address'),
    };
  }

  async analyzeSpecificLogs(logs, options = {}) {
    console.log(`Running targeted analysis for ${logs.length} logs`);

    const analysisTypes = options.types || ['user', 'ip', 'hostname', 'domain', 'file', 'user_hostname', 'user_ip', 'mac_address'];
    const analysisPromises = [];

    for (const type of analysisTypes) {
      if (this.analyzers[type]) analysisPromises.push(this.analyzers[type].analyze(logs));
    }

    await Promise.all(analysisPromises.map(p => p.catch(error => {
      console.error('Error in targeted analysis:', error);
    })));

    await batchService.flushAllBatches();

    return { status: 'success', processedCount: logs.length };
  }
}

const relationAnalyzer = new RelationAnalyzer();
module.exports = relationAnalyzer;
