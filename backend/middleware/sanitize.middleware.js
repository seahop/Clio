// backend/middleware/sanitize.middleware.js

const { sanitizeObject, sanitizeLogData } = require('../utils/sanitize');

// Add input validation with length checks
const validateInputLengths = (data) => {
  const constraints = {
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
    secrets: 254,
    analyst: 100,
    locked_by: 100,
    pid: 20
  };

  const errors = [];
  
  Object.entries(data).forEach(([key, value]) => {
    if (value && constraints[key] && value.length > constraints[key]) {
      errors.push(`${key} must not exceed ${constraints[key]} characters`);
    }
  });

  return errors;
};

const sanitizeRequestMiddleware = (req, res, next) => {
  try {
    // Check input lengths first
    if (req.body) {
      // Handle arrays (batch submissions)
      if (Array.isArray(req.body)) {
        const allErrors = [];
        req.body.forEach((item, index) => {
          const lengthErrors = validateInputLengths(item);
          if (lengthErrors.length > 0) {
            allErrors.push(`Item ${index}: ${lengthErrors.join(', ')}`);
          }
        });
        if (allErrors.length > 0) {
          return res.status(400).json({
            error: 'Input validation failed',
            details: allErrors
          });
        }
      } else {
        const lengthErrors = validateInputLengths(req.body);
        if (lengthErrors.length > 0) {
          return res.status(400).json({
            error: 'Input validation failed',
            details: lengthErrors
          });
        }
      }
    }

    // Sanitize body
    if (req.body) {
      if (Array.isArray(req.body)) {
        req.body = req.body.map(item => sanitizeObject(item));
      } else {
        req.body = sanitizeObject(req.body);
      }
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    // Sanitize headers (excluding essential headers)
    const sensitiveHeaders = ['cookie', 'authorization', 'x-csrf-token', 'host'];
    Object.keys(req.headers).forEach(header => {
      if (!sensitiveHeaders.includes(header.toLowerCase())) {
        req.headers[header] = sanitizeObject(req.headers[header]);
      }
    });

    next();
  } catch (error) {
    console.error('Sanitization middleware error:', error);
    next(error);
  }
};

const sanitizeLogMiddleware = (req, res, next) => {
  try {
    if (req.body) {
      // Handle arrays (batch submissions)
      if (Array.isArray(req.body)) {
        req.body = req.body.map(item => sanitizeLogData(item));
      } else {
        req.body = sanitizeLogData(req.body);
      }
    }
    next();
  } catch (error) {
    console.error('Log sanitization middleware error:', error);
    next(error);
  }
};

// Additional middleware for specific content-type validation
const validateContentType = (req, res, next) => {
  const contentType = req.headers['content-type'];
  
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: 'Content-Type must be application/json'
      });
    }
  }
  
  next();
};

module.exports = {
  sanitizeRequestMiddleware,
  sanitizeLogMiddleware,
  validateContentType
};