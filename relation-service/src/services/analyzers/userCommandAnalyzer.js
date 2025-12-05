// relation-service/src/services/analyzers/userCommandAnalyzer.js
const _ = require('lodash');
const db = require('../../db');
const RelationsModel = require('../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');
const batchService = require('../batchService'); // ADD THIS LINE - FIX FOR THE BUG

/**
 * Analyzer for user command relations
 * Identifies and stores relationships between users and the commands they execute
 */
class UserCommandAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userCommands'); // Use 'userCommands' as the batch type
  }

  /**
   * Analyze logs for user-command relationships
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    const callId = Math.random().toString(36).substring(7);
    console.log(`[${callId}] Analyzing user-command relations with parallel batch processing...`);
    console.log(`[${callId}] DEBUG: analyze() called with ${logs.length} logs, IDs: ${logs.map(l => l.id).join(', ')}`);

    // Debug incoming logs to see what we're working with
    if (logs.length > 0) {
      console.log(`[${callId}] Sample log command for analysis:`,
        logs[0].command ? logs[0].command.substring(0, 50) + (logs[0].command.length > 50 ? '...' : '') : 'none');
    }

    // Fetch operation tags for all logs upfront
    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);
    console.log(`[${callId}] DEBUG: Fetched operation tags for ${logIds.length} logs, map size: ${operationTagsMap.size}`);
    console.log(`[${callId}] DEBUG: Map keys: ${Array.from(operationTagsMap.keys()).join(', ')}`);
    console.log(`[${callId}] DEBUG: Map values: ${JSON.stringify(Array.from(operationTagsMap.entries()))}`);

    // Extract user commands from logs
    const userCommands = this._extractUserCommands(logs);

    // Early exit if no user commands to process
    if (userCommands.length === 0) {
      console.log('No user commands found to analyze');
      return true;
    }

    // Get existing relations for efficient comparison
    const existingRelations = await this._getExistingUserCommands();

    // Create a set of existing username:command combinations for quick lookup
    // Use a special separator to avoid conflicts with command content
    const existingUserCommandSet = new Set();
    existingRelations.forEach(row => {
      existingUserCommandSet.add(`${row.username}§${row.command}`);
    });

    // Process the commands in batches
    await this._processBatch(userCommands, async (commandBatch) => {
      // Process commands in parallel inside each batch for better performance
      await Promise.all(
        commandBatch.map(async (data) => {
          console.log(`[${callId}] Storing relation: ${data.username} → ${data.command.substring(0, 50)}${data.command.length > 50 ? '...' : ''}`);
          console.log(`[${callId}]   DEBUG: logId=${data.logId}, mapHasKey=${operationTagsMap.has(data.logId)}, mapSize=${operationTagsMap.size}`);

          // Get operation tags for this log, with fallback to direct DB query if not in map
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap, callId);
          console.log(`[${callId}]   DEBUG: operationTags=${JSON.stringify(operationTags)}`);

          return RelationsModel.upsertRelation(
            'username',
            data.username,
            'command',
            data.command,
            {
              type: 'user_command',
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            },
            operationTags,
            data.logId
          );
        })
      );
    });

    // Handle removals for stale commands - commands that exist in the database
    // but are no longer present in the logs we're analyzing
    await this._removeStaleCommands(userCommands, existingUserCommandSet);

    return true;
  }

  // _fetchOperationTags and _getOperationTagsWithFallback are now in BaseAnalyzer

  /**
   * Extract user commands from logs with proper formatting
   * @param {Array} logs - Log entries
   * @returns {Array} Formatted user commands
   * @private
   */
  _extractUserCommands(logs) {
    // Use the _extractFromLogs utility from the base class
    return this._extractFromLogs(logs, {
      // Filter logs that have both username and command
      filter: log => log.username && log.command,

      // Group by username and command using a special separator
      groupBy: log => `${log.username}§${log.command}`,

      // Map each group to a user command object
      mapFn: (entries, key) => {
        // Split using our special separator
        const [username, command] = key.split('§');

        // Verify the command is intact
        console.log(`Processing command for user ${username}: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);

        // Find min and max timestamps in one pass
        const timestamps = _.map(entries, 'timestamp');

        // Use the most recent log's ID for tracking
        const mostRecentLog = _.maxBy(entries, 'timestamp');

        return {
          username,
          command,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps),
          logId: mostRecentLog?.id // Add log ID for tracking
        };
      }
    });
  }

  /**
   * Get existing user command relations from the database
   * @returns {Promise<Array>} Existing relations
   * @private
   */
  async _getExistingUserCommands() {
    try {
      const result = await db.query(`
        SELECT source_value as username, target_value as command
        FROM relations 
        WHERE source_type = 'username' AND target_type = 'command'
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting existing user commands:', error);
      return [];
    }
  }

  /**
   * Remove stale commands that no longer exist in the logs
   * @param {Array} userCommands - Current user commands
   * @param {Set} existingUserCommandSet - Set of existing commands
   * @returns {Promise<void>}
   * @private
   */
  async _removeStaleCommands(userCommands, existingUserCommandSet) {
    // Use our special separator consistently
    const activeUserCommandKeys = userCommands.map(data => `${data.username}§${data.command}`);
    const staleCommands = Array.from(existingUserCommandSet)
      .filter(key => !activeUserCommandKeys.includes(key));
    
    if (staleCommands.length === 0) {
      return;
    }
    
    console.log(`Found ${staleCommands.length} stale commands for removal`);
    
    // Enhanced delete batch processor with parallelization
    const deleteBatchProcessor = async (deleteBatch) => {
      // Group deletes by username for more efficient query planning
      const deletesByUsername = _.groupBy(deleteBatch, key => key.split('§')[0]);
      
      // Process each username group in parallel
      await Promise.all(
        Object.entries(deletesByUsername).map(async ([username, commands]) => {
          const commandValues = commands.map(key => key.split('§')[1]);
          
          // Delete all commands for this username in one query
          await db.query(`
            DELETE FROM relations 
            WHERE source_type = 'username' 
              AND source_value = $1 
              AND target_type = 'command' 
              AND target_value = ANY($2::text[])
          `, [username, commandValues]);
        })
      );
    };
    
    // Process stale commands in chunks
    const staleChunks = _.chunk(staleCommands, this.CHUNK_SIZE);
    
    await Promise.all(
      staleChunks.map(chunk => {
        return new Promise(resolve => {
          batchService.addToBatch('staleCommands', chunk, async (batchData) => {
            await deleteBatchProcessor(_.flatten(batchData));
            resolve();
          });
        });
      })
    );
  }
}

module.exports = { UserCommandAnalyzer };