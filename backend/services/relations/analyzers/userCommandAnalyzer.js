// backend/services/relations/analyzers/userCommandAnalyzer.js
const _ = require('lodash');
const db = require('../../../db');
const RelationsModel = require('../../../models/relations');
const { BaseAnalyzer } = require('./baseAnalyzer');
const batchService = require('../batchService');

class UserCommandAnalyzer extends BaseAnalyzer {
  constructor() {
    super('userCommands');
  }

  async analyze(logs) {
    console.log(`Analyzing user-command relations with parallel batch processing (${logs.length} logs)...`);

    const logIds = logs.map(log => log.id).filter(id => id);
    const operationTagsMap = await this._fetchOperationTags(logIds);

    const userCommands = this._extractUserCommands(logs);

    if (userCommands.length === 0) {
      console.log('No user commands found to analyze');
      return true;
    }

    const usernames = [...new Set(userCommands.map(uc => uc.username))];
    const existingRelations = await this._getExistingUserCommands(usernames);

    const existingUserCommandSet = new Set();
    existingRelations.forEach(row => {
      existingUserCommandSet.add(`${row.username}§${row.command}`);
    });

    await this._processBatch(userCommands, async (commandBatch) => {
      await Promise.all(
        commandBatch.map(async (data) => {
          const operationTags = await this._getOperationTagsWithFallback(data.logId, operationTagsMap);
          return RelationsModel.upsertRelation(
            'username', data.username, 'command', data.command,
            { type: 'user_command', timestamp: data.lastSeen, firstSeen: data.firstSeen },
            operationTags, data.logId
          );
        })
      );
    });

    await this._removeStaleCommands(userCommands, existingUserCommandSet);
    return true;
  }

  _extractUserCommands(logs) {
    return this._extractFromLogs(logs, {
      filter: log => log.username && log.command,
      groupBy: log => `${log.username}§${log.command}`,
      mapFn: (entries, key) => {
        const [username, command] = key.split('§');
        const timestamps = _.map(entries, 'timestamp');
        const mostRecentLog = _.maxBy(entries, 'timestamp');
        return { username, command, firstSeen: _.min(timestamps), lastSeen: _.max(timestamps), logId: mostRecentLog?.id };
      }
    });
  }

  async _getExistingUserCommands(usernames) {
    if (!usernames || usernames.length === 0) return [];
    try {
      const result = await db.query(`
        SELECT source_value as username, metadata->>'originalCommand' as command
        FROM relations
        WHERE source_type = 'username' AND target_type = 'command'
          AND source_value = ANY($1::text[])
      `, [usernames]);
      return result.rows;
    } catch (error) {
      console.error('Error getting existing user commands:', error);
      return [];
    }
  }

  async _removeStaleCommands(userCommands, existingUserCommandSet) {
    const activeUserCommandKeys = new Set(userCommands.map(data => `${data.username}§${data.command}`));
    const staleCommands = Array.from(existingUserCommandSet).filter(key => !activeUserCommandKeys.has(key));

    if (staleCommands.length === 0) return;

    console.log(`Found ${staleCommands.length} stale commands for removal`);

    const deleteBatchProcessor = async (deleteBatch) => {
      const deletesByUsername = _.groupBy(deleteBatch, key => key.split('§')[0]);
      await Promise.all(
        Object.entries(deletesByUsername).map(async ([username, commands]) => {
          const commandValues = commands.map(key => key.split('§')[1]);
          await db.query(`
            DELETE FROM relations
            WHERE source_type = 'username'
              AND source_value = $1
              AND target_type = 'command'
              AND metadata->>'originalCommand' = ANY($2::text[])
          `, [username, commandValues]);
        })
      );
    };

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
