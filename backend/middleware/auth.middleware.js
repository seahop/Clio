// middleware/auth.middleware.js
const { SESSION_OPTIONS } = require('../config/constants');
const { redisClient } = require('../lib/redis');
const { ADMIN_SECRET } = require('../config/security');
const crypto = require('crypto');

const authenticateToken = async (req, res, next) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Use withRetry for Redis operations
    let sessionId, sessionDataString;
    
    try {
      sessionId = await redisClient.get(`session:${token}`);
    } catch (error) {
      console.error('Failed to get session:', error);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(503).json({ error: 'Authentication service unavailable' });
    }
    
    if (!sessionId) {
      console.log('No session found for token:', token);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    try {
      sessionDataString = await redisClient.get(`sessionData:${sessionId}`);
    } catch (error) {
      console.error('Failed to get session data:', error);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(503).json({ error: 'Authentication service unavailable' });
    }

    if (!sessionDataString) {
      console.log('No session data found for session ID:', sessionId);
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json({ error: 'Session data not found' });
    }

    let sessionData;
    try {
      sessionData = typeof sessionDataString === 'string' 
        ? JSON.parse(sessionDataString)
        : sessionDataString;
    } catch (error) {
      console.error('Error parsing session data:', error);
      return res.status(500).json({ error: 'Invalid session data' });
    }

    if (sessionData.serverInstanceId !== req.app.get('serverInstanceId')) {
      console.log('Server instance mismatch');
      res.clearCookie('auth_token', SESSION_OPTIONS);
      return res.status(401).json({ error: 'Server has been restarted, please log in again' });
    }

    // Refresh session
    try {
      await redisClient.setEx(
        `sessionData:${sessionId}`,
        8 * 60 * 60, // 8 hours
        JSON.stringify(sessionData)
      );
      await redisClient.setEx(
        `session:${token}`,
        8 * 60 * 60,
        sessionId
      );
    } catch (error) {
      console.error('Failed to refresh session:', error);
      // Continue anyway since we've already verified the session
    }

    req.user = sessionData;
    next();
  } catch (error) {
    console.error('Session verification error:', error);
    res.clearCookie('auth_token', SESSION_OPTIONS);
    res.status(500).json({ error: 'Session verification failed' });
  }
};

const verifyAdmin = (req, res, next) => {
  try {
    const user = req.user;
    
    const expectedProof = crypto.createHmac('sha256', ADMIN_SECRET)
                               .update(user.username)
                               .digest('hex');
    
    if (user.role !== 'admin' || user.adminProof !== expectedProof) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid admin authentication' });
  }
};

module.exports = {
  authenticateToken,
  verifyAdmin
};