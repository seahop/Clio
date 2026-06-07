// backend/services/relations/analyzers/fileStatusAnalyzer.js
const _ = require('lodash');
const FileStatusService = require('../fileStatusService');
const { BaseAnalyzer } = require('./baseAnalyzer');

class FileStatusAnalyzer extends BaseAnalyzer {
  constructor() {
    super('fileStatuses');
  }

  async analyze(logs) {
    try {
      console.log('Processing file statuses with parallel execution...');

      const filenameLogs = this._extractFileLogs(logs);

      if (filenameLogs.length === 0) {
        console.log('No logs with filenames found to process');
        return 0;
      }

      console.log(`Found ${filenameLogs.length} logs with filenames to process in parallel`);

      const getFileKey = (log) => `${log.filename}|${log.hostname || 'none'}|${log.internal_ip || 'none'}`;
      const logsByCompositeKey = _.groupBy(filenameLogs, getFileKey);

      const results = await Promise.all(
        Object.entries(logsByCompositeKey).map(async ([fileKey, fileLogs]) => {
          try {
            const sortedLogs = _.sortBy(fileLogs, 'timestamp');
            await FileStatusService.processLogEntries(sortedLogs);
            const filename = fileKey.split('|')[0];
            return { filename, success: true, count: sortedLogs.length };
          } catch (error) {
            const filename = fileKey.split('|')[0];
            console.error(`Error processing file status for ${filename}:`, error);
            return { filename, success: false, error: error.message };
          }
        })
      );

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      console.log(`Processed ${successCount} files successfully in parallel (${failCount} failures)`);
      return successCount;
    } catch (error) {
      console.error('Error in parallel file status processing:', error);
      throw error;
    }
  }

  _extractFileLogs(logs) {
    return logs.filter(log => log.filename && log.filename.trim() !== '');
  }
}

module.exports = { FileStatusAnalyzer };
