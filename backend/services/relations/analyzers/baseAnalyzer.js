// backend/services/relations/analyzers/baseAnalyzer.js
const _ = require('lodash');
const batchService = require('../batchService');
const { fetchOperationTagsForLogs } = require('../../../utils/tagHelpers');

class BaseAnalyzer {
  constructor(batchType) {
    this.batchType = batchType || 'default';
    this.CHUNK_SIZE = 50;
  }

  async analyze(logs) {
    throw new Error('analyze() method must be implemented by subclass');
  }

  async _processBatch(data, processorFn) {
    if (!data || data.length === 0) {
      console.log(`No data to process for ${this.batchType}`);
      return 0;
    }

    console.log(`Processing ${data.length} items for ${this.batchType}`);
    const chunks = _.chunk(data, this.CHUNK_SIZE);

    // Process each chunk directly in parallel — each chunk is a self-contained unit
    // and the batch service's single-processor-per-type design doesn't compose with
    // multiple _processBatch calls on the same batchType within one analyze() run.
    await Promise.all(
      chunks.map(async chunk => {
        try {
          await processorFn(chunk);
        } catch (error) {
          console.error(`Error processing batch for ${this.batchType}:`, error);
        }
      })
    );

    return data.length;
  }

  _extractFromLogs(logs, options = {}) {
    const {
      filter = () => true,
      groupBy = null,
      mapFn = item => item,
      sortBy = null,
      deduplicate = false,
      deduplicateBy = null
    } = options;

    const filteredLogs = logs.filter(filter);
    if (filteredLogs.length === 0) return [];

    let processed = filteredLogs;
    if (groupBy) {
      processed = _.chain(filteredLogs).groupBy(groupBy).map(mapFn).value();
    }
    if (sortBy) processed = _.sortBy(processed, sortBy);
    if (deduplicate) {
      processed = deduplicateBy ? _.uniqBy(processed, deduplicateBy) : _.uniq(processed);
    }

    return processed;
  }

  async _fetchOperationTags(logIds) {
    return fetchOperationTagsForLogs(logIds);
  }

  async _getOperationTagsWithFallback(logId, operationTagsMap) {
    let operationTags = operationTagsMap.get(logId);
    if (!operationTags && logId) {
      const freshTags = await this._fetchOperationTags([logId]);
      operationTags = freshTags.get(logId) || [];
    } else if (!operationTags) {
      operationTags = [];
    }
    return operationTags;
  }
}

module.exports = { BaseAnalyzer };
