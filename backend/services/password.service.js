// backend/services/password.service.js

const validateUsername = (username) => {
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/;
    
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }
  
    if (!usernameRegex.test(username)) {
      return {
        valid: false,
        error: 'Username must start with a letter and contain only letters, numbers, underscores, and hyphens'
      };
    }
  
    return { valid: true };
  };
  
  const validateLoginPassword = (password) => {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required' };
    }
  
    // Check for common SQL injection patterns
    const sqlInjectionPatterns = [
      '--',
      ';',
      '/*',
      '*/',
      'UNION',
      'SELECT',
      'DROP',
      'DELETE',
      'UPDATE',
      'INSERT',
      'xp_',
      '0x'
    ];
  
    const containsSqlInjection = sqlInjectionPatterns.some(pattern => 
      password.toUpperCase().includes(pattern)
    );
  
    if (containsSqlInjection) {
      return { valid: false, error: 'Invalid password format' };
    }
  
    // Check for potential XSS patterns
    const xssPatterns = [
      '<script',
      'javascript:',
      'onerror=',
      'onload=',
      'onclick=',
      '<img',
      '<svg'
    ];
  
    const containsXss = xssPatterns.some(pattern => 
      password.toLowerCase().includes(pattern)
    );
  
    if (containsXss) {
      return { valid: false, error: 'Invalid password format' };
    }
  
    // Check for maximum length
    if (password.length > 128) {
      return { valid: false, error: 'Password exceeds maximum length' };
    }
  
    return { valid: true };
  };
  
  const validateNewPassword = (password) => {
    const errors = [];
    
    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }
  
    if (password.length > 128) {
      errors.push('Password must not exceed 128 characters');
    }
  
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    if (/^[A-Za-z]+\d+$/.test(password)) {
      errors.push('Password cannot be just letters followed by numbers');
    }
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password cannot contain repeated characters (3 or more times)');
    }
  
    // Check for common SQL injection and XSS patterns
    const validateLoginResult = validateLoginPassword(password);
    if (!validateLoginResult.valid) {
      errors.push(validateLoginResult.error);
    }
  
    return errors;
  };
  
  module.exports = {
    validateUsername,
    validateLoginPassword,
    validateNewPassword
  };