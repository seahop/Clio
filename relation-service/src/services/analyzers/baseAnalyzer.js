// relation-service/src/services/analyzers/baseAnalyzer.js
const _ = require('lodash');
const batchService = require('../batchService');
const db = require('../../db');

/**
 * Base class for all relation analyzers
 * Provides common functionality and defines the interface for specialized analyzers
 */
class BaseAnalyzer {
  constructor(batchType) {
    this.batchType = batchType || 'default';
    this.CHUNK_SIZE = 50; // Optimal chunk size for batch processing
  }

  /**
   * Analyze logs for relations - to be implemented by subclasses
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<boolean>} Success status
   */
  async analyze(logs) {
    throw new Error('analyze() method must be implemented by subclass');
  }

  /**
   * Process data in batches with internal parallelization
   * @param {Array} data - Data to process
   * @param {Function} processorFn - Function to process each batch item
   * @returns {Promise<number>} Number of processed items
   * @protected
   */
  async _processBatch(data, processorFn) {
    if (!data || data.length === 0) {
      console.log(`No data to process for ${this.batchType}`);
      return 0;
    }
    
    console.log(`Processing ${data.length} items for ${this.batchType}`);
    
    // Process in optimally sized chunks
    const chunks = _.chunk(data, this.CHUNK_SIZE);
    
    console.log(`Split into ${chunks.length} chunks of max size ${this.CHUNK_SIZE}`);
    
    // Process each chunk in parallel
    await Promise.all(
      chunks.map(chunk => {
        return new Promise(resolve => {
          batchService.addToBatch(this.batchType, chunk, async (batchData) => {
            // Process the batch with the provided function
            try {
              await processorFn(_.flatten(batchData));
              resolve();
            } catch (error) {
              console.error(`Error processing batch for ${this.batchType}:`, error);
              resolve(); // Resolve anyway to continue with other batches
            }
          });
        });
      })
    );
    
    return data.length;
  }

  /**
   * Helper method to safely extract values from logs with optional processing
   * @param {Array} logs - Log entries
   * @param {Object} options - Extraction options
   * @returns {Array} Processed data
   * @protected
   */
  _extractFromLogs(logs, options = {}) {
    const {
      filter = () => true,         // Function to filter logs
      groupBy = null,              // String or function for grouping
      mapFn = item => item,        // Function to map each group
      sortBy = null,               // String or function for sorting
      deduplicate = false,         // Whether to deduplicate results
      deduplicateBy = null         // Field to use for deduplication
    } = options;
    
    // Filter logs first
    const filteredLogs = logs.filter(filter);
    
    if (filteredLogs.length === 0) {
      return [];
    }
    
    // Apply grouping if specified
    let processed = filteredLogs;
    if (groupBy) {
      processed = _.chain(filteredLogs)
        .groupBy(groupBy)
        .map(mapFn)
        .value();
    }
    
    // Apply sorting if specified
    if (sortBy) {
      processed = _.sortBy(processed, sortBy);
    }
    
    // Apply deduplication if requested
    if (deduplicate) {
      if (deduplicateBy) {
        processed = _.uniqBy(processed, deduplicateBy);
      } else {
        processed = _.uniq(processed);
      }
    }
    
    return processed;
  }

  /**
   * Fetch operation tags for given log IDs
   * Handles race conditions by providing fresh tag data when needed
   * @param {Array} logIds - Array of log IDs to fetch tags for
   * @returns {Promise<Map>} Map of logId -> array of tag IDs
   * @protected
   */
  async _fetchOperationTags(logIds) {
    if (!logIds || logIds.length === 0) {
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

  /**
   * Get operation tags for a log, fetching from database if not in the provided map
   * This handles race conditions where analysis runs before tags are fully committed
   * @param {number} logId - The log ID to get tags for
   * @param {Map} operationTagsMap - Existing map of log ID -> tags
   * @param {string} callId - Optional call ID for debug logging
   * @returns {Promise<Array>} Array of tag IDs for the log
   * @protected
   */
  async _getOperationTagsWithFallback(logId, operationTagsMap, callId = '') {
    // Try to get from the map first
    let operationTags = operationTagsMap.get(logId);

    // If not in map and we have a valid logId, fetch directly from database
    // This handles the case where analysis was scheduled before the log was tagged
    if (!operationTags && logId) {
      if (callId) {
        console.log(`[${callId}]   DEBUG: Tags not in map for logId ${logId}, fetching directly...`);
      }
      const freshTags = await this._fetchOperationTags([logId]);
      operationTags = freshTags.get(logId) || [];
      if (callId) {
        console.log(`[${callId}]   DEBUG: Fetched tags: ${JSON.stringify(operationTags)}`);
      }
    } else if (!operationTags) {
      operationTags = [];
    }

    return operationTags;
  }
}

module.exports = { BaseAnalyzer };