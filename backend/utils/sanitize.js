// backend/utils/sanitize.js
const xss = require('xss');

/**
 * Redacts sensitive fields from objects before logging or displaying
 * @param {Object} obj - The object to redact 
 * @param {Array} fieldsToRedact - Array of field names to redact
 * @returns {Object} A new object with sensitive fields redacted
 */
const redactSensitiveData = (obj, fieldsToRedact = ['secrets', 'password']) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, fieldsToRedact));
  }
  
  return Object.keys(obj).reduce((redacted, key) => {
    // Check if current key should be redacted
    if (fieldsToRedact.includes(key)) {
      // If value exists, replace with redaction notice
      redacted[key] = obj[key] ? '[REDACTED]' : null;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      // Recursively redact objects
      redacted[key] = redactSensitiveData(obj[key], fieldsToRedact);
    } else {
      // Copy non-sensitive values as is
      redacted[key] = obj[key];
    }
    return redacted;
  }, {});
};

// List of fields that should preserve special characters
const PRESERVE_SPECIAL_CHARS_FIELDS = ['command', 'notes', 'filename', 'secrets'];

/**
 * Sanitizes a string with special handling for specific fields
 * @param {string} str - The string to sanitize
 * @param {string} fieldName - Optional field name for specialized handling
 * @returns {string} - The sanitized string
 */
const sanitizeString = (str, fieldName = '') => {
  if (typeof str !== 'string') return '';
  
  try {
    // For fields that need to preserve special characters - particularly command and notes
    if (PRESERVE_SPECIAL_CHARS_FIELDS.includes(fieldName)) {
      // Use enhanced sanitization approach for command-like fields
      return sanitizeCommandField(str);
    }
    
    // Standard sanitization for other fields (enhanced)
    let sanitized = str
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+=/gi, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .trim();
    
    sanitized = xss(sanitized, {
      whiteList: {},
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style', 'xml'],
      css: false
    });

    return sanitized;
  } catch (error) {
    console.error('String sanitization error:', error);
    // Fallback to very basic sanitization on error
    return String(str).replace(/[<>'"&]/g, '');
  }
};

/**
 * Enhanced sanitization for command fields and other special content
 * Preserves important command syntax while removing dangerous elements
 * @param {string} str - The string to sanitize
 * @returns {string} - The sanitized string
 */
const sanitizeCommandField = (str) => {
  if (!str) return '';
  
  try {
    // Remove potentially dangerous character sequences while preserving syntax
    let sanitized = str
      .replace(/<script/gi, '&lt;script')
      .replace(/javascript:/gi, 'javascript&#58;')
      .replace(/data:/gi, 'data&#58;')
      .replace(/\bon\w+=/gi, 'data-on-')  // handle onclick, onload, etc.
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // control chars
    
    // Use a custom escaper that preserves quotes and backslashes
    // but blocks HTML tags formation
    sanitized = xss(sanitized, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
      // Critical change: Use a custom escaper that preserves command syntax
      escapeHtml: function(html) {
        // Only escape < and > for command strings, as these could form HTML tags
        return html
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
    });
    
    return sanitized;
  } catch (error) {
    console.error('Command sanitization error:', error);
    // Fallback to more aggressive sanitization in case of error
    return String(str).replace(/[<>'"&]/g, '');
  }
};

/**
 * Validates input based on field-specific rules
 * @param {string} value - The value to validate
 * @param {string} field - The field name
 * @returns {boolean} - Whether validation passed
 */
const validateInput = (value, field) => {
  if (!value) return true;
  
  try {
    // Fields that should allow any characters
    if (PRESERVE_SPECIAL_CHARS_FIELDS.includes(field)) {
      // Just check length constraints instead of character constraints
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
    
    // For other fields, apply standard constraints
    const constraints = {
      internal_ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}$/,
      external_ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}$/,
      // Standardized on dash format for MAC addresses
      mac_address: /^([0-9A-Fa-f]{2}-){5}([0-9A-Fa-f]{2})$/, 
      hostname: /^[a-zA-Z0-9][a-zA-Z0-9-_.]{0,73}[a-zA-Z0-9]$/,
      domain: /^[a-zA-Z0-9][a-zA-Z0-9-_.]{0,73}[a-zA-Z0-9]$/,
      username: /^[a-zA-Z0-9_-]{1,75}$/,
      status: /^[a-zA-Z0-9_-]{1,75}$/,
      hash_algorithm: /^[A-Za-z0-9_-]{1,20}$/,
      hash_value: /^[A-Za-z0-9_+/=.-]{1,128}$/
    };

    if (constraints[field]) {
      return constraints[field].test(value);
    }

    return true;
  } catch (error) {
    console.error(`Validation error for field ${field}:`, error);
    // Always return false on validation errors to be safe
    return false; 
  }
};

/**
 * Normalizes a MAC address to the standard dash format
 * @param {string} mac - The MAC address to normalize
 * @returns {string} - Normalized MAC address or original string if invalid
 */
const normalizeMacAddress = (mac) => {
  if (!mac || typeof mac !== 'string') return mac;
  
  try {
    // Remove any separators and convert to uppercase
    const cleanMac = mac.toUpperCase().replace(/[:-]/g, '');
    
    // Check if it's a valid MAC address format
    if (!/^[0-9A-F]{12}$/.test(cleanMac)) {
      return mac; // Return original if not valid
    }
    
    // Format with dashes
    return cleanMac.match(/.{1,2}/g).join('-');
  } catch (error) {
    console.error('MAC address normalization error:', error);
    return mac; // Return original on error
  }
};

/**
 * Sanitizes an entire object with field-specific handling
 * @param {object} obj - The object to sanitize
 * @returns {object} - The sanitized object
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return {};

  try {
    return Object.keys(obj).reduce((acc, key) => {
      const value = obj[key];
      
      if (key === 'mac_address' && value) {
        // Always normalize MAC addresses
        acc[key] = normalizeMacAddress(value);
      } else if (typeof value === 'string') {
        // Pass the field name for specialized handling
        acc[key] = sanitizeString(value, key);
      } else if (Array.isArray(value)) {
        acc[key] = value.map(item => 
          typeof item === 'string' ? sanitizeString(item) : 
          typeof item === 'object' ? sanitizeObject(item) : item
        );
      } else if (typeof value === 'object' && value !== null) {
        acc[key] = sanitizeObject(value);
      } else {
        acc[key] = value;
      }
      
      return acc;
    }, {});
  } catch (error) {
    console.error('Object sanitization error:', error);
    // Return a safe empty object on error
    return {};
  }
};

/**
 * Comprehensive validation for log data submission
 * @param {object} logData - The log data to validate
 * @returns {object} - Validation result with isValid flag and errors
 */
const validateLogData = (logData) => {
  const errors = {};
  
  // Check each field against field-specific validation
  Object.entries(logData).forEach(([field, value]) => {
    if (value && !validateInput(value, field)) {
      errors[field] = `Invalid ${field} format`;
    }
  });
  
  // Additional validation for MAC address format if present
  if (logData.mac_address) {
    const normalizedMac = normalizeMacAddress(logData.mac_address);
    if (normalizedMac !== logData.mac_address) {
      // Not an error, just note that it was normalized
      console.log(`MAC address normalized from ${logData.mac_address} to ${normalizedMac}`);
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Sanitizes log data with specialized field handling
 * @param {object} logData - The log data to sanitize
 * @returns {object} - The sanitized log data
 */
const sanitizeLogData = (logData) => {
  if (!logData || typeof logData !== 'object') return {};

  const sanitizedData = {
    ...sanitizeObject(logData),
    // Preserve these fields if they exist
    id: logData.id,
    timestamp: logData.timestamp,
    created_at: logData.created_at,
    updated_at: logData.updated_at
  };

  // Additional validation only for username field
  if (sanitizedData.username) {
    sanitizedData.username = sanitizedData.username.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  // Log what we're processing to help with debugging
  console.log('Sanitized log data:', {
    original: {
      command: logData.command ? `${logData.command.substring(0, 20)}${logData.command.length > 20 ? '...' : ''}` : null,
      notes: logData.notes ? `${logData.notes.substring(0, 20)}${logData.notes.length > 20 ? '...' : ''}` : null,
      filename: logData.filename,
      mac_address: logData.mac_address
    },
    sanitized: {
      command: sanitizedData.command ? `${sanitizedData.command.substring(0, 20)}${sanitizedData.command.length > 20 ? '...' : ''}` : null,
      notes: sanitizedData.notes ? `${sanitizedData.notes.substring(0, 20)}${sanitizedData.notes.length > 20 ? '...' : ''}` : null,
      filename: sanitizedData.filename,
      mac_address: sanitizedData.mac_address
    }
  });

  return sanitizedData;
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeLogData,
  validateInput,
  redactSensitiveData,
  normalizeMacAddress,
  validateLogData,
  sanitizeCommandField
};