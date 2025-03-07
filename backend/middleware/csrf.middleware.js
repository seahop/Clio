// middleware/csrf.middleware.js
const crypto = require('crypto');
const eventLogger = require('../lib/eventLogger');

// CSRF token expiration in seconds (15 minutes)
const CSRF_TOKEN_EXPIRY = 15 * 60;

// Generate a secure random token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Create a cookie that is HttpOnly, Secure, and SameSite=Strict
const createCsrfCookie = (res, token) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.HTTPS === 'true',
    sameSite: 'strict',
    path: '/',
    maxAge: CSRF_TOKEN_EXPIRY * 1000 // Convert to milliseconds
  };
  
  res.cookie('_csrf', token, cookieOptions);
};

// Add debug logging function
const debugLog = (message, data) => {
  if (process.env.CSRF_DEBUG === 'true') {
    console.log(`CSRF DEBUG: ${message}`, data);
  }
};

// CSRF token middleware
const csrfProtection = (options = {}) => {
  const { ignoreMethods = ['GET', 'HEAD', 'OPTIONS'] } = options;
  
  return (req, res, next) => {
    // Skip CSRF check for API requests with the special header
    if (req.headers['x-api-request'] === 'true' || req.path.startsWith('/api/ingest')) {
      return next();
    }
    
    // Skip CSRF check for specific methods
    if (ignoreMethods.includes(req.method)) {
      // For GET requests, only generate a new token if one doesn't exist
      if (req.method === 'GET') {
        // Check if there's already a CSRF cookie
        const existingToken = req.cookies._csrf;
        
        if (!existingToken) {
          // Generate new token only if one doesn't exist
          const token = generateToken();
          createCsrfCookie(res, token);
          // Store token in request for use in templates or response
          req.csrfToken = token;
        } else {
          // Use existing token
          req.csrfToken = existingToken;
        }
      }
      return next();
    }
    
    // For all other methods, validate the token
    const cookieToken = req.cookies._csrf;
    const headerToken = req.headers['csrf-token'] || req.headers['x-csrf-token'];
    
    debugLog('CSRF Validation', {
      cookieToken: cookieToken ? `${cookieToken.substring(0, 8)}...` : null,
      headerToken: headerToken ? `${headerToken.substring(0, 8)}...` : null,
      method: req.method,
      path: req.path
    });
    
    if (!cookieToken || !headerToken) {
      // Log the CSRF failure
      eventLogger.logSecurityEvent('csrf_failure', req.user?.username ?? 'anonymous', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        reason: 'Missing CSRF token',
        cookieExists: !!cookieToken,
        headerExists: !!headerToken
      });
      
      return res.status(403).json({
        error: 'CSRF token validation failed',
        message: 'Missing CSRF token'
      });
    }
    
    // Compare the cookie token with the header token
    if (cookieToken !== headerToken) {
      // Log the CSRF failure with details
      eventLogger.logSecurityEvent('csrf_failure', req.user?.username ?? 'anonymous', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        reason: 'Token mismatch',
        headerTokenLength: headerToken.length,
        cookieTokenLength: cookieToken.length
      });
      
      return res.status(403).json({
        error: 'CSRF token validation failed',
        message: 'Invalid CSRF token'
      });
    }
    
    // For successful validation, we'll keep the same token instead of rotating
    // This helps prevent issues with multiple concurrent requests
    // Token rotation can still happen on GET requests
    req.csrfToken = headerToken;
    
    next();
  };
};

// CSRF token endpoint middleware
const csrfTokenEndpoint = (req, res) => {
  // Check if there's already a CSRF cookie
  const existingToken = req.cookies._csrf;
  
  if (existingToken) {
    // Use the existing token to maintain consistency
    res.json({ csrfToken: existingToken });
  } else {
    // Generate a fresh token only if none exists
    const token = generateToken();
    createCsrfCookie(res, token);
    
    // Return the token to the client
    res.json({ csrfToken: token });
  }
};

module.exports = {
  csrfProtection,
  csrfTokenEndpoint
};