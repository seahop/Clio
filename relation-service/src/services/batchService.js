// relation-service/src/services/batchService.js

/**
 * Enhanced BatchService with parallel processing capabilities
 * Handles batched operations for improved performance with large datasets
 */
class BatchService {
    constructor(options = {}) {
      this.batchSize = options.batchSize || 100;
      this.flushInterval = options.flushInterval || 5000; // 5 seconds
      this.maxConcurrentBatches = options.maxConcurrentBatches || 4; // Limit concurrent processing
      this.batches = new Map();
      this.timers = new Map();
      this.processing = new Map();
      this.activeBatches = 0; // Track currently processing batches
      this.pendingFlushes = new Map(); // Store pending flush promises
      this.metrics = {
        totalItemsProcessed: 0,
        batchesProcessed: 0,
        processingTimes: []
      };
    }
  
    /**
     * Add an item to the specified batch queue
     * @param {string} batchType - The type of batch (e.g., 'relation', 'fileStatus')
     * @param {any} item - The item to add to the batch
     * @param {function} processor - Function to process the batch when ready
     */
    addToBatch(batchType, item, processor) {
      // Initialize batch if it doesn't exist
      if (!this.batches.has(batchType)) {
        this.batches.set(batchType, []);
      }
  
      // Add item to batch
      const batch = this.batches.get(batchType);
      
      // Handle both single items and arrays of items
      if (Array.isArray(item)) {
        batch.push(...item);
      } else {
        batch.push(item);
      }
  
      // Set processor function if not already set
      if (!this.processing.has(batchType)) {
        this.processing.set(batchType, processor);
      }
  
      // Set or reset flush timer
      this._resetFlushTimer(batchType);
  
      // Process immediately if batch is full
      if (batch.length >= this.batchSize) {
        this.flushBatch(batchType);
      }
      
      return batch.length; // Return current batch size
    }
  
    /**
     * Force process a specific batch type
     * @param {string} batchType - The batch type to flush
     * @returns {Promise} - Resolves when batch processing is complete
     */
    async flushBatch(batchType) {
      // Check if there's already a pending flush for this batch type
      if (this.pendingFlushes.has(batchType)) {
        return this.pendingFlushes.get(batchType);
      }
      
      if (!this.batches.has(batchType) || this.batches.get(batchType).length === 0) {
        return Promise.resolve();
      }
  
      // Clear the timer if it exists
      if (this.timers.has(batchType)) {
        clearTimeout(this.timers.get(batchType));
        this.timers.delete(batchType);
      }
  
      // Create flush promise and store it
      const flushPromise = new Promise(async (resolve) => {
        // Wait if too many batches are already processing
        while (this.activeBatches >= this.maxConcurrentBatches) {
          await new Promise(r => setTimeout(r, 100));
        }
        
        this.activeBatches++;
        
        try {
          const batch = this.batches.get(batchType);
          const processor = this.processing.get(batchType);
          const batchSize = batch.length;
          
          // Reset the batch immediately to allow new items to be added
          this.batches.set(batchType, []);
      
          if (processor && typeof processor === 'function') {
            try {
              // Process the batch
              console.log(`Processing batch of ${batchSize} items for type: ${batchType}`);
              
              const startTime = Date.now();
              await processor(batch);
              const endTime = Date.now();
              
              // Record metrics
              this.metrics.totalItemsProcessed += batchSize;
              this.metrics.batchesProcessed++;
              this.metrics.processingTimes.push(endTime - startTime);
              
              // Keep only the last 100 processing times
              if (this.metrics.processingTimes.length > 100) {
                this.metrics.processingTimes.shift();
              }
              
              console.log(`Completed batch processing for ${batchType} in ${endTime - startTime}ms`);
            } catch (error) {
              console.error(`Error processing batch for ${batchType}:`, error);
            }
          } else {
            console.warn(`No processor function for batch type: ${batchType}`);
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
  
    /**
     * Force process all pending batches
     * @returns {Promise} - Resolves when all batches are processed
     */
    async flushAllBatches() {
      const batchTypes = Array.from(this.batches.keys());
      
      // Start all flushes in parallel but control concurrency internally
      const flushPromises = batchTypes.map(batchType => this.flushBatch(batchType));
      
      // Wait for all flushes to complete
      await Promise.all(flushPromises);
      console.log(`All ${batchTypes.length} batch types flushed successfully`);
      
      return {
        batchCount: batchTypes.length,
        metrics: this.getMetrics()
      };
    }
  
    /**
     * Reset the flush timer for a batch type
     * @private
     */
    _resetFlushTimer(batchType) {
      // Clear existing timer
      if (this.timers.has(batchType)) {
        clearTimeout(this.timers.get(batchType));
      }
  
      // Set new timer
      const timer = setTimeout(() => {
        this.flushBatch(batchType);
      }, this.flushInterval);
  
      this.timers.set(batchType, timer);
    }
    
    /**
     * Get processing metrics
     * @returns {Object} - Current batch processing metrics
     */
    getMetrics() {
      const avgProcessingTime = this.metrics.processingTimes.length > 0
        ? this.metrics.processingTimes.reduce((sum, time) => sum + time, 0) / this.metrics.processingTimes.length
        : 0;
        
      return {
        totalItemsProcessed: this.metrics.totalItemsProcessed,
        batchesProcessed: this.metrics.batchesProcessed,
        avgProcessingTime: Math.round(avgProcessingTime),
        activeBatches: this.activeBatches,
        pendingBatches: this.pendingFlushes.size,
        batchTypes: Array.from(this.batches.keys()).map(type => ({
          type,
          queueSize: this.batches.get(type).length,
          isProcessing: this.pendingFlushes.has(type)
        }))
      };
    }
  
    /**
     * Cleanup timers and resources
     */
    shutdown() {
      // Clear all timers
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      this.timers.clear();
      
      // Log final metrics
      console.log('BatchService shutdown. Final metrics:', this.getMetrics());
    }
  }
  
  // Create singleton instance with customizable options
  const batchService = new BatchService({
    batchSize: 100,
    flushInterval: 5000,
    maxConcurrentBatches: 4
  });
  
  module.exports = batchService;