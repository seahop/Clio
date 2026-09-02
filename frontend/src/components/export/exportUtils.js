// frontend/src/components/export/exportUtils.js
import { formatUTC } from '../../utils/dateUtils';

/**
 * Format file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
export const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };
  
  /**
   * Format date for display
   * @param {string} dateString - Date string to format
   * @returns {string} - Formatted date string
   */
  export const formatDate = (dateString) => {
    // Return a clear message for undefined/null dates
    if (!dateString) return 'Unknown date';

    // formatUTC falls back to the raw value for unparseable dates
    return formatUTC(dateString);
  };
  
  /**
   * Create a file URL for download
   * @param {string} filename - The name of the file
   * @returns {string} - URL to the file
   */
  export const getFileUrl = (filename) => {
    return `/exports/${filename}`;
  };
  
  /**
   * Determine if an export file contains sensitive data
   * @param {Object} file - Export file object
   * @returns {boolean} - True if potentially contains sensitive data
   */
  export const containsSensitiveData = (file) => {
    return file.type === 'decrypted' || 
      (file.name && file.name.includes('decrypted')) || 
      (file.metadata && file.metadata.includesDecryptedData);
  };