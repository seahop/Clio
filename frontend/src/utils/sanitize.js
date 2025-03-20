// frontend/src/utils/sanitize.js

// Define which fields should preserve special characters
const PRESERVE_SPECIAL_CHARS_FIELDS = ['command', 'notes', 'filename', 'secrets'];

export const sanitizeString = (str, fieldName = '') => {
  if (typeof str !== 'string') return '';
  
  // For command and notes fields, use lighter sanitization to preserve syntax
  if (PRESERVE_SPECIAL_CHARS_FIELDS.includes(fieldName)) {
    // Remove any HTML/XML tags but preserve other characters
    let sanitized = str.replace(/<[^>]*>/g, '');
    
    // Only escape < and > characters since they could form HTML tags
    sanitized = sanitized
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    return sanitized;
  }
  
  // For other fields, use standard sanitization
  let sanitized = str.replace(/<[^>]*>/g, '');
  
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
};

export const validateInput = (value, field) => {
  if (!value) return true;
  
  switch (field) {
    case 'hostname':
    case 'domain':
      // Allow any characters that could be in a hostname/domain
      return true;
    
    case 'username':
      return /^[a-zA-Z0-9_-]+$/.test(value);
    
    case 'filename':
      return /^[a-zA-Z0-9._-]+$/.test(value);
      
    case 'mac_address':
      // Validate MAC address format (xx:xx:xx:xx:xx:xx or xx-xx-xx-xx-xx-xx)
      return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(value);
    
    default:
      return true;
  }
};

export const sanitizeLogData = (logData) => {
  return {
    ...logData,
    internal_ip: logData.internal_ip ? sanitizeString(logData.internal_ip) : '',
    external_ip: logData.external_ip ? sanitizeString(logData.external_ip) : '',
    mac_address: logData.mac_address ? sanitizeString(logData.mac_address) : '', // New field
    hostname: logData.hostname ? sanitizeString(logData.hostname) : '',
    domain: logData.domain ? sanitizeString(logData.domain) : '',
    username: logData.username ? sanitizeString(logData.username) : '',
    command: logData.command ? sanitizeString(logData.command, 'command') : '',
    notes: logData.notes ? sanitizeString(logData.notes, 'notes') : '',
    filename: logData.filename ? sanitizeString(logData.filename, 'filename') : '',
    status: logData.status ? sanitizeString(logData.status) : '',
    secrets: logData.secrets ? sanitizeString(logData.secrets, 'secrets') : ''
  };
};