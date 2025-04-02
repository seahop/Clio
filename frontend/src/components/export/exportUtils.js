// frontend/src/components/export/exportUtils.js

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
    try {
      // Return a clear message for undefined/null dates
      if (!dateString) return 'Unknown date';
  
      // Try to create a proper date object
      const date = new Date(dateString);
      
      // Detect invalid dates (including epoch time around Jan 1, 1970)
      if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
        // If we get a very old date or invalid date, just show the current time
        return new Date().toLocaleString();
      }
      
      // Otherwise return a properly formatted date
      return date.toLocaleString();
    } catch (error) {
      console.error('Date formatting error:', error);
      // Return current time as fallback
      return new Date().toLocaleString();
    }
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