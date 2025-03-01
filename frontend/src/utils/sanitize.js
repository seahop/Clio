// frontend/src/utils/sanitize.js

export const sanitizeString = (str) => {
    if (typeof str !== 'string') return '';
    
    // Remove any HTML/XML tags
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
      
      default:
        return true;
    }
  };
  
  export const sanitizeLogData = (logData) => {
    return {
      ...logData,
      internal_ip: logData.internal_ip ? sanitizeString(logData.internal_ip) : '',
      external_ip: logData.external_ip ? sanitizeString(logData.external_ip) : '',
      hostname: logData.hostname ? sanitizeString(logData.hostname) : '',
      domain: logData.domain ? sanitizeString(logData.domain) : '',
      username: logData.username ? sanitizeString(logData.username) : '',
      command: logData.command ? sanitizeString(logData.command) : '',
      notes: logData.notes ? sanitizeString(logData.notes) : '',
      filename: logData.filename ? sanitizeString(logData.filename) : '',
      status: logData.status ? sanitizeString(logData.status) : '',
      secrets: logData.secrets ? sanitizeString(logData.secrets) : ''
    };
  };