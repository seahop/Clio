// middleware/jwt.middleware.js
const jwt = require('jsonwebtoken'); 
const JwtHandler = require('../lib/jwtHandler');
const security = require('../config/security');
const { SESSION_OPTIONS } = require('../config/constants');
const eventLogger = require('../lib/eventLogger');
const crypto = require('crypto');
const { redisClient } = require('../lib/redis');

// JWT configuration constants
const JWT_EXPIRY = 8 * 60 * 60; // 8 hours in seconds
const JWT_REFRESH_THRESHOLD_PERCENTAGE = 0.75; // Refresh when 75% of lifetime has passed
const MAX_REFRESH_ATTEMPTS = 5;
const REFRESH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Rate limiting for token refresh
const refreshAttempts = new Map();

// Initialize JWT handler
const jwtHandler = new JwtHandler(security.JWT_SECRET, security.SERVER_INSTANCE_ID);

// Helper function to create standardized error responses
const createErrorResponse = (code, message) => {
  return {
    error: 'Authentication failed',
    code,
    message
  };
};

// Wrap Redis operations with timeout and retry logic
const redisOperation = async (operation, maxRetries = 3, timeout = 1000) => {
  let attempts = 0;
  let lastError;
  
  while (attempts < maxRetries) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis operation timed out')), timeout);
      });
      
      // Race the operation against the timeout
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      lastError = error;
      attempts++;
      
      if (attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempts));
      }
    }
  }
  
  throw lastError;
};

// Refresh token with rate limiting
const refreshToken = async (token, userId) => {
  // Check rate limit
  const key = userId || token.substring(0, 16);
  const now = Date.now();
  
  if (!refreshAttempts.has(key)) {
    refreshAttempts.set(key, { count: 1, timestamp: now });
  } else {
    const attempt = refreshAttempts.get(key);
    
    // Reset counter if window has passed
    if (now - attempt.timestamp > REFRESH_WINDOW_MS) {
      attempt.count = 1;
      attempt.timestamp = now;
    } else {
      attempt.count++;
      
      // Enforce rate limit
      if (attempt.count > MAX_REFRESH_ATTEMPTS) {
        throw new Error('Token refresh rate limit exceeded');
      }
    }
    
    refreshAttempts.set(key, attempt);
  }
  
  // Actual token refresh logic
  return await jwtHandler.refreshToken(token);
};

// Clean up the refresh attempts map periodically
const cleanupRefreshAttempts = () => {
  const now = Date.now();
  
  for (const [key, attempt] of refreshAttempts.entries()) {
    if (now - attempt.timestamp > REFRESH_WINDOW_MS) {
      refreshAttempts.delete(key);
    }
  }
};

// Set up periodic cleanup
setInterval(cleanupRefreshAttempts, 60 * 60 * 1000); // Every hour

/**
 * Authentication middleware using JWT with Redis validation
 * - Extracts token from cookies or Authorization header
 * - Validates JWT signature and structure
 * - Performs additional Redis-based validation
 * - Automatically refreshes tokens approaching expiration
 */
const authenticateJwt = async (req, res, next) => {
  try {
    // Extract token from httpOnly cookie (new approach)
    // Also support auth_token for backward compatibility during migration
    let token = req.cookies.token || req.cookies.auth_token;

    // Fallback to Authorization header for API keys
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      return res.status(401).json(createErrorResponse(
        'token_missing',
        'No token provided'
      ));
    }
    
    // First decode without verification to get the token ID
    let decoded;
    try {
      decoded = jwt.decode(token);
    } catch (error) {
      res.clearCookie('token', SESSION_OPTIONS);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json(createErrorResponse(
        'token_malformed',
        'Invalid token format'
      ));
    }
    
    // Check if token has a valid structure
    if (!decoded || !decoded.jti || !decoded.exp || !decoded.iat) {
      res.clearCookie('token', SESSION_OPTIONS);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json(createErrorResponse(
        'token_invalid',
        'Invalid token structure'
      ));
    }

    // Check expiration directly (fast check before Redis)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) {
      res.clearCookie('token', SESSION_OPTIONS);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json(createErrorResponse(
        'token_expired',
        'Token has expired'
      ));
    }
    
    // Check in Redis if the token has been revoked (faster than verification)
    try {
      const tokenKey = `jwt:${decoded.jti}`;
      const tokenExists = await redisOperation(
        () => redisClient.exists(tokenKey),
        3,
        500
      );
      
      if (!tokenExists) {
        res.clearCookie('token', SESSION_OPTIONS);
        res.clearCookie('auth_token', SESSION_OPTIONS);
        return res.status(401).json(createErrorResponse(
          'token_revoked',
          'Session has been revoked or expired'
        ));
      }
    } catch (redisError) {
      console.error('Redis check error:', redisError);
      // Continue with token verification as fallback
    }
    
    // Now verify the token cryptographically
    const decodedToken = await jwtHandler.verifyToken(token);

    if (!decodedToken) {
      res.clearCookie('token', SESSION_OPTIONS);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json(createErrorResponse(
        'token_invalid',
        'Invalid or expired token'
      ));
    }

    // Check server instance binding
    if (decodedToken.serverInstanceId !== security.SERVER_INSTANCE_ID) {
      res.clearCookie('token', SESSION_OPTIONS);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json(createErrorResponse(
        'server_mismatch',
        'Server instance mismatch, please log in again'
      ));
    }
    
    // Auto-refresh token if it's nearing expiration using relative threshold
    const totalLifetime = decodedToken.exp - decodedToken.iat;
    const refreshThreshold = Math.floor(totalLifetime * JWT_REFRESH_THRESHOLD_PERCENTAGE);
    
    if (decodedToken.exp - now < refreshThreshold) {
      try {
        // Rate limited token refresh
        const userId = decodedToken.id;
        const refreshedToken = await refreshToken(token, userId);

        if (refreshedToken) {
          // Set new token cookie
          res.cookie('token', refreshedToken.token, SESSION_OPTIONS);
          // Also set auth_token for backward compatibility
          res.cookie('auth_token', refreshedToken.token, SESSION_OPTIONS);

          // Log token refresh
          await eventLogger.logSecurityEvent('token_auto_refresh', decodedToken.username, {
            username: decodedToken.username,
            tokenAge: now - decodedToken.iat,
            remainingValidity: decodedToken.exp - now
          });
        }
      } catch (refreshError) {
        // Log refresh error but continue with current token
        console.error('Token refresh error:', refreshError);
      }
    }
    
    // Add user information to the request
    req.user = {
      id: decodedToken.id,
      username: decodedToken.username,
      role: decodedToken.role
    };
    
    // For admin users, add the admin proof
    if (decodedToken.role === 'admin') {
      req.user.adminProof = crypto.createHmac('sha256', security.ADMIN_SECRET)
                                  .update(decodedToken.username)
                                  .digest('hex');
    }
    
    // Continue to the next middleware or route handler
    next();
  } catch (error) {
    console.error('JWT authentication error:', error);
    res.clearCookie('token', SESSION_OPTIONS);
    res.clearCookie('auth_token', SESSION_OPTIONS);
    res.status(500).json(createErrorResponse(
      'auth_error',
      'Authentication failed'
    ));
  }
};

/**
 * Helper function to create a JWT token
 * @param {Object} user - User object to encode
 * @param {Object} options - JWT options
 * @returns {Promise<Object>} - Generated token data
 */
const createJwtToken = async (user, options = {}) => {
  try {
    return await jwtHandler.generateToken(user, options);
  } catch (error) {
    console.error('Token creation error:', error);
    throw error;
  }
};

/**
 * Revoke a specific token
 * @param {string} token - Token to revoke
 * @returns {Promise<boolean>} - Success status 
 */
const revokeJwtToken = async (token) => {
  try {
    // Decode the token to get the JWT ID and username
    let decoded = null;
    try {
      decoded = jwt.decode(token);
    } catch (error) {
      console.error('Error decoding token during revocation:', error);
      return false;
    }
    
    if (!decoded || !decoded.jti) {
      console.error('Invalid token format for revocation');
      return false;
    }
    
    const tokenId = decoded.jti;
    const username = decoded.username;
    
    // Get token data before deletion for logging
    const tokenData = await redisClient.get(`jwt:${tokenId}`);
    
    // Delete the token from Redis
    await redisClient.del(`jwt:${tokenId}`);
    
    // Delete any refreshed token references
    await redisClient.del(`jwt:refreshed:${tokenId}`);
    
    // If we have username info, remove from user's tokens set
    if (username) {
      await redisClient.sRem(`user:${username}:tokens`, tokenId);
    }
    
    // Log the token revocation
    await eventLogger.logSecurityEvent('token_revoke', username || 'unknown', {
      jti: tokenId.substring(0, 8),
      manual: true
    });
    
    return true;
  } catch (error) {
    console.error('Token revocation error:', error);
    return false;
  }
};

/**
 * Revoke all tokens for a user
 * @param {string} username - Username to revoke tokens for
 * @returns {Promise<boolean>} - Success status
 */
const revokeUserTokens = async (username) => {
  try {
    return await jwtHandler.revokeUserTokens(username);
  } catch (error) {
    console.error('User tokens revocation error:', error);
    return false;
  }
};

/**
 * Revoke all tokens in the system
 * @returns {Promise<boolean>} - Success status
 */
const revokeAllTokens = async () => {
  try {
    return await jwtHandler.revokeAllTokens();
  } catch (error) {
    console.error('All tokens revocation error:', error);
    return false;
  }
};

// Re-export the verify admin middleware for convenience
const { verifyAdmin } = require('./auth.middleware');

module.exports = {
  authenticateJwt,
  createJwtToken,
  revokeJwtToken,
  revokeUserTokens,
  revokeAllTokens,
  verifyAdmin
};