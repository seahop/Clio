// frontend/src/components/LogCard/cardUtils.js

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 * @returns {string} - Formatted date string
 */
export const formatDate = (timestamp) => {
    if (!timestamp) return '';
    
    // Create a date object from the timestamp
    const date = new Date(timestamp);
    
    // Format the date to show in a consistent way with Zulu/UTC indicator
    // Format: YYYY-MM-DD HH:MM:SS Z
    return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  };
  
  /**
   * Get the CSS color class for different status values
   * @param {string} status - Status value
   * @returns {string} - CSS class for the status color
   */
  export const getStatusColorClass = (status) => {
    const statusColors = {
      'ON_DISK': 'text-yellow-300',
      'IN_MEMORY': 'text-blue-300',
      'ENCRYPTED': 'text-purple-300',
      'REMOVED': 'text-red-300',
      'CLEANED': 'text-green-300',
      'DORMANT': 'text-gray-300',
      'DETECTED': 'text-orange-300',
      'UNKNOWN': 'text-gray-400'
    };
    return statusColors[status] || 'text-gray-400';
  };