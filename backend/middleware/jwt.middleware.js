// backend/middleware/jwt.middleware.js
const JwtHandler = require('../lib/jwtHandler');
const security = require('../config/security');
const { SESSION_OPTIONS } = require('../config/constants');
const eventLogger = require('../lib/eventLogger');
const crypto = require('crypto');

// Initialize JWT handler
const jwtHandler = new JwtHandler(security.JWT_SECRET, security.SERVER_INSTANCE_ID);

/**
 * Authentication middleware using JWT with Redis validation
 * - Extracts token from cookies or Authorization header
 * - Validates JWT signature and structure
 * - Performs additional Redis-based validation
 * - Automatically refreshes tokens approaching expiration
 */
const authenticateJwt = async (req, res, next) => {
  try {
    // Extract token from cookie or Authorization header
    let token = req.cookies.auth_token;
    
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify the token
    const decodedToken = await jwtHandler.verifyToken(token);
    
    if (!decodedToken) {
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check server instance binding
    if (decodedToken.serverInstanceId !== security.SERVER_INSTANCE_ID) {
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json({ error: 'Server instance mismatch, please log in again' });
    }
    
    // Auto-refresh token if it's nearing expiration (within 15 minutes)
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const tokenExp = decodedToken.exp;
    const refreshThreshold = 15 * 60; // 15 minutes in seconds
    
    if (tokenExp - nowInSeconds < refreshThreshold) {
      try {
        // Token is nearing expiration, refresh it
        const refreshedToken = await jwtHandler.refreshToken(token);
        
        if (refreshedToken) {
          res.cookie('auth_token', refreshedToken.token, SESSION_OPTIONS);
          
          // Log token refresh
          await eventLogger.logSecurityEvent('token_auto_refresh', decodedToken.username, {
            username: decodedToken.username,
            tokenAge: nowInSeconds - decodedToken.iat
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
    res.clearCookie('auth_token', SESSION_OPTIONS);
    res.status(500).json({ error: 'Authentication failed' });
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
    const decoded = await jwtHandler.verifyToken(token);
    if (!decoded) {
      return false;
    }
    
    return await jwtHandler.revokeToken(decoded.jti);
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