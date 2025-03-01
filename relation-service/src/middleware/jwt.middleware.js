// relation-service/src/middleware/jwt.middleware.js
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const https = require('https');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required');
  process.exit(1);
}

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * JWT authentication middleware for relation service
 * - Validates JWT tokens using the same secret as the backend
 * - Maintains compatibility with the existing middleware
 */
const authenticateJwt = async (req, res, next) => {
  try {
    // Extract token from cookie or Authorization header
    let token = req.cookies?.auth_token;
    
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      // Fall back to main backend authentication if no token is provided
      // This maintains compatibility with the existing auth middleware
      return await fallbackToBackendAuth(req, res, next);
    }
    
    // Verify the token
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256']
      });
      
      // Set user info in the request
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role
      };
      
      // Continue to the next middleware or route handler
      next();
    } catch (jwtError) {
      console.log('JWT verification failed, falling back to backend auth:', jwtError.message);
      return await fallbackToBackendAuth(req, res, next);
    }
  } catch (error) {
    console.error('JWT authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Fallback to the main backend's authentication
 * This is used when JWT validation fails or no token is provided
 */
const fallbackToBackendAuth = async (req, res, next) => {
  try {
    // Make sure fetch is available
    const token = req.cookies?.auth_token;
  
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Use Docker service name 'backend' instead of localhost
    const response = await fetch('https://backend:3001/api/auth/me', {
      headers: {
        'Cookie': `auth_token=${token}`,
        'Accept': 'application/json'
      },
      credentials: 'include',
      // Ignore self-signed certificate in development
      agent: httpsAgent
    });

    if (!response.ok) {
      console.error('Auth verification failed:', await response.text());
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userData = await response.json();
    req.user = userData;
    next();
  } catch (error) {
    console.error('Authentication error:', {
      message: error.message,
      cause: error.cause,
      stack: error.stack
    });
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

/**
 * Verify admin role middleware
 */
const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = {
  authenticateJwt,
  verifyAdmin
};