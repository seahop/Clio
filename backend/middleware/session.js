// middleware/session.js
const { redisClient } = require('../lib/redis');
const { v4: uuidv4 } = require('uuid');
const { SESSION_OPTIONS } = require('../config/constants');
const eventLogger = require('../lib/eventLogger');

const SESSION_DURATION = 8 * 60 * 60; // 8 hours in seconds
//const SESSION_DURATION = 60; // 1 minute for testing

class SessionHandler {
  constructor(serverInstanceId) {
    this.serverInstanceId = serverInstanceId;
  }

  async createSession(user) {
    const sessionId = uuidv4();
    const token = uuidv4();
    const sessionData = {
      ...user,
      serverInstanceId: this.serverInstanceId
    };

    try {
      // Store session data with retry logic
      await redisClient.withRetry(async () => {
        // Store session data
        await redisClient.setEx(
          `sessionData:${sessionId}`,
          SESSION_DURATION,
          JSON.stringify(sessionData)
        );

        // Map token to session
        await redisClient.setEx(
          `session:${token}`,
          SESSION_DURATION,
          sessionId
        );

        // Track user sessions
        await redisClient.sAdd(`user:${user.username}:sessions`, sessionId);
      });

      return token;
    } catch (error) {
      console.error('Session creation error:', error);
      throw error;
    }
  }

  async verifySession(token) {
    if (!token) return null;

    try {
      const sessionId = await redisClient.get(`session:${token}`);
      
      if (!sessionId) {
        console.log('No session ID found for token');
        return null;
      }

      const sessionData = await redisClient.get(`sessionData:${sessionId}`);
      
      if (!sessionData) {
        console.log('No session data found for session ID');
        return null;
      }

      // Handle both object and string data
      let parsedData;
      if (typeof sessionData === 'string') {
        try {
          parsedData = JSON.parse(sessionData);
        } catch (parseError) {
          console.error('Session data parse error:', parseError);
          return null;
        }
      } else {
        parsedData = sessionData;
      }

      if (parsedData.serverInstanceId !== this.serverInstanceId) {
        console.log('Server instance mismatch:', {
          stored: parsedData.serverInstanceId,
          current: this.serverInstanceId
        });
        return null;
      }

      // Refresh session expiration
      await redisClient.withRetry(async () => {
        await redisClient.setEx(
          `session:${token}`,
          SESSION_DURATION,
          sessionId
        );
        await redisClient.setEx(
          `sessionData:${sessionId}`,
          SESSION_DURATION,
          JSON.stringify(parsedData)
        );
      });

      return parsedData;
    } catch (error) {
      console.error('Session verification error:', error);
      return null;
    }
  }

  async regenerateSession(oldToken, user) {
    try {
      // Get the old session ID
      const oldSessionId = await redisClient.get(`session:${oldToken}`);
      
      if (!oldSessionId) {
        console.error('Cannot regenerate session: old session not found');
        return null;
      }
      
      // Create new identifiers
      const newSessionId = uuidv4();
      const newToken = uuidv4();
      
      // Create updated session data
      const sessionData = {
        ...user,
        serverInstanceId: this.serverInstanceId,
        regeneratedAt: new Date().toISOString()
      };
      
      await redisClient.withRetry(async () => {
        // Store new session data
        await redisClient.setEx(
          `sessionData:${newSessionId}`,
          SESSION_DURATION,
          JSON.stringify(sessionData)
        );
        
        // Map new token to new session
        await redisClient.setEx(
          `session:${newToken}`,
          SESSION_DURATION,
          newSessionId
        );
        
        // Add new session to user's session set
        await redisClient.sAdd(`user:${user.username}:sessions`, newSessionId);
        
        // Mark the old session as regenerated (keep it briefly to prevent race conditions)
        await redisClient.setEx(
          `sessionRegenerated:${oldSessionId}`,
          60, // Keep for 1 minute
          newSessionId
        );
        
        // Delete the old token mapping
        await redisClient.del(`session:${oldToken}`);
        
        // Optionally log the session regeneration
        await eventLogger.logSecurityEvent('session_regenerated', user.username, {
          oldSessionId: oldSessionId.substring(0, 8), // Log only part of the ID for security
          newSessionId: newSessionId.substring(0, 8),
        });
      });
      
      return newToken;
    } catch (error) {
      console.error('Session regeneration error:', error);
      throw error;
    }
  }

  async revokeSession(token) {
    try {
      await redisClient.withRetry(async () => {
        const sessionId = await redisClient.get(`session:${token}`);
        if (sessionId) {
          const sessionData = await redisClient.get(`sessionData:${sessionId}`);
          if (sessionData) {
            let parsedData;
            try {
              parsedData = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
              await redisClient.sRem(`user:${parsedData.username}:sessions`, sessionId);
            } catch (error) {
              console.error('Error parsing session data during revocation:', error);
            }
          }
          
          await redisClient.del(`session:${token}`);
          await redisClient.del(`sessionData:${sessionId}`);
        }
      });
    } catch (error) {
      console.error('Session revocation error:', error);
      throw error;
    }
  }

  async revokeAllSessions() {
    try {
      await redisClient.withRetry(async () => {
        const sessionKeys = await redisClient.keys('session:*');
        const sessionDataKeys = await redisClient.keys('sessionData:*');
        const userKeys = await redisClient.keys('user:*:sessions');

        for (const key of [...sessionKeys, ...sessionDataKeys, ...userKeys]) {
          await redisClient.del(key);
        }
      });

      return true;
    } catch (error) {
      console.error('Error revoking all sessions:', error);
      throw error;
    }
  }
}

const createSessionHandler = (serverInstanceId) => {
  const handler = new SessionHandler(serverInstanceId);

  return {
    sessionMiddleware: async (req, res, next) => {
      const token = req.cookies.auth_token;
      
      if (!token) {
        return next();
      }

      try {
        const sessionData = await handler.verifySession(token);
        
        if (!sessionData) {
          res.clearCookie('auth_token', SESSION_OPTIONS);
          return res.status(401).json({ error: 'Session expired or invalid' });
        }

        // Check if the session was regenerated
        const sessionId = await redisClient.get(`session:${token}`);
        if (sessionId) {
          const wasRegenerated = await redisClient.get(`sessionRegenerated:${sessionId}`);
          if (wasRegenerated) {
            // This is an old session that has been regenerated
            res.clearCookie('auth_token', SESSION_OPTIONS);
            return res.status(401).json({ error: 'Session has been refreshed, please login again' });
          }
        }

        req.session = sessionData;
        next();
      } catch (error) {
        console.error('Session middleware error:', error);
        res.clearCookie('auth_token', SESSION_OPTIONS);
        res.status(503).json({ error: 'Authentication service unavailable' });
      }
    },

    createSession: (user) => handler.createSession(user),
    regenerateSession: (oldToken, user) => handler.regenerateSession(oldToken, user),
    revokeSession: (token) => handler.revokeSession(token),
    revokeAllSessions: () => handler.revokeAllSessions()
  };
};

module.exports = createSessionHandler;