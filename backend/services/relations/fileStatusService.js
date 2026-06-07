// backend/services/relations/fileStatusService.js
const FileStatusModel = require('../../models/fileStatus');
const { fetchOperationTagsForLogs } = require('../../utils/tagHelpers');
const _ = require('lodash');

const redactSensitiveData = (data, fieldsToRedact = ['secrets']) => {
  if (typeof data !== 'object' || data === null) return data;
  if (Array.isArray(data)) return data.map(item => redactSensitiveData(item, fieldsToRedact));
  return Object.keys(data).reduce((redacted, key) => {
    if (fieldsToRedact.includes(key)) {
      redacted[key] = data[key] ? '[REDACTED]' : null;
    } else if (typeof data[key] === 'object' && data[key] !== null) {
      redacted[key] = redactSensitiveData(data[key], fieldsToRedact);
    } else {
      redacted[key] = data[key];
    }
    return redacted;
  }, {});
};

class FileStatusService {
  static async processLogEntries(logs) {
    try {
      console.log(`Processing ${logs.length} log entries for file status tracking`);
      let filesUpdated = 0;

      const logIds = logs.map(log => log.id).filter(id => id);
      const operationTagsMap = await fetchOperationTagsForLogs(logIds);

      for (const log of logs) {
        if (!log.filename || log.filename.trim() === '') continue;

        try {
          const operationTags = operationTagsMap.get(log.id) || [];

          const existingFile = await FileStatusModel.getFileByName(log.filename, log.hostname, log.internal_ip);
          const previousStatus = existingFile?.status || null;

          await FileStatusModel.upsertFileStatus({
            filename: log.filename,
            status: log.status || 'UNKNOWN',
            hostname: log.hostname,
            internal_ip: log.internal_ip,
            external_ip: log.external_ip,
            username: log.username,
            analyst: log.analyst,
            hash_algorithm: log.hash_algorithm,
            hash_value: log.hash_value,
            timestamp: log.timestamp || new Date(),
            metadata: { domain: log.domain, command_type: this.categorizeCommand(log.command) },
            operation_tags: operationTags,
            source_log_ids: log.id ? [log.id] : []
          });

          await FileStatusModel.addStatusHistory({
            filename: log.filename,
            status: log.status || 'UNKNOWN',
            previous_status: previousStatus,
            hostname: log.hostname,
            internal_ip: log.internal_ip,
            external_ip: log.external_ip,
            username: log.username,
            analyst: log.analyst,
            notes: log.notes,
            command: log.command,
            secrets: log.secrets ? '[REDACTED]' : null,
            hash_algorithm: log.hash_algorithm,
            hash_value: log.hash_value,
            timestamp: log.timestamp || new Date(),
            operation_tags: operationTags
          });

          filesUpdated++;
        } catch (error) {
          console.error(`Error processing file status for ${log.filename}:`, error);
        }
      }

      FileStatusModel.clearCache();
      console.log(`Updated status for ${filesUpdated} files`);
      return filesUpdated;
    } catch (error) {
      console.error('Error processing log entries for file status:', error);
      throw error;
    }
  }

  static categorizeCommand(command) {
    if (!command) return 'unknown';
    command = command.toLowerCase();
    if (command.includes('copy') || command.includes('cp ') || command.includes('scp ') || command.includes('download')) return 'file_transfer';
    if (command.includes('rm ') || command.includes('del ') || command.includes('remove') || command.includes('shred')) return 'file_deletion';
    if (command.includes('chmod') || command.includes('chown') || command.includes('attrib ') || command.includes('cacls')) return 'permission_change';
    if (command.includes('execute') || command.includes('run ') || command.includes('./') || command.includes('start ')) return 'execution';
    if (command.includes('openssl') || command.includes('encrypt') || command.includes('gpg ') || command.includes('cipher')) return 'encryption';
    return 'other';
  }

  static async getAllFileStatuses(operationTagId = null, isAdmin = false) {
    FileStatusModel.clearCache();
    return FileStatusModel.getAllFileStatuses(operationTagId, isAdmin);
  }

  static async getFileStatusesByStatus(status, operationTagId = null, isAdmin = false) {
    return FileStatusModel.getFileStatusesByStatus(status, operationTagId, isAdmin);
  }

  static async getFileByName(filename, hostname = null, internal_ip = null, operationTagId = null, isAdmin = false) {
    const fileData = await FileStatusModel.getFileByName(filename, hostname, internal_ip, operationTagId, isAdmin);
    if (!fileData) return null;
    if (fileData.history && fileData.history.length > 0) {
      fileData.history = fileData.history.map(entry => ({ ...entry, secrets: entry.secrets ? '[REDACTED]' : null }));
    }
    return fileData;
  }

  static async getFilesByName(filename, operationTagId = null, isAdmin = false) {
    const filesData = await FileStatusModel.getFilesByName(filename, operationTagId, isAdmin);
    if (!filesData || filesData.length === 0) return [];
    return filesData.map(fileData => {
      if (fileData.history && fileData.history.length > 0) {
        fileData.history = fileData.history.map(entry => ({ ...entry, secrets: entry.secrets ? '[REDACTED]' : null }));
      }
      return fileData;
    });
  }

  static async getFileStatusStatistics() {
    return FileStatusModel.getFileStatusStatistics();
  }

  static async exportFileHistory(filename) {
    try {
      const fileData = await this.getFileByName(filename);
      if (!fileData) throw new Error(`File ${filename} not found`);
      return { ...fileData, history: fileData.history.map(entry => redactSensitiveData(entry, ['secrets'])) };
    } catch (error) {
      console.error(`Error exporting file history for ${filename}:`, error);
      throw error;
    }
  }
}

module.exports = FileStatusService;
