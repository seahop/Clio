// backend/utils/export/formatter.js

/**
 * Format a field value for CSV export
 * @param {*} value - The field value
 * @param {String} field - Field name
 * @returns {String} Formatted value
 */
const formatValue = (value, field) => {
    // Handle null values
    if (value === null || value === undefined) {
      return '';
    }
    
    // Handle timestamp fields
    if (field === 'timestamp' && value) {
      return `"${new Date(value).toISOString()}"`;
    }
    
    // Convert to string, escape quotes, and wrap in quotes
    const valueStr = String(value).replace(/"/g, '""');
    return `"${valueStr}"`;
  };
  
  /**
   * Format file size in human-readable format
   * @param {Number} bytes - Size in bytes 
   * @returns {String} Formatted size
   */
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };
  
  /**
   * Format date for display
   * @param {Date|String} date - Date to format
   * @returns {String} Formatted date string
   */
  const formatDate = (date) => {
    if (!date) return '';
    try {
      return new Date(date).toLocaleString();
    } catch (error) {
      console.error('Date formatting error:', error);
      return '';
    }
  };
  
  /**
   * Get status color class for HTML
   * @param {String} status - Status string
   * @returns {String} CSS class
   */
  const getStatusColorClass = (status) => {
    if (!status) return '';
    
    const statusMap = {
      'ON_DISK': 'status-on-disk',
      'IN_MEMORY': 'status-in-memory',
      'ENCRYPTED': 'status-encrypted',
      'REMOVED': 'status-removed',
      'CLEANED': 'status-cleaned',
      'DORMANT': 'status-dormant',
      'DETECTED': 'status-detected',
      'UNKNOWN': 'status-unknown'
    };
    
    return statusMap[status] || '';
  };
  
  module.exports = {
    formatValue,
    formatFileSize,
    formatDate,
    getStatusColorClass
  };