// backend/lib/jwtHandler.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { redisClient } = require('./redis');
const eventLogger = require('./eventLogger');

/**
 * Enhanced JWT handler with Redis integration for better security
 */
class JwtHandler {
  constructor(jwtSecret, serverInstanceId) {
    this.jwtSecret = jwtSecret;
    this.serverInstanceId = serverInstanceId;
    this.baseOptions = {
      algorithm: 'HS256',
      issuer: 'red-team-logger'
    };
  }

  async generateToken(payload, options = {}) {
    try {
      const jti = crypto.randomBytes(32).toString('hex');
      
      const enhancedPayload = {
        ...payload,
        jti,
        iat: Math.floor(Date.now() / 1000),
        serverInstanceId: this.serverInstanceId,
        tokenVersion: payload.tokenVersion || 1
      };
      
      const tokenOptions = {
        ...this.baseOptions,
        ...options,
        expiresIn: options.expiresIn || '8h'
      };
      
      // Generate the JWT
      const token = jwt.sign(enhancedPayload, this.jwtSecret, tokenOptions);
      
      // Store token data as a simple string with field-value pairs
      // This avoids relying on proper JSON serialization/deserialization
      const redisValue = [
        'userId', payload.id || '',
        'username', payload.username || '',
        'role', payload.role || '',
        'serverInstanceId', this.serverInstanceId,
        'issuedAt', enhancedPayload.iat.toString(),
        'tokenVersion', enhancedPayload.tokenVersion.toString()
      ].join('::');
      
      // Store token reference in Redis with a simple delimited string
      await redisClient.setEx(
        `jwt:${jti}`,
        convertExpiresInToSeconds(tokenOptions.expiresIn),
        redisValue
      );
      
      // Add to user's active tokens set
      if (payload.username) {
        await redisClient.sAdd(`user:${payload.username}:tokens`, jti);
      }
      
      return {
        token,
        jti,
        expiresIn: tokenOptions.expiresIn
      };
    } catch (error) {
      console.error('JWT generation error:', error);
      throw error;
    }
  }

  async verifyToken(token) {
    try {
      // First, verify the JWT signature and expiration
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.baseOptions.issuer,
        algorithms: [this.baseOptions.algorithm]
      });
      
      // Then check if the token is in our Redis store
      const storedTokenData = await redisClient.get(`jwt:${decoded.jti}`);
      
      if (!storedTokenData) {
        console.log('Token not found in Redis store');
        return null;
      }
      
      // Parse the simple delimiter-based data format
      const tokenData = parseRedisValue(storedTokenData);
      
      // Verify server instance binding
      if (tokenData.serverInstanceId !== this.serverInstanceId) {
        console.log('Server instance mismatch:', {
          token: tokenData.serverInstanceId,
          current: this.serverInstanceId
        });
        return null;
      }
      
      // Verify token version (for forced rotation)
      if (parseInt(tokenData.tokenVersion) !== decoded.tokenVersion) {
        console.log('Token version mismatch');
        return null;
      }
      
      // Token is valid, return the payload
      return {
        ...decoded,
        jti: decoded.jti,
        role: tokenData.role // Include role from source of truth
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.log('JWT validation error:', error.message);
      } else if (error instanceof jwt.TokenExpiredError) {
        console.log('Token expired');
      } else {
        console.error('Token verification error:', error);
      }
      return null;
    }
  }

  async refreshToken(oldToken) {
    try {
      // First verify the old token
      const decoded = await this.verifyToken(oldToken);
      
      if (!decoded) {
        return null;
      }
      
      // Prepare to generate a new token
      const { jti: oldJti, ...payload } = decoded;
      
      // Increment token version to prevent use of previous token
      payload.tokenVersion = (payload.tokenVersion || 1) + 1;
      
      // Generate new token
      const newToken = await this.generateToken(payload);
      
      // Mark old token as refreshed (but maintain it briefly)
      await redisClient.setEx(
        `jwt:refreshed:${oldJti}`,
        60, // Keep for 1 minute to prevent race conditions
        newToken.jti
      );
      
      // Remove old token after short delay
      setTimeout(async () => {
        await this.revokeToken(oldJti);
      }, 2000);
      
      // Log the token refresh
      await eventLogger.logSecurityEvent('token_refresh', payload.username, {
        oldJti: oldJti.substring(0, 8), // Log just prefix for security
        newJti: newToken.jti.substring(0, 8)
      });
      
      return newToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }

  async revokeToken(jti) {
    try {
      // Get token info before deletion
      const tokenData = await redisClient.get(`jwt:${jti}`);
      
      if (tokenData) {
        try {
          const parsedData = parseRedisValue(tokenData);
          
          // IMPORTANT: Only remove this specific token from user's tokens set if username exists
          // Don't delete or affect any other Redis keys related to the user
          if (parsedData.username) {
            await redisClient.sRem(`user:${parsedData.username}:tokens`, jti);
            
            // Log the revocation
            await eventLogger.logSecurityEvent('token_revoke', parsedData.username, {
              jti: jti.substring(0, 8)
            });
          }
        } catch (error) {
          console.error('Error parsing token info during revocation:', error);
        }
      }
      
      // Delete only the specific token
      await redisClient.del(`jwt:${jti}`);
      
      return true;
    } catch (error) {
      console.error('Token revocation error:', error);
      return false;
    }
  }

  async revokeUserTokens(username) {
    try {
      // Get all tokens for this user
      const tokenIds = await redisClient.smembers(`user:${username}:tokens`);
      
      console.log(`Revoking ${tokenIds.length} tokens for user ${username}`);
      
      // Revoke each token individually
      for (const jti of tokenIds) {
        await this.revokeToken(jti);
      }
      
      // Clear the set
      await redisClient.del(`user:${username}:tokens`);
      
      // Log the revocation
      await eventLogger.logSecurityEvent('all_tokens_revoke', username, {
        count: tokenIds.length
      });
      
      return true;
    } catch (error) {
      console.error('User tokens revocation error:', error);
      return false;
    }
  }

  async revokeAllTokens() {
    try {
      // Find all token keys
      const tokenKeys = await redisClient.keys('jwt:*');
      const userTokenSets = await redisClient.keys('user:*:tokens');
      
      // Log what we're trying to do
      console.log(`Revoking all tokens: ${tokenKeys.length} tokens, ${userTokenSets.length} token sets`);
      
      // Delete all tokens
      for (const key of tokenKeys) {
        // Skip refreshed tokens as they're handled separately
        if (key.includes('refreshed:')) continue;
        
        // Try to get the username from the token before deleting
        try {
          const tokenData = await redisClient.get(key);
          if (tokenData) {
            const parsedData = parseRedisValue(tokenData);
            console.log(`Revoking token for ${parsedData.username || 'unknown user'}`);
          }
        } catch (err) {
          console.error(`Error getting token data before deletion:`, err);
        }
        
        await redisClient.del(key);
      }
      
      // Delete all user token sets
      for (const key of userTokenSets) {
        const username = key.replace('user:', '').replace(':tokens', '');
        console.log(`Clearing token set for ${username}`);
        await redisClient.del(key);
      }
      
      // Log the system-wide revocation
      await eventLogger.logSecurityEvent('system_tokens_revoke', 'system', {
        count: tokenKeys.length,
        userSets: userTokenSets.length
      });
      
      return true;
    } catch (error) {
      console.error('All tokens revocation error:', error);
      return false;
    }
  }
}

/**
 * Convert expiresIn string (e.g., '1h', '7d') to seconds
 */
function convertExpiresInToSeconds(expiresIn) {
  if (typeof expiresIn === 'number') {
    return expiresIn;
  }
  
  const match = expiresIn.match(/^(\d+)([smhdw])$/);
  if (!match) {
    return 28800; // Default 8 hours in seconds
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    case 'w': return value * 7 * 24 * 60 * 60;
    default: return 28800;
  }
}

/**
 * Parse a simple delimiter-based string into key-value object
 */
function parseRedisValue(value) {
  if (!value) return {};
  
  const parts = value.split('::');
  const result = {};
  
  for (let i = 0; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      result[parts[i]] = parts[i + 1];
    }
  }
  
  return result;
}

module.exports = JwtHandler;