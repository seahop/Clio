// relation-service/src/services/analyzers/baseAnalyzer.js
const _ = require('lodash');
const batchService = require('../batchService');

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
}

module.exports = { BaseAnalyzer };