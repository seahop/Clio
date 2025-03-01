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

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  
  // First pass: Basic sanitization
  let sanitized = str
    .replace(/[<>]/g, '') // Remove < and >
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

const validateInput = (value, field) => {
  if (!value) return true;
  
  const constraints = {
    internal_ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}$/,
    external_ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}$/,
    hostname: /^[a-zA-Z0-9][a-zA-Z0-9-_.]{0,73}[a-zA-Z0-9]$/,
    domain: /^[a-zA-Z0-9][a-zA-Z0-9-_.]{0,73}[a-zA-Z0-9]$/,
    username: /^[a-zA-Z0-9_-]{1,75}$/,
    filename: /^[a-zA-Z0-9._-]{1,100}$/,
    status: /^[a-zA-Z0-9_-]{1,75}$/
  };

  if (constraints[field]) {
    return constraints[field].test(value);
  }

  return true;
};

const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return {};

  return Object.keys(obj).reduce((acc, key) => {
    const value = obj[key];
    
    if (typeof value === 'string') {
      acc[key] = sanitizeString(value);
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

  // Additional validation for specific fields
  if (sanitizedData.username) {
    sanitizedData.username = sanitizedData.username.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  // Ensure command and notes don't exceed max length
  if (sanitizedData.command && sanitizedData.command.length > 150) {
    sanitizedData.command = sanitizedData.command.substring(0, 150);
  }
  // Updated notes length limit from 150 to 254 characters
  if (sanitizedData.notes && sanitizedData.notes.length > 254) {
    sanitizedData.notes = sanitizedData.notes.substring(0, 254);
  }

  return sanitizedData;
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeLogData,
  validateInput,
  redactSensitiveData
};