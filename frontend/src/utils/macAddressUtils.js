/**
 * MAC Address Input Validation
 * 
 * This utility provides functions to validate and format MAC addresses
 * for consistent display and storage in the database.
 */

/**
 * Validate if a string is a properly formatted MAC address
 * @param {string} mac - The MAC address to validate
 * @returns {boolean} - Whether the MAC address is valid
 */
export const isValidMacAddress = (mac) => {
    if (!mac) return false;
    
    // Check for correct dash format: XX-XX-XX-XX-XX-XX
    const dashFormat = /^([0-9A-Fa-f]{2}-){5}([0-9A-Fa-f]{2})$/;
    
    // For clean validation, only accept the dash format
    return dashFormat.test(mac);
  };
  
  /**
   * Format a MAC address with dashes
   * @param {string} mac - The MAC address to format
   * @returns {string} - The formatted MAC address with dashes
   */
  export const formatMacAddress = (mac) => {
    if (!mac) return '';
    
    // Remove any separators and convert to uppercase
    const cleanMac = mac.toUpperCase().replace(/[:-]/g, '');
    
    // Format with dashes
    return cleanMac.match(/.{1,2}/g)?.join('-') || cleanMac;
  };
  
  /**
   * Auto-format MAC address input as user types
   * @param {Event} event - The input change event
   */
  export const handleMacAddressInput = (event) => {
    const input = event.target;
    let value = input.value.toUpperCase().replace(/[^0-9A-F]/g, '');
    
    // Format with dashes as user types
    if (value.length > 0) {
      const parts = [];
      for (let i = 0; i < value.length; i += 2) {
        parts.push(value.substr(i, 2));
      }
      input.value = parts.join('-');
    } else {
      input.value = value;
    }
  };
  
  /**
   * Validate a MAC address input and provide feedback
   * @param {string} mac - The MAC address to validate
   * @returns {Object} - Validation result with status and message
   */
  export const validateMacAddress = (mac) => {
    if (!mac) {
      return { 
        valid: false, 
        message: 'MAC address is required' 
      };
    }
    
    if (!isValidMacAddress(mac)) {
      return { 
        valid: false, 
        message: 'Please enter a valid MAC address (format: XX-XX-XX-XX-XX-XX with dashes)' 
      };
    }
    
    return { 
      valid: true, 
      message: 'Valid MAC address' 
    };
  };