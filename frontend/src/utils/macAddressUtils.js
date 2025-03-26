// frontend/src/utils/macAddressUtils.js

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
  
  // Limit to 12 hex characters max (6 bytes)
  const limitedMac = cleanMac.slice(0, 12);
  
  // Format with dashes
  return limitedMac.match(/.{1,2}/g)?.join('-') || limitedMac;
};

/**
 * Auto-format MAC address input as user types
 * @param {Event} event - The input change event
 */
export const handleMacAddressInput = (event) => {
  const input = event.target;
  const cursorPosition = input.selectionStart;
  const oldValue = input.value;
  
  // Only keep hexadecimal characters
  let value = input.value.toUpperCase().replace(/[^0-9A-F]/g, '');
  
  // Limit to maximum of 12 hex characters (6 bytes)
  if (value.length > 12) {
    value = value.slice(0, 12);
  }
  
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
  
  // Calculate new cursor position - accounting for added/removed dashes
  if (oldValue !== input.value) {
    // Count dashes before cursor in old value
    const oldDashesBeforeCursor = (oldValue.slice(0, cursorPosition).match(/-/g) || []).length;
    
    // Count hex chars before cursor in old value (excluding dashes)
    const oldHexBeforeCursor = cursorPosition - oldDashesBeforeCursor;
    
    // Calculate new cursor position based on hex characters (every 2 chars + 1 dash)
    const newPosition = Math.floor(oldHexBeforeCursor / 2) + oldHexBeforeCursor;
    
    // Set cursor position, ensuring it's within bounds
    setTimeout(() => {
      const maxPos = input.value.length;
      input.setSelectionRange(Math.min(newPosition, maxPos), Math.min(newPosition, maxPos));
    }, 0);
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

/**
 * Apply the MAC address input mask to an input element
 * @param {HTMLInputElement} inputElement - The input element to attach the mask to
 * @returns {function} - Function to remove the event listeners
 */
export const applyMacAddressMask = (inputElement) => {
  if (!inputElement) return () => {};
  
  const handleInput = (e) => handleMacAddressInput(e);
  const handlePaste = (e) => {
    // Prevent default paste
    e.preventDefault();
    
    // Get clipboard text
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('text');
    
    // Process the pasted text
    const cleanMac = pastedText.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
    
    // Format with dashes and set value
    if (cleanMac.length > 0) {
      const formatted = cleanMac.match(/.{1,2}/g)?.join('-') || cleanMac;
      inputElement.value = formatted;
      
      // Trigger change event
      const event = new Event('input', { bubbles: true });
      inputElement.dispatchEvent(event);
    }
  };
  
  // Attach event listeners
  inputElement.addEventListener('input', handleInput);
  inputElement.addEventListener('paste', handlePaste);
  
  // Return function to cleanup listeners
  return () => {
    inputElement.removeEventListener('input', handleInput);
    inputElement.removeEventListener('paste', handlePaste);
  };
};