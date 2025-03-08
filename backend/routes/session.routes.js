// backend/routes/session.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const { redisClient } = require('../lib/redis');
const eventLogger = require('../lib/eventLogger');
const jwt = require('jsonwebtoken');
const security = require('../config/security');

// Get all active sessions (admin only)
router.get('/active', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    // Get all active token keys
    const tokenKeys = await redisClient.keys('jwt:*');
    
    // Filter out refreshed or special tokens
    const activeTokenKeys = tokenKeys.filter(key => !key.includes('refreshed:'));
    
    // Get data for each token
    const sessions = [];
    
    for (const key of activeTokenKeys) {
      try {
        const tokenId = key.replace('jwt:', '');
        const tokenData = await redisClient.get(key);
        
        if (tokenData) {
          // Parse the simple delimiter-based data format
          const parsedData = {};
          const parts = tokenData.split('::');
          
          for (let i = 0; i < parts.length; i += 2) {
            if (i + 1 < parts.length) {
              parsedData[parts[i]] = parts[i + 1];
            }
          }
          
          // Add session data
          if (parsedData.username) {
            sessions.push({
              id: tokenId.substring(0, 16), // Only use part of token ID for security
              username: parsedData.username,
              role: parsedData.role || 'user',
              issuedAt: new Date(parseInt(parsedData.issuedAt) * 1000).toISOString(),
              // Add "isCurrentSession" flag if this is the user's current session
              isCurrentSession: req.user && 
                               req.user.username === parsedData.username && 
                               req.cookies.auth_token && 
                               jwt.decode(req.cookies.auth_token).jti === tokenId
            });
          }
        }
      } catch (err) {
        console.error(`Error processing token ${key}:`, err);
      }
    }
    
    // Sort sessions by username and then issuedAt
    sessions.sort((a, b) => {
      if (a.username !== b.username) {
        return a.username.localeCompare(b.username);
      }
      return new Date(b.issuedAt) - new Date(a.issuedAt);
    });
    
    // Log this action
    await eventLogger.logAuditEvent('view_active_sessions', req.user.username, {
      sessionCount: sessions.length,
      timestamp: new Date().toISOString()
    });
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// Revoke specific sessions (admin only)
router.post('/revoke', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    const { sessionIds } = req.body;
    
    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({ error: 'No session IDs provided' });
    }
    
    // Check if the admin is trying to revoke their own session
    const currentTokenId = jwt.decode(req.cookies.auth_token).jti;
    const isRevokingSelf = sessionIds.some(id => currentTokenId.startsWith(id));
    
    const results = [];
    // Process each session ID
    for (const sessionId of sessionIds) {
      try {
        // We need to find tokens that START with this sessionId
        // (since we only display the first 16 chars in the frontend)
        const matchingKeys = await redisClient.keys(`jwt:${sessionId}*`);
        
        if (matchingKeys.length === 0) {
          results.push({
            id: sessionId,
            error: 'Session not found',
            success: false
          });
          continue;
        }
        
        // Should only match one token in most cases
        for (const matchingKey of matchingKeys) {
          const tokenId = matchingKey.replace('jwt:', '');
          
          // Get token data before revoking
          const tokenData = await redisClient.get(matchingKey);
          let username = 'unknown';
          
          // Extract username from token data
          if (tokenData) {
            const parts = tokenData.split('::');
            for (let i = 0; i < parts.length; i += 2) {
              if (parts[i] === 'username' && i + 1 < parts.length) {
                username = parts[i + 1];
                break;
              }
            }
            
            // Only remove this token from redis. Don't do anything else to the user's account
            // This is key - we only want to invalidate this specific token
            await redisClient.del(matchingKey);
            
            // Remove only this specific token from the user's tokens set
            await redisClient.sRem(`user:${username}:tokens`, tokenId);
            
            // Log the revocation
            await eventLogger.logSecurityEvent('token_revoke', req.user.username, {
              affectedUser: username,
              tokenId: tokenId.substring(0, 8)
            });
            
            results.push({
              id: sessionId,
              username,
              success: true
            });
          } else {
            results.push({
              id: sessionId,
              error: 'Token data not found',
              success: false
            });
          }
        }
      } catch (err) {
        console.error(`Error revoking token ${sessionId}:`, err);
        results.push({
          id: sessionId,
          error: err.message,
          success: false
        });
      }
    }
    
    // If admin revoked their own session, they'll need to log back in
    if (isRevokingSelf) {
      res.clearCookie('auth_token');
      return res.json({ 
        message: 'Sessions revoked successfully. You revoked your own session and will need to log in again.',
        results,
        selfRevoked: true
      });
    }
    
    res.json({ 
      message: `Successfully revoked ${results.filter(r => r.success).length} of ${results.length} sessions`,
      results
    });
  } catch (error) {
    console.error('Error revoking sessions:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

module.exports = router;