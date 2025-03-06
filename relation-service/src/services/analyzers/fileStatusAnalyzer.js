// relation-service/src/services/analyzers/fileStatusAnalyzer.js
const _ = require('lodash');
const FileStatusService = require('../fileStatusService');
const { BaseAnalyzer } = require('./baseAnalyzer');

/**
 * Analyzer for file status tracking
 * Processes logs with filenames and tracks their status changes
 */
class FileStatusAnalyzer extends BaseAnalyzer {
  constructor() {
    super('fileStatuses');
  }

  /**
   * Analyze logs for file status updates
   * @param {Array} logs - Log entries to analyze
   * @returns {Promise<number>} Number of files processed
   */
  async analyze(logs) {
    try {
      console.log('Processing file statuses with parallel execution...');
      
      // Filter logs with filenames
      const filenameLogs = this._extractFileLogs(logs);
      
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
   * Extract logs with filenames
   * @param {Array} logs - Log entries
   * @returns {Array} Logs with valid filenames
   * @private
   */
  _extractFileLogs(logs) {
    return logs.filter(log => log.filename && log.filename.trim() !== '');
  }
}

module.exports = { FileStatusAnalyzer };