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
  
  // For fields that need to preserve special characters
  if (PRESERVE_SPECIAL_CHARS_FIELDS.includes(fieldName)) {
    // Only perform minimal sanitization to block XSS but preserve other characters
    return xss(str, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
      escapeHtml: function(html) {
        // Custom escaper that preserves backslashes
        return html
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
      }
    });
  }
  
  // First pass: Basic sanitization for other fields
  let sanitized = str
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .replace(/on\w+=/gi, '') // Remove inline event handlers
    .trim();
  
  // Second pass: Use xss library for thorough sanitization
  sanitized = xss(sanitized, {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'xml'],
    css: false
  });

  return sanitized;
};

/**
 * Validates input based on field-specific rules
 * @param {string} value - The value to validate
 * @param {string} field - The field name
 * @returns {boolean} - Whether validation passed
 */
const validateInput = (value, field) => {
  if (!value) return true;
  
  // Fields that should allow any characters
  if (PRESERVE_SPECIAL_CHARS_FIELDS.includes(field)) {
    // Just check length constraints instead of character constraints
    const maxLengths = {
      command: 150,
      notes: 254,
      filename: 100,
      secrets: 150
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
    hostname: /^[a-zA-Z0-9][a-zA-Z0-9-_.]{0,73}[a-zA-Z0-9]$/,
    domain: /^[a-zA-Z0-9][a-zA-Z0-9-_.]{0,73}[a-zA-Z0-9]$/,
    username: /^[a-zA-Z0-9_-]{1,75}$/,
    status: /^[a-zA-Z0-9_-]{1,75}$/
  };

  if (constraints[field]) {
    return constraints[field].test(value);
  }

  return true;
};

/**
 * Sanitizes an entire object with field-specific handling
 * @param {object} obj - The object to sanitize
 * @returns {object} - The sanitized object
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return {};

  return Object.keys(obj).reduce((acc, key) => {
    const value = obj[key];
    
    if (typeof value === 'string') {
      // Pass the field name for specialized handling
      acc[key] = sanitizeString(value, key);
    } else if (Array.isArray(value)) {
      acc[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      acc[key] = sanitizeObject(value);
    } else {
      acc[key] = value;
    }
    
    return acc;
  }, {});
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
      filename: logData.filename
    },
    sanitized: {
      command: sanitizedData.command ? `${sanitizedData.command.substring(0, 20)}${sanitizedData.command.length > 20 ? '...' : ''}` : null,
      notes: sanitizedData.notes ? `${sanitizedData.notes.substring(0, 20)}${sanitizedData.notes.length > 20 ? '...' : ''}` : null,
      filename: sanitizedData.filename
    }
  });

  return sanitizedData;
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeLogData,
  validateInput,
  redactSensitiveData
};