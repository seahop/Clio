// frontend/src/utils/sanitize.js
import { formatMacAddress, isValidMacAddress } from './macAddressUtils';

// Define which fields should preserve special characters
const PRESERVE_SPECIAL_CHARS_FIELDS = ['command', 'notes', 'filename', 'secrets'];

/**
 * Sanitizes a string with special handling for specific fields
 * @param {string} str - The string to sanitize
 * @param {string} fieldName - Optional field name for specialized handling
 * @returns {string} - The sanitized string
 */
export const sanitizeString = (str, fieldName = '') => {
  if (typeof str !== 'string') return '';
  
  try {
    // For fields that need to preserve special characters - particularly command and notes
    if (PRESERVE_SPECIAL_CHARS_FIELDS.includes(fieldName)) {
      // Use enhanced sanitization approach for command-like fields
      return sanitizeCommandField(str);
    }
    
    // For MAC address field - use the dedicated formatter
    if (fieldName === 'mac_address' && str) {
      return formatMacAddress(str);
    }
    
    // Standard sanitization for other fields (enhanced)
    let sanitized = str.replace(/<[^>]*>/g, '');
    
    // Remove Unicode control characters
    sanitized = sanitized.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Replace potentially dangerous characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/\\/g, '&#x5C;')
      .replace(/`/g, '&#96;');

    return sanitized;
  } catch (error) {
    console.error(`Sanitization error for ${fieldName}:`, error);
    // Fallback to basic sanitization
    return String(str).replace(/[<>]/g, '');
  }
};

/**
 * Enhanced sanitization for command fields and other special content
 * Preserves important command syntax while removing dangerous elements
 * @param {string} str - The string to sanitize
 * @returns {string} - The sanitized string
 */
export const sanitizeCommandField = (str) => {
  if (!str) return '';
  
  try {
    // Remove potentially dangerous HTML/script tags but preserve command syntax
    let sanitized = str.replace(/<[^>]*>/g, '');
    
    // Block dangerous patterns while preserving command syntax
    sanitized = sanitized
      .replace(/<script/gi, '&lt;script')
      .replace(/javascript:/gi, 'javascript&#58;')
      .replace(/data:/gi, 'data&#58;')
      .replace(/\bon\w+=/gi, 'data-on-')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control characters
    
    // Only escape < and > characters since they could form HTML tags
    sanitized = sanitized
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    return sanitized;
  } catch (error) {
    console.error('Command field sanitization error:', error);
    // Fallback to basic sanitization
    return String(str).replace(/[<>]/g, '');
  }
};

/**
 * Validate input based on field-specific rules
 * @param {string} value - The value to validate
 * @param {string} field - The field name
 * @returns {boolean} - Whether validation passed
 */
export const validateInput = (value, field) => {
  if (!value) return true;
  
  try {
    // Use dedicated MAC address validation for mac_address field
    if (field === 'mac_address') {
      return isValidMacAddress(value);
    }
    
    // Fields that should allow any characters
    if (PRESERVE_SPECIAL_CHARS_FIELDS.includes(field)) {
      // Just check length constraints
      const maxLengths = {
        command: 254,
        notes: 254,
        filename: 254,
        secrets: 254
      };
      
      if (maxLengths[field] && value.length > maxLengths[field]) {
        return false;
      }
      
      return true;
    }
    
    switch (field) {
      case 'hostname':
      case 'domain':
        // More strict hostname/domain validation
        return /^[a-zA-Z0-9][a-zA-Z0-9-_.]{0,73}[a-zA-Z0-9]$/.test(value);
      
      case 'username':
        return /^[a-zA-Z0-9_\\/-]+$/.test(value);
      
      case 'filename':
        return /^[a-zA-Z0-9._-]+$/.test(value);
        
      case 'internal_ip':
      case 'external_ip':
        // Both IPv4 and IPv6 validation
        return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}$/.test(value);
        
      case 'hash_algorithm':
        return /^[A-Za-z0-9_-]{1,20}$/.test(value);
        
      case 'hash_value':
        return /^[A-Za-z0-9_+/=.-]{1,128}$/.test(value);
        
      case 'pid':
        // PIDs are typically numeric values
        return /^\d{1,10}$/.test(value);
      
      default:
        return true;
    }
  } catch (error) {
    console.error(`Validation error for field ${field}:`, error);
    return false; // Fail closed - if validation throws an error, return false
  }
};

/**
 * Sanitize an entire log data object
 * @param {Object} logData - The log data to sanitize
 * @returns {Object} - Sanitized log data
 */
export const sanitizeLogData = (logData) => {
  try {
    // Ensure we have an object to work with
    if (!logData || typeof logData !== 'object') {
      return {};
    }
    
    return {
      ...logData,
      internal_ip: logData.internal_ip ? sanitizeString(logData.internal_ip) : '',
      external_ip: logData.external_ip ? sanitizeString(logData.external_ip) : '',
      mac_address: logData.mac_address ? sanitizeString(logData.mac_address, 'mac_address') : '', 
      hostname: logData.hostname ? sanitizeString(logData.hostname) : '',
      domain: logData.domain ? sanitizeString(logData.domain) : '',
      username: logData.username ? sanitizeString(logData.username) : '',
      command: logData.command ? sanitizeString(logData.command, 'command') : '',
      notes: logData.notes ? sanitizeString(logData.notes, 'notes') : '',
      filename: logData.filename ? sanitizeString(logData.filename, 'filename') : '',
      status: logData.status ? sanitizeString(logData.status) : '',
      hash_algorithm: logData.hash_algorithm ? sanitizeString(logData.hash_algorithm) : '',
      hash_value: logData.hash_value ? sanitizeString(logData.hash_value) : '',
      pid: logData.pid ? sanitizeString(logData.pid) : '',
      secrets: logData.secrets ? sanitizeString(logData.secrets, 'secrets') : ''
    };
  } catch (error) {
    console.error('Error sanitizing log data:', error);
    // Return whatever we started with as fallback
    return logData || {};
  }
};

/**
 * Comprehensive validation for log entries before submission
 * @param {Object} logData - The log data to validate
 * @returns {Object} Validation result with isValid flag and errors
 */
export const validateLogEntry = (logData) => {
  const errors = {};
  
  // Skip validation for empty or non-object data
  if (!logData || typeof logData !== 'object') {
    return { isValid: false, errors: { general: 'Invalid log data' } };
  }
  
  try {
    // Validate each field
    Object.entries(logData).forEach(([field, value]) => {
      if (value && !validateInput(value, field)) {
        errors[field] = `Invalid ${field} format`;
      }
    });
    
    // Check for field length limits
    const lengthLimits = {
      internal_ip: 45,
      external_ip: 45,
      hostname: 75,
      domain: 75,
      username: 75,
      command: 254,
      notes: 254,
      filename: 254,
      status: 75,
      secrets: 254
    };
    
    Object.entries(lengthLimits).forEach(([field, limit]) => {
      if (logData[field] && logData[field].length > limit) {
        errors[field] = `${field} must not exceed ${limit} characters`;
      }
    });
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  } catch (error) {
    console.error('Log entry validation error:', error);
    return {
      isValid: false,
      errors: { 
        general: 'Validation error occurred, please check your input' 
      }
    };
  }
};

// Define maximum input lengths for UI components to use
export const MAX_FIELD_LENGTHS = {
  internal_ip: 45,
  external_ip: 45,
  mac_address: 17,
  hostname: 75,
  domain: 75,
  username: 75,
  command: 254,
  notes: 254,
  filename: 254,
  status: 75,
  hash_algorithm: 20,
  hash_value: 128,
  pid: 20,
  secrets: 254,
  analyst: 100
};