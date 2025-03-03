// relation-service/src/services/relationAnalyzer.js
const db = require('../db');
const RelationsModel = require('../models/relations');
const FileStatusModel = require('../models/fileStatus');
const FileStatusService = require('./fileStatusService');
const batchService = require('./batchService');
const _ = require('lodash');

/**
 * Enhanced RelationAnalyzer with parallel processing capabilities
 * for improved performance with large datasets
 */
class RelationAnalyzer {
  /**
   * Main analysis function - now with improved parallel processing and additional relation types
   * @param {Object} options - Analysis options
   * @param {Array} options.targetedTypes - Specific relation types to process
   * @param {Number} options.timeWindow - Time window in days (default: 30)
   */
  static async analyzeLogs(options = {}) {
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
      
      // Map targeted types to analysis functions
      const analysisMap = {
        'user': () => this.analyzeUserCommandRelationsBatched(logs.rows)
          .catch(error => console.error('Error in user command analysis:', error)),
        
        'ip': () => this.analyzeIPRelationsBatched(logs.rows)
          .catch(error => console.error('Error in IP analysis:', error)),
        
        'hostname': () => this.analyzeHostnameRelationsBatched(logs.rows)
          .catch(error => console.error('Error in hostname analysis:', error)),
        
        'domain': () => this.analyzeDomainRelationsBatched(logs.rows)
          .catch(error => console.error('Error in domain analysis:', error)),
        
        'file': () => this.processFileStatusesWithParallel(logs.rows)
          .catch(error => console.error('Error processing file statuses:', error)),
          
        'command': () => this.analyzeUserCommandRelationsBatched(logs.rows)
          .catch(error => console.error('Error in user command analysis:', error)),
        
        // Add the new relation types
        'user_hostname': () => this.analyzeUserHostnameRelationsBatched(logs.rows)
          .catch(error => console.error('Error in user-hostname analysis:', error)),
        
        'user_ip': () => this.analyzeUserIPRelationsBatched(logs.rows)
          .catch(error => console.error('Error in user-IP analysis:', error))
      };
      
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
        analyzedTypes: targetedTypes.length > 0 ? targetedTypes : Object.keys(analysisMap)
      };
    } catch (error) {
      console.error('Error in parallel log analysis:', error);
      throw error;
    }
  }

  /**
   * Process user command relations in batches with internal parallelization
   */
  static async analyzeUserCommandRelationsBatched(logs) {
    console.log('Analyzing user-command relations with parallel batch processing...');
    
    // Debug incoming logs to see what we're working with
    if (logs.length > 0) {
      console.log('Sample log command for analysis:', 
        logs[0].command ? logs[0].command.substring(0, 50) + (logs[0].command.length > 50 ? '...' : '') : 'none');
    }
    
    // Efficiently group data using lodash
    const userCommands = _.chain(logs)
      .filter(log => log.username && log.command)
      // Use a different separator that won't conflict with backslashes
      // For example, using a special character like § that's unlikely to be in commands
      .groupBy(log => `${log.username}§${log.command}`)
      .map((entries, key) => {
        // Split using our special separator
        const [username, command] = key.split('§');
        
        // Verify the command is intact
        console.log(`Processing command for user ${username}: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
        
        // Find min and max timestamps in one pass
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          username,
          command,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      })
      .value();
    
    // Early exit if no user commands to process
    if (userCommands.length === 0) {
      console.log('No user commands found to analyze');
      return true;
    }
    
    // Get existing relations for efficient comparison
    const existingRelations = await db.query(`
      SELECT source_value as username, target_value as command
      FROM relations 
      WHERE source_type = 'username' AND target_type = 'command'
    `);
    
    // Create a set of existing username:command combinations for quick lookup
    // Use the same special separator as above
    const existingUserCommandSet = new Set();
    existingRelations.rows.forEach(row => {
      existingUserCommandSet.add(`${row.username}§${row.command}`);
    });
    
    // Enhanced batch processor with internal parallelization
    const batchProcessor = async (commandBatch) => {
      // Process commands in parallel inside each batch for better performance
      await Promise.all(
        commandBatch.map(data => {
          console.log(`Storing relation: ${data.username} → ${data.command.substring(0, 50)}${data.command.length > 50 ? '...' : ''}`);
          
          return RelationsModel.upsertRelation(
            'username',
            data.username,
            'command',
            data.command,
            {
              type: 'user_command',
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            }
          );
        })
      );
    };
    
    // Process user commands in optimally sized chunks
    // Balance between too small (overhead) and too large (memory issues)
    const CHUNK_SIZE = 50;
    const commandChunks = _.chunk(userCommands, CHUNK_SIZE);
    
    console.log(`Processing ${userCommands.length} commands in ${commandChunks.length} parallel chunks`);
    
    // Process each chunk in parallel across batches
    await Promise.all(
      commandChunks.map(chunk => {
        // Add each chunk to the batch service
        return new Promise(resolve => {
          batchService.addToBatch('userCommands', chunk, async (batchData) => {
            await batchProcessor(_.flatten(batchData));
            resolve();
          });
        });
      })
    );
    
    // Handle removals for stale commands
    // Use our special separator consistently
    const activeUserCommandKeys = userCommands.map(data => `${data.username}§${data.command}`);
    const staleCommands = Array.from(existingUserCommandSet)
      .filter(key => !activeUserCommandKeys.includes(key));
    
    if (staleCommands.length > 0) {
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
      const staleChunks = _.chunk(staleCommands, CHUNK_SIZE);
      
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
    
    return true;
  }

  /**
   * Process IP relations in batches with internal parallelization
   */
  static async analyzeIPRelationsBatched(logs) {
    console.log('Analyzing IP relations with parallel batch processing...');
    
    // Efficiently group and process IP relations
    const ipRelations = _.chain(logs)
      .filter(log => log.internal_ip && log.external_ip)
      .groupBy(log => `${log.internal_ip}:${log.external_ip}`)
      .map((entries, key) => {
        const [internal, external] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          internal,
          external,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      })
      .value();
    
    if (ipRelations.length === 0) {
      console.log('No IP relations found to analyze');
      return true;
    }
    
    // Enhanced batch processor with parallelization
    const batchProcessor = async (ipBatch) => {
      // Process IP relations in parallel within each batch
      await Promise.all(
        ipBatch.map(data => 
          RelationsModel.upsertRelation(
            'ip',
            data.internal,
            'ip',
            data.external,
            {
              type: 'ip_connection',
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            }
          )
        )
      );
    };
    
    // Process in optimally sized chunks
    const CHUNK_SIZE = 50;
    const ipChunks = _.chunk(ipRelations, CHUNK_SIZE);
    
    console.log(`Processing ${ipRelations.length} IP relations in ${ipChunks.length} parallel chunks`);
    
    // Process each chunk in parallel across batches
    await Promise.all(
      ipChunks.map(chunk => {
        return new Promise(resolve => {
          batchService.addToBatch('ipRelations', chunk, async (batchData) => {
            await batchProcessor(_.flatten(batchData));
            resolve();
          });
        });
      })
    );
    
    return true;
  }

  /**
   * Process hostname relations in batches with internal parallelization
   */
  static async analyzeHostnameRelationsBatched(logs) {
    console.log('Analyzing hostname relations with parallel batch processing...');
    
    // Efficiently group and process hostname relations
    const hostnameRelations = _.chain(logs)
      .filter(log => log.hostname && log.domain)
      .groupBy(log => `${log.hostname}:${log.domain}`)
      .map((entries, key) => {
        const [hostname, domain] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          hostname,
          domain,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      })
      .value();
    
    if (hostnameRelations.length === 0) {
      console.log('No hostname relations found to analyze');
      return true;
    }
    
    // Enhanced batch processor with parallelization
    const batchProcessor = async (hostnameBatch) => {
      // Process hostname relations in parallel within each batch
      await Promise.all(
        hostnameBatch.map(data => 
          RelationsModel.upsertRelation(
            'hostname',
            data.hostname,
            'domain',
            data.domain,
            {
              type: 'hostname_domain',
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            }
          )
        )
      );
    };
    
    // Process in optimally sized chunks
    const CHUNK_SIZE = 50;
    const hostnameChunks = _.chunk(hostnameRelations, CHUNK_SIZE);
    
    console.log(`Processing ${hostnameRelations.length} hostname relations in ${hostnameChunks.length} parallel chunks`);
    
    // Process each chunk in parallel across batches
    await Promise.all(
      hostnameChunks.map(chunk => {
        return new Promise(resolve => {
          batchService.addToBatch('hostnameRelations', chunk, async (batchData) => {
            await batchProcessor(_.flatten(batchData));
            resolve();
          });
        });
      })
    );
    
    return true;
  }

  /**
   * Process domain relations in batches with internal parallelization
   */
  static async analyzeDomainRelationsBatched(logs) {
    console.log('Analyzing domain relations with parallel batch processing...');
    
    // Efficiently group and process domain relations
    const domainRelations = _.chain(logs)
      .filter(log => log.domain && log.internal_ip)
      .groupBy(log => `${log.domain}:${log.internal_ip}`)
      .map((entries, key) => {
        const [domain, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          domain,
          ip,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      })
      .value();
    
    if (domainRelations.length === 0) {
      console.log('No domain relations found to analyze');
      return true;
    }
    
    // Enhanced batch processor with parallelization
    const batchProcessor = async (domainBatch) => {
      // Process domain relations in parallel within each batch
      await Promise.all(
        domainBatch.map(data => 
          RelationsModel.upsertRelation(
            'domain',
            data.domain,
            'ip',
            data.ip,
            {
              type: 'domain_ip',
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            }
          )
        )
      );
    };
    
    // Process in optimally sized chunks
    const CHUNK_SIZE = 50;
    const domainChunks = _.chunk(domainRelations, CHUNK_SIZE);
    
    console.log(`Processing ${domainRelations.length} domain relations in ${domainChunks.length} parallel chunks`);
    
    // Process each chunk in parallel across batches
    await Promise.all(
      domainChunks.map(chunk => {
        return new Promise(resolve => {
          batchService.addToBatch('domainRelations', chunk, async (batchData) => {
            await batchProcessor(_.flatten(batchData));
            resolve();
          });
        });
      })
    );
    
    return true;
  }

  /**
   * Process file statuses with parallel processing
   * Uses concurrent processing for better performance
   */
  static async processFileStatusesWithParallel(logs) {
    try {
      console.log('Processing file statuses with parallel execution...');
      
      // Filter logs with filenames
      const filenameLogs = logs.filter(log => log.filename && log.filename.trim() !== '');
      
      if (filenameLogs.length === 0) {
        console.log('No logs with filenames found to process');
        return 0;
      }
      
      console.log(`Found ${filenameLogs.length} logs with filenames to process in parallel`);
      
      // Group by filename to prevent concurrent updates to the same file
      const logsByFilename = _.groupBy(filenameLogs, 'filename');
      
      // Process each unique filename in parallel
      const results = await Promise.all(
        Object.entries(logsByFilename).map(async ([filename, fileLogs]) => {
          try {
            // Sort logs by timestamp to ensure proper order
            const sortedLogs = _.sortBy(fileLogs, 'timestamp');
            
            // Process this file's logs - we process logs for the same file sequentially
            // for data consistency, but different files are processed in parallel
            await FileStatusService.processLogEntries(sortedLogs);
            return { filename, success: true, count: sortedLogs.length };
          } catch (error) {
            console.error(`Error processing file status for ${filename}:`, error);
            return { filename, success: false, error: error.message };
          }
        })
      );
      
      // Count successful updates
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      
      console.log(`Processed ${successCount} files successfully in parallel (${failCount} failures)`);
      return successCount;
    } catch (error) {
      console.error('Error in parallel file status processing:', error);
      throw error;
    }
  }
  
  /**
   * Process user-to-hostname relations in batches with parallel processing
   * This creates relations between users and the hosts they access
   */
  static async analyzeUserHostnameRelationsBatched(logs) {
    console.log('Analyzing user-hostname relations with parallel batch processing...');
    
    // Efficiently group data using lodash
    const userHostnames = _.chain(logs)
      .filter(log => log.username && log.hostname)
      .groupBy(log => `${log.username}:${log.hostname}`)
      .map((entries, key) => {
        const [username, hostname] = key.split(':');
        // Find min and max timestamps in one pass
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          username,
          hostname,
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      })
      .value();
    
    // Early exit if no user-hostname pairs to process
    if (userHostnames.length === 0) {
      console.log('No user-hostname relations found to analyze');
      return true;
    }
    
    console.log(`Found ${userHostnames.length} user-hostname relations to process`);
    
    // Enhanced batch processor with parallelization
    const batchProcessor = async (userHostnameBatch) => {
      // Process relations in parallel within each batch
      await Promise.all(
        userHostnameBatch.map(data => 
          RelationsModel.upsertRelation(
            'username',
            data.username,
            'hostname',
            data.hostname,
            {
              type: 'user_hostname',
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            }
          )
        )
      );
    };
    
    // Process in optimally sized chunks
    const CHUNK_SIZE = 50;
    const userHostnameChunks = _.chunk(userHostnames, CHUNK_SIZE);
    
    console.log(`Processing ${userHostnames.length} user-hostname relations in ${userHostnameChunks.length} parallel chunks`);
    
    // Process each chunk in parallel across batches
    await Promise.all(
      userHostnameChunks.map(chunk => {
        return new Promise(resolve => {
          batchService.addToBatch('userHostnameRelations', chunk, async (batchData) => {
            await batchProcessor(_.flatten(batchData));
            resolve();
          });
        });
      })
    );
    
    return true;
  }

  /**
   * Process user-to-IP relations in batches with parallel processing
   * This creates relations between users and the IP addresses they use
   */
  static async analyzeUserIPRelationsBatched(logs) {
    console.log('Analyzing user-IP relations with parallel batch processing...');
    
    // Process internal IP connections
    const userInternalIPs = _.chain(logs)
      .filter(log => log.username && log.internal_ip)
      .groupBy(log => `${log.username}:${log.internal_ip}`)
      .map((entries, key) => {
        const [username, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          username,
          ip,
          ipType: 'internal',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      })
      .value();
    
    // Process external IP connections
    const userExternalIPs = _.chain(logs)
      .filter(log => log.username && log.external_ip)
      .groupBy(log => `${log.username}:${log.external_ip}`)
      .map((entries, key) => {
        const [username, ip] = key.split(':');
        const timestamps = _.map(entries, 'timestamp');
        
        return {
          username,
          ip,
          ipType: 'external',
          firstSeen: _.min(timestamps),
          lastSeen: _.max(timestamps)
        };
      })
      .value();
    
    // Combine both types of IP relations
    const userIPs = [...userInternalIPs, ...userExternalIPs];
    
    // Early exit if no user-IP pairs to process
    if (userIPs.length === 0) {
      console.log('No user-IP relations found to analyze');
      return true;
    }
    
    console.log(`Found ${userIPs.length} user-IP relations to process (${userInternalIPs.length} internal, ${userExternalIPs.length} external)`);
    
    // Enhanced batch processor with parallelization
    const batchProcessor = async (userIPBatch) => {
      // Process relations in parallel within each batch
      await Promise.all(
        userIPBatch.map(data => 
          RelationsModel.upsertRelation(
            'username',
            data.username,
            'ip',
            data.ip,
            {
              type: 'user_ip',
              ipType: data.ipType,
              timestamp: data.lastSeen,
              firstSeen: data.firstSeen
            }
          )
        )
      );
    };
    
    // Process in optimally sized chunks
    const CHUNK_SIZE = 50;
    const userIPChunks = _.chunk(userIPs, CHUNK_SIZE);
    
    console.log(`Processing ${userIPs.length} user-IP relations in ${userIPChunks.length} parallel chunks`);
    
    // Process each chunk in parallel across batches
    await Promise.all(
      userIPChunks.map(chunk => {
        return new Promise(resolve => {
          batchService.addToBatch('userIPRelations', chunk, async (batchData) => {
            await batchProcessor(_.flatten(batchData));
            resolve();
          });
        });
      })
    );
    
    return true;
  }
  
  /**
   * Run targeted analysis for a specific batch of logs
   * Used for immediate updates when data changes
   */
  static async analyzeSpecificLogs(logs, options = {}) {
    console.log(`Running targeted analysis for ${logs.length} logs`);
    
    const analysisTypes = options.types || ['user', 'ip', 'hostname', 'domain', 'file', 'user_hostname', 'user_ip'];
    const analysisPromises = [];
    
    if (analysisTypes.includes('user')) {
      analysisPromises.push(this.analyzeUserCommandRelationsBatched(logs));
    }
    
    if (analysisTypes.includes('ip')) {
      analysisPromises.push(this.analyzeIPRelationsBatched(logs));
    }
    
    if (analysisTypes.includes('hostname')) {
      analysisPromises.push(this.analyzeHostnameRelationsBatched(logs));
    }
    
    if (analysisTypes.includes('domain')) {
      analysisPromises.push(this.analyzeDomainRelationsBatched(logs));
    }
    
    if (analysisTypes.includes('file')) {
      analysisPromises.push(this.processFileStatusesWithParallel(logs));
    }
    
    if (analysisTypes.includes('user_hostname')) {
      analysisPromises.push(this.analyzeUserHostnameRelationsBatched(logs));
    }
    
    if (analysisTypes.includes('user_ip')) {
      analysisPromises.push(this.analyzeUserIPRelationsBatched(logs));
    }
    
    // Run all requested analysis types in parallel
    await Promise.all(analysisPromises.map(p => p.catch(error => {
      console.error('Error in targeted analysis:', error);
    })));
    
    return { status: 'success', processedCount: logs.length };
  }
}

module.exports = RelationAnalyzer;