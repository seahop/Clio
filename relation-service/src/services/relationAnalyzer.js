// relation-service/src/services/relationAnalyzer.js
const db = require('../db');
const _ = require('lodash');
const batchService = require('./batchService');
const {
  UserCommandAnalyzer,
  IPAnalyzer,
  HostnameAnalyzer,
  DomainAnalyzer,
  FileStatusAnalyzer,
  UserHostnameAnalyzer,
  UserIPAnalyzer,
  MacAddressAnalyzer,
  CommandSequenceAnalyzer
} = require('./analyzers');

/**
 * The RelationAnalyzer orchestrates the analysis process across different relation types.
 * It delegates the actual analysis work to specialized analyzers.
 */
class RelationAnalyzer {
  constructor() {
    // Initialize all specialized analyzers
    this.analyzers = {
      user: new UserCommandAnalyzer(),
      ip: new IPAnalyzer(),
      hostname: new HostnameAnalyzer(),
      domain: new DomainAnalyzer(),
      file: new FileStatusAnalyzer(),
      command: new UserCommandAnalyzer(), // Alias for 'user'
      user_hostname: new UserHostnameAnalyzer(),
      user_ip: new UserIPAnalyzer(),
      mac_address: new MacAddressAnalyzer(),
      command_sequence: new CommandSequenceAnalyzer() // New command sequence analyzer
    };
  }

  /**
   * Main analysis function that coordinates work across all analyzers
   * @param {Object} options - Analysis options
   * @param {Array} options.targetedTypes - Specific relation types to process
   * @param {Number} options.timeWindow - Time window in days (default: 30)
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeLogs(options = {}) {
    try {
      console.log('Starting log analysis with parallel processing...');
      
      const timeWindow = options.timeWindow || 30;
      const targetedTypes = options.targetedTypes || [];
      
      if (targetedTypes.length > 0) {
        console.log(`Targeted analysis requested for types: ${targetedTypes.join(', ')}`);
      }
      
      // Get logs with time window to limit data size
      const logs = await db.query(`
        SELECT *
        FROM logs
        WHERE timestamp > NOW() - INTERVAL '${timeWindow} days'
        ORDER BY timestamp DESC
      `);

      const logCount = logs.rows.length;
      console.log(`Found ${logCount} logs to analyze within ${timeWindow} day window`);
      
      if (logCount === 0) {
        return { status: 'success', processedCount: 0 };
      }

      // Determine which analysis types to run based on options
      const analysisPromises = [];
      
      // Map targeted types to analyzer functions
      const analysisMap = this._buildAnalysisMap(logs.rows);
      
      // If targeted types are specified, only run those analyses
      if (targetedTypes.length > 0) {
        for (const type of targetedTypes) {
          if (analysisMap[type]) {
            console.log(`Adding targeted analysis for type: ${type}`);
            analysisPromises.push(analysisMap[type]());
          } else {
            console.warn(`Unknown analysis type requested: ${type}`);
          }
        }
      } else {
        // Run all analysis types
        console.log('Running full analysis with all types');
        for (const analyzeFunc of Object.values(analysisMap)) {
          analysisPromises.push(analyzeFunc());
        }
      }
      
      // Run all selected analyses in parallel
      await Promise.all(analysisPromises);
      
      // Final step: flush any remaining batches
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

  /**
   * Builds a map of analysis functions for each type
   * @param {Array} logs - Log rows to analyze
   * @returns {Object} Map of analysis functions
   * @private
   */
  _buildAnalysisMap(logs) {
    return {
      'user': () => this.analyzers.user.analyze(logs)
        .catch(error => console.error('Error in user command analysis:', error)),
      
      'ip': () => this.analyzers.ip.analyze(logs)
        .catch(error => console.error('Error in IP analysis:', error)),
      
      'hostname': () => this.analyzers.hostname.analyze(logs)
        .catch(error => console.error('Error in hostname analysis:', error)),
      
      'domain': () => this.analyzers.domain.analyze(logs)
        .catch(error => console.error('Error in domain analysis:', error)),
      
      'file': () => this.analyzers.file.analyze(logs)
        .catch(error => console.error('Error processing file statuses:', error)),
          
      'command': () => this.analyzers.command.analyze(logs)
        .catch(error => console.error('Error in user command analysis:', error)),
      
      'user_hostname': () => this.analyzers.user_hostname.analyze(logs)
        .catch(error => console.error('Error in user-hostname analysis:', error)),
      
      'user_ip': () => this.analyzers.user_ip.analyze(logs)
        .catch(error => console.error('Error in user-IP analysis:', error)),
      
      'mac_address': () => this.analyzers.mac_address.analyze(logs)
        .catch(error => console.error('Error in MAC address analysis:', error)),
        
      'command_sequence': () => this.analyzers.command_sequence.analyze(logs)
        .catch(error => console.error('Error in command sequence analysis:', error))
    };
  }

  /**
   * Run targeted analysis for a specific batch of logs
   * @param {Array} logs - Log entries to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeSpecificLogs(logs, options = {}) {
    console.log(`Running targeted analysis for ${logs.length} logs`);
    
    const analysisTypes = options.types || ['user', 'ip', 'hostname', 'domain', 'file', 'user_hostname', 'user_ip', 'mac_address', 'command_sequence'];
    const analysisPromises = [];
    
    for (const type of analysisTypes) {
      if (this.analyzers[type]) {
        analysisPromises.push(this.analyzers[type].analyze(logs));
      }
    }
    
    // Run all requested analysis types in parallel
    await Promise.all(analysisPromises.map(p => p.catch(error => {
      console.error('Error in targeted analysis:', error);
    })));
    
    return { status: 'success', processedCount: logs.length };
  }
}

// Create singleton instance
const relationAnalyzer = new RelationAnalyzer();

module.exports = relationAnalyzer;