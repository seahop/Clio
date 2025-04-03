// relation-service/src/services/analyzers/commandSequenceAnalyzer.js
const _ = require('lodash');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for command sequence patterns
 * Identifies and stores temporal relationships between commands executed by users
 */
class CommandSequenceAnalyzer extends BaseAnalyzer {
  constructor() {
    super('commandSequences');
    this.SEQUENCE_WINDOW = 15 * 60 * 1000; // 15 minutes in milliseconds
    this.MIN_SEQUENCE_CONFIDENCE = 0.35; // Minimum confidence threshold (35%)
  }

  /**
   * Analyze logs for command sequence patterns
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    console.log('Analyzing command sequence patterns with temporal context...');
    
    // 1. Extract command sequences by user
    const userCommandSequences = this._extractUserCommandSequences(logs);
    
    if (!userCommandSequences || Object.keys(userCommandSequences).length === 0) {
      console.log('No command sequences found to analyze');
      return true;
    }
    
    // 2. Detect patterns in the command sequences
    const sequencePatterns = [];
    
    // Process each user's commands
    for (const [username, commands] of Object.entries(userCommandSequences)) {
      console.log(`Analyzing command sequences for user ${username}: ${commands.length} commands`);
      
      // Sort commands by timestamp
      const sortedCommands = _.sortBy(commands, 'timestamp');
      
      // Find command sequences that occur within our time window
      for (let i = 0; i < sortedCommands.length - 1; i++) {
        const currentCommand = sortedCommands[i];
        
        // Look for subsequent commands within the time window
        for (let j = i + 1; j < sortedCommands.length; j++) {
          const nextCommand = sortedCommands[j];
          
          // Calculate time difference between commands
          const timeDiff = new Date(nextCommand.timestamp) - new Date(currentCommand.timestamp);
          
          // Only consider commands within our sequence window
          if (timeDiff <= 0 || timeDiff > this.SEQUENCE_WINDOW) {
            continue;
          }
          
          // Add to our sequence patterns
          sequencePatterns.push({
            username,
            command1: currentCommand.command,
            command2: nextCommand.command,
            timeDiff,
            firstSeen: currentCommand.timestamp,
            lastSeen: nextCommand.timestamp,
            context: {
              hostname: currentCommand.hostname || nextCommand.hostname,
              internal_ip: currentCommand.internal_ip || nextCommand.internal_ip
            }
          });
          
          // We found a next command within the window, move to the next source command
          break;
        }
      }
    }
    
    console.log(`Found ${sequencePatterns.length} potential command sequence patterns`);
    
    // 3. Analyze sequence frequency to find meaningful patterns
    if (sequencePatterns.length > 0) {
      // Group similar sequences
      const patternGroups = this._groupSimilarSequences(sequencePatterns);
      
      // Calculate confidence for each pattern group
      const significantPatterns = this._calculatePatternConfidence(patternGroups);
      
      // 4. Store significant sequence patterns
      await this._storeSequencePatterns(significantPatterns);
    }
    
    return true;
  }
  
  /**
   * Extract user command sequences from logs
   * @param {Array} logs - Log entries
   * @returns {Object} Map of username to commands
   * @private
   */
  _extractUserCommandSequences(logs) {
    // Filter logs that have both username and command
    const commandLogs = logs.filter(log => 
      log.username && 
      log.command && 
      log.timestamp && 
      log.command.trim() !== ''
    );
    
    if (commandLogs.length === 0) {
      return {};
    }
    
    // Group commands by username
    return _.groupBy(commandLogs, 'username');
  }
  
  /**
   * Group similar command sequences together
   * @param {Array} sequences - Raw sequence patterns
   * @returns {Array} Grouped sequence patterns
   * @private
   */
  _groupSimilarSequences(sequences) {
    // Group sequences by command pairs
    return _.groupBy(sequences, sequence => 
      `${sequence.username}:${this._normalizeCommand(sequence.command1)}:${this._normalizeCommand(sequence.command2)}`
    );
  }
  
  /**
   * Normalize a command for better pattern matching
   * @param {string} command - The command to normalize
   * @returns {string} Normalized command
   * @private
   */
  _normalizeCommand(command) {
    if (!command) return '';
    
    // Remove specific file paths, IPs, and variable parameters
    let normalized = command
      // Remove absolute paths
      .replace(/\/(?:[^\s\/]+\/)+[^\s\/]+/g, '/path')
      // Remove relative paths
      .replace(/\.\/[^\s]+/g, './file')
      // Remove IPs
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, 'ip')
      // Remove numbers (except single digits)
      .replace(/\b\d{2,}\b/g, 'n');
      
    // Keep only the first part of the command (the actual command, not its arguments)
    const mainCommand = normalized.split(' ')[0];
    
    // For common commands, include the action type 
    if (['ls', 'find', 'grep', 'cat', 'more', 'less', 'tail', 'head'].includes(mainCommand)) {
      // For file listing/reading commands, include the basic operation type
      const parts = normalized.split(' ').slice(0, 3);
      return parts.join(' ');
    } else if (['cd', 'mkdir', 'rmdir', 'touch'].includes(mainCommand)) {
      // For file/directory management, include the basic operation
      const parts = normalized.split(' ').slice(0, 2);
      return parts.join(' ');
    } else if (['cp', 'mv', 'scp', 'rsync'].includes(mainCommand)) {
      // For file transfer commands, keep the main command only
      return mainCommand;
    }
    
    // Default: keep the first two parts of the command
    const parts = normalized.split(' ').slice(0, 2);
    return parts.join(' ');
  }
  
  /**
   * Calculate confidence scores for pattern groups and filter significant ones
   * @param {Object} patternGroups - Grouped sequence patterns
   * @returns {Array} Significant patterns with confidence scores
   * @private
   */
  _calculatePatternConfidence(patternGroups) {
    const significantPatterns = [];
    
    for (const [key, patterns] of Object.entries(patternGroups)) {
      if (patterns.length < 2) continue; // Need at least 2 occurrences
      
      // Calculate average time difference
      const avgTimeDiff = _.meanBy(patterns, 'timeDiff');
      
      // Calculate time difference variance
      const timeDiffVariance = _.sumBy(patterns, p => 
        Math.pow(p.timeDiff - avgTimeDiff, 2)
      ) / patterns.length;
      
      // Lower variance indicates more consistent timing between commands
      const timingConsistency = 1 / (1 + Math.sqrt(timeDiffVariance) / 1000);
      
      // Calculate overall confidence based on frequency and timing consistency
      const frequency = Math.min(1, patterns.length / 10); // Cap at 1 (10+ occurrences)
      const confidence = (frequency * 0.7) + (timingConsistency * 0.3);
      
      // Only keep patterns above our confidence threshold
      if (confidence >= this.MIN_SEQUENCE_CONFIDENCE) {
        // Split key to get components
        const [username, cmd1, cmd2] = key.split(':');
        
        // Find the most recent occurrence
        const mostRecent = _.maxBy(patterns, 'lastSeen');
        
        // Find the earliest occurrence
        const earliest = _.minBy(patterns, 'firstSeen');
        
        significantPatterns.push({
          username,
          command1: cmd1,
          command2: cmd2,
          occurrences: patterns.length,
          avgTimeDiff,
          firstSeen: earliest.firstSeen,
          lastSeen: mostRecent.lastSeen,
          confidence,
          context: mostRecent.context
        });
      }
    }
    
    // Sort by confidence (descending)
    return _.orderBy(significantPatterns, ['confidence'], ['desc']);
  }
  
  /**
   * Store significant command sequence patterns
   * @param {Array} patterns - Significant command sequence patterns
   * @private
   */
  async _storeSequencePatterns(patterns) {
    if (patterns.length === 0) {
      console.log('No significant command sequence patterns to store');
      return;
    }
    
    console.log(`Storing ${patterns.length} significant command sequence patterns`);
    
    // Process patterns in batches
    await this._processBatch(patterns, async (batchPatterns) => {
      // Process each pattern
      await Promise.all(batchPatterns.map(async pattern => {
        try {
          // Store relation between the two commands
          await RelationsModel.upsertRelation(
            'command',
            pattern.command1,
            'command',
            pattern.command2,
            {
              type: 'command_sequence',
              username: pattern.username,
              occurrences: pattern.occurrences,
              avgTimeDiff: pattern.avgTimeDiff,
              confidence: pattern.confidence,
              hostname: pattern.context.hostname,
              internal_ip: pattern.context.internal_ip,
              firstSeen: pattern.firstSeen,
              lastSeen: pattern.lastSeen
            }
          );
        } catch (error) {
          console.error('Error storing command sequence pattern:', error);
        }
      }));
    });
    
    console.log('Command sequence patterns stored successfully');
  }
}

module.exports = { CommandSequenceAnalyzer };