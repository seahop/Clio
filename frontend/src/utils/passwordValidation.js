// frontend/src/utils/passwordValidation.js

export const validateLoginInput = (username, password) => {
    const errors = [];
  
    // Username validation
    if (!username) {
      errors.push('Username is required');
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/.test(username)) {
      errors.push('Username must start with a letter and contain only letters, numbers, underscores, and hyphens');
    }
  
    // Password validation for login
    if (!password) {
      errors.push('Password is required');
    } else if (
      password.includes('--') ||
      password.includes(';') ||
      /[<>]/.test(password) ||
      /script/i.test(password) ||
      /javascript:/i.test(password) ||
      /data:/i.test(password)
    ) {
      errors.push('Password contains invalid characters');
    }
  
    return errors;
  };
  
  export const validateNewPassword = (password) => {
    const errors = [];
    
    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
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
      errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>/?)');
    }
    
    if (/^[A-Za-z]+\d+$/.test(password)) {
      errors.push('Password cannot be just letters followed by numbers');
    }
    
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password cannot contain repeated characters (3 or more times)');
    }
  
    return errors;
  };