// backend/services/relations/batchService.js
const _ = require('lodash');
const FileStatusModel = require('../../models/fileStatus');

class BatchService {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000;
    this.maxConcurrentBatches = options.maxConcurrentBatches || 4;
    this.batches = new Map();
    this.timers = new Map();
    this.processing = new Map();
    this.activeBatches = 0;
    this.pendingFlushes = new Map();
    this.metrics = { totalItemsProcessed: 0, batchesProcessed: 0, processingTimes: [] };
  }

  addToBatch(batchType, item, processor) {
    if (!this.batches.has(batchType)) this.batches.set(batchType, []);

    const batch = this.batches.get(batchType);
    if (Array.isArray(item)) batch.push(...item);
    else batch.push(item);

    if (!this.processing.has(batchType)) {
      this.processing.set(batchType, batchType === 'fileStatus'
        ? (b) => this._processFileStatusBatch(batchType, b)
        : processor);
    }

    this._resetFlushTimer(batchType);
    if (batch.length >= this.batchSize) this.flushBatch(batchType);

    return batch.length;
  }

  async flushBatch(batchType) {
    if (this.pendingFlushes.has(batchType)) return this.pendingFlushes.get(batchType);
    if (!this.batches.has(batchType) || this.batches.get(batchType).length === 0) return Promise.resolve();

    if (this.timers.has(batchType)) {
      clearTimeout(this.timers.get(batchType));
      this.timers.delete(batchType);
    }

    const flushPromise = new Promise(async (resolve) => {
      while (this.activeBatches >= this.maxConcurrentBatches) {
        await new Promise(r => setTimeout(r, 100));
      }
      this.activeBatches++;

      try {
        const batch = this.batches.get(batchType);
        const processor = this.processing.get(batchType);
        const batchSize = batch.length;
        this.batches.set(batchType, []);

        if (processor && typeof processor === 'function') {
          try {
            console.log(`Processing batch of ${batchSize} items for type: ${batchType}`);
            const startTime = Date.now();
            await processor(batch);
            const endTime = Date.now();
            this.metrics.totalItemsProcessed += batchSize;
            this.metrics.batchesProcessed++;
            this.metrics.processingTimes.push(endTime - startTime);
            if (this.metrics.processingTimes.length > 100) this.metrics.processingTimes.shift();
            console.log(`Completed batch processing for ${batchType} in ${endTime - startTime}ms`);
          } catch (error) {
            console.error(`Error processing batch for ${batchType}:`, error);
          }
        }
      } finally {
        this.activeBatches--;
        this.pendingFlushes.delete(batchType);
        resolve();
      }
    });

    this.pendingFlushes.set(batchType, flushPromise);
    return flushPromise;
  }

  async flushAllBatches() {
    const batchTypes = Array.from(this.batches.keys());
    await Promise.all(batchTypes.map(batchType => this.flushBatch(batchType)));
    console.log(`All ${batchTypes.length} batch types flushed successfully`);
    return { batchCount: batchTypes.length, metrics: this.getMetrics() };
  }

  _resetFlushTimer(batchType) {
    if (this.timers.has(batchType)) clearTimeout(this.timers.get(batchType));
    const timer = setTimeout(() => this.flushBatch(batchType), this.flushInterval);
    this.timers.set(batchType, timer);
  }

  getMetrics() {
    const avgProcessingTime = this.metrics.processingTimes.length > 0
      ? this.metrics.processingTimes.reduce((sum, t) => sum + t, 0) / this.metrics.processingTimes.length
      : 0;
    return {
      totalItemsProcessed: this.metrics.totalItemsProcessed,
      batchesProcessed: this.metrics.batchesProcessed,
      avgProcessingTime: Math.round(avgProcessingTime),
      activeBatches: this.activeBatches,
      pendingBatches: this.pendingFlushes.size,
      batchTypes: Array.from(this.batches.keys()).map(type => ({
        type, queueSize: this.batches.get(type).length, isProcessing: this.pendingFlushes.has(type)
      }))
    };
  }

  _generateFileKey(fileData) {
    return `${fileData.filename}|${fileData.hostname || 'none'}|${fileData.internal_ip || 'none'}`;
  }

  async _processFileStatusBatch(batchType, batch) {
    console.log(`Processing ${batch.length} file status updates in batch`);
    const batchByKey = {};
    batch.forEach(item => {
      const key = this._generateFileKey(item);
      if (!batchByKey[key]) batchByKey[key] = [];
      batchByKey[key].push(item);
    });

    for (const [key, items] of Object.entries(batchByKey)) {
      try {
        const sortedItems = _.sortBy(items, 'timestamp');
        const latestItem = sortedItems[sortedItems.length - 1];
        await FileStatusModel.upsertFileStatus(latestItem);
        for (const item of sortedItems) {
          await FileStatusModel.addStatusHistory({
            filename: item.filename, status: item.status || 'UNKNOWN',
            hostname: item.hostname, internal_ip: item.internal_ip,
            external_ip: item.external_ip, username: item.username,
            analyst: item.analyst || 'system', timestamp: item.timestamp
          });
        }
      } catch (error) {
        console.error(`Error processing file status batch for ${key}:`, error);
      }
    }

    FileStatusModel.clearCache();
  }

  shutdown() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    console.log('BatchService shutdown. Final metrics:', this.getMetrics());
  }
}

const batchService = new BatchService({ batchSize: 100, flushInterval: 5000, maxConcurrentBatches: 4 });
module.exports = batchService;
