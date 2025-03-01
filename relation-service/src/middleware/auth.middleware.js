// relation-service/src/middleware/auth.middleware.js
const authenticateToken = async (req, res, next) => {
    try {
      // Get auth cookie
      const token = req.cookies?.auth_token;
  
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }
  
      // Make sure fetch is available
      const fetch = require('node-fetch');
  
      // Use Docker service name 'backend' instead of localhost
      const response = await fetch('https://backend:3001/api/auth/me', {
        headers: {
          'Cookie': `auth_token=${token}`,
          'Accept': 'application/json'
        },
        credentials: 'include',
        // Ignore self-signed certificate in development
        agent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
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
  
  const verifyAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };
  
  module.exports = {
    authenticateToken,
    verifyAdmin
  };