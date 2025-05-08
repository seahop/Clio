// backend/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const AuthService = require('../services/auth.service');
const PasswordService = require('../services/password.service');
const authLogger = require('../utils/auth-logger');
const eventLogger = require('../lib/eventLogger');
const security = require('../config/security');
const { SESSION_OPTIONS } = require('../config/constants');
const { createJwtToken, revokeJwtToken, revokeAllTokens } = require('../middleware/jwt.middleware');
const { redisClient } = require('../lib/redis'); 

const loginUser = async (req, res) => {
  const { username, password } = req.body;

  // Validate input
  const usernameValidation = PasswordService.validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({ error: usernameValidation.error });
  }

  const passwordValidation = PasswordService.validateLoginPassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.error });
  }

  const sanitizedUsername = username.trim();
  const clientInfo = {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };

  try {
    const { isValidUser, isAdmin, requiresPasswordChange } = 
      await AuthService.verifyCredentials(sanitizedUsername, password);

    if (isValidUser) {
      // Check if there's a forced password reset flag for this user
      const passwordResetKey = `user:password_reset:${sanitizedUsername}`;
      const passwordResetRequired = await redisClient.exists(passwordResetKey);

      const user = AuthService.createUserObject(sanitizedUsername, isAdmin);

      // Generate JWT token
      const tokenData = await createJwtToken(user, { expiresIn: '8h' });
      
      if (!tokenData) {
        throw new Error('Failed to create authentication token');
      }

      // Log successful login
      await AuthService.logAuthEvent('login', sanitizedUsername, true, {
        ...clientInfo,
        role: user.role,
        passwordResetRequired: passwordResetRequired ? true : false
      });

      await eventLogger.logLogin(sanitizedUsername, true, {
        ...clientInfo,
        role: user.role,
        requiresPasswordChange: requiresPasswordChange || passwordResetRequired,
        passwordResetRequired: passwordResetRequired ? true : false,
        tokenId: tokenData.jti.substring(0, 8) // Log only first 8 chars for security
      });

      // Set the JWT token in a secure cookie
      res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);
      
      // If password reset required, return that info to trigger the password change form
      if (passwordResetRequired) {
        return res.json({
          user: {
            username: user.username,
            role: user.role,
            requiresPasswordChange: true
          }
        });
      }
      
      res.json({
        user: {
          username: user.username,
          role: user.role,
          requiresPasswordChange
        }
      });
    } else {
      // Log failed login attempt
      await AuthService.logAuthEvent('login', sanitizedUsername, false, {
        ...clientInfo,
        failureReason: 'Invalid credentials'
      });

      await eventLogger.logLogin(sanitizedUsername, false, {
        ...clientInfo,
        failureReason: 'Invalid credentials',
        attemptTimestamp: new Date().toISOString()
      });

      // Add delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Log error
    await authLogger.logSecurityEvent('login_error', sanitizedUsername, {
      ...clientInfo,
      error: error.message
    });

    await eventLogger.logSecurityEvent('login_error', sanitizedUsername, {
      ...clientInfo,
      error: error.message,
      stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    res.status(500).json({ error: 'Login failed' });
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.user.username;
  const isAdmin = req.user.role === 'admin';
  const oldToken = req.cookies.auth_token;

  try {
    // Validate new password
    const passwordErrors = PasswordService.validateNewPassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid password',
        detail: passwordErrors
      });
    }

    // Change password
    await AuthService.changeUserPassword(username, currentPassword, newPassword, isAdmin);

    // If the user had a password reset flag, remove it after successful change
    const passwordResetKey = `user:password_reset:${username}`;
    await redisClient.del(passwordResetKey);

    // Log password change
    await authLogger.logSecurityEvent('password_change', username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      isAdmin,
      wasResetRequired: true
    });

    await eventLogger.logPasswordChange(username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      isAdmin,
      wasResetRequired: true,
      timestamp: new Date().toISOString()
    });

    // Create updated user object
    const user = AuthService.createUserObject(username, isAdmin);
    
    // Revoke the old token
    await revokeJwtToken(oldToken);
    
    // Generate a new token
    const tokenData = await createJwtToken(user, { expiresIn: '8h' });
    
    if (!tokenData) {
      throw new Error('Failed to create new authentication token');
    }

    // Set the new token in a cookie
    res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);
    
    res.json({ 
      message: 'Password changed successfully',
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Password change error:', error);
    
    // Log error
    await authLogger.logSecurityEvent('password_change_error', username, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    await eventLogger.logSecurityEvent('password_change_error', username, {
      error: error.message,
      stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ 
      error: 'Failed to change password',
      detail: error.message
    });
  }
};

const logoutUser = async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const username = req.user.username;
    
    // Get the JWT ID from the token
    let tokenId = null;
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti) {
        tokenId = decoded.jti;
      }
    } catch (error) {
      console.error('Error decoding token during logout:', error);
    }
    
    // Revoke the specific token
    await revokeJwtToken(token);
    
    // Also remove token from user's tokens set if we have the token ID
    if (tokenId && username) {
      try {
        await redisClient.sRem(`user:${username}:tokens`, tokenId);
        
        // Remove any refreshed token references
        await redisClient.del(`jwt:refreshed:${tokenId}`);
      } catch (error) {
        console.error('Error removing token from user set:', error);
      }
    }
    
    // Log logout event
    await eventLogger.logSecurityEvent('logout', req.user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      tokenId: tokenId ? tokenId.substring(0, 8) : 'unknown' // Log only first 8 chars for security
    });

    // Clear all cookies, not just auth_token
    res.clearCookie('auth_token', SESSION_OPTIONS);
    res.clearCookie('_csrf');
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);

    await eventLogger.logSecurityEvent('logout_error', req.user?.username, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Clear cookies even if there's an error
    res.clearCookie('auth_token', SESSION_OPTIONS);
    res.clearCookie('_csrf');
    
    res.status(500).json({ error: 'Logout failed' });
  }
};

const getCurrentUser = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const username = req.user.username;
    const isAdmin = req.user.role === 'admin';
    
    // Check for Google SSO flag either in the JWT token or in Redis
    let isGoogleSSO = req.user.isGoogleSSO === true || req.user.googleId;
    
    // If not already identified as Google SSO, check Redis for Google ID mapping
    if (!isGoogleSSO) {
      try {
        // Check if this user has a Google ID mapping
        const hasGoogleId = await redisClient.exists(`user:${username}:googleId`);
        if (hasGoogleId) {
          console.log(`User ${username} identified as Google SSO user via Redis lookup`);
          isGoogleSSO = true;
        }
      } catch (redisError) {
        console.warn('Error checking Redis for Google ID:', redisError);
        // Continue without Redis check - don't block the authentication
      }
    }

    // Only check for password reset requirements if not a Google SSO user
    let passwordResetRequired = false;
    let isFirstTime = false;
    
    if (!isGoogleSSO) {
      // Check if there's a password reset flag for this user
      const passwordResetKey = `user:password_reset:${username}`;
      try {
        passwordResetRequired = await redisClient.exists(passwordResetKey);
      } catch (redisError) {
        console.warn('Error checking password reset requirement:', redisError);
      }

      try {
        isFirstTime = isAdmin 
          ? await security.isFirstTimeAdminLogin(username)
          : await security.isFirstTimeLogin(username);
      } catch (securityError) {
        console.warn('Error checking first time login status:', securityError);
      }
    }

    // Log user check event
    await eventLogger.logSecurityEvent('user_check', username, {
      isFirstTime,
      isAdmin,
      isGoogleSSO,
      passwordResetRequired: !!passwordResetRequired,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Return user data with the requiresPasswordChange flag if needed
    // CRITICAL: Google SSO users should NEVER require password change
    res.json({
      username: req.user.username,
      role: req.user.role,
      isGoogleSSO: isGoogleSSO,
      // Google SSO users never need to change password
      requiresPasswordChange: isGoogleSSO ? false : (isFirstTime || passwordResetRequired)
    });
  } catch (error) {
    console.error('Error checking password status:', error);

    await eventLogger.logSecurityEvent('user_check_error', req.user.username, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Function to revoke all sessions
const revokeAllUserSessions = async (req, res) => {
  try {
    // Revoke all tokens in the system
    await revokeAllTokens();
    
    // Create a new user object for the admin
    const user = AuthService.createUserObject(req.user.username, true);
    
    // Generate a new token for the admin who performed this action
    const tokenData = await createJwtToken(user, { expiresIn: '8h' });
    
    // Log session revocation
    await eventLogger.logSecurityEvent('revoke_all_sessions', req.user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      isAdmin: true,
      timestamp: new Date().toISOString()
    });

    // Set the new token in a cookie
    res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);
    res.json({ message: 'All sessions revoked successfully' });
  } catch (error) {
    console.error('Session revocation error:', error);

    await eventLogger.logSecurityEvent('revoke_sessions_error', req.user?.username, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
};

// New function to force password reset for a specific user
const forcePasswordReset = async (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Only allow admin users to reset admin passwords
    if (username.toLowerCase() === 'admin' && req.user.username.toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Only the admin user can reset the admin password' });
    }

    // Set a password reset flag for this user in Redis
    const passwordResetKey = `user:password_reset:${username}`;
    await redisClient.set(passwordResetKey, 'true');
    
    // Get the user's role to determine which password to reset
    const isUserAdmin = username.toLowerCase() === 'admin';
    
    // Log the password reset action
    await eventLogger.logSecurityEvent('force_password_reset', req.user.username, {
      affectedUser: username,
      isAdmin: isUserAdmin,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    await authLogger.logSecurityEvent('force_password_reset', req.user.username, {
      affectedUser: username,
      isAdmin: isUserAdmin,
      ip: req.ip, 
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: `Password reset required for ${username} on next login` 
    });
  } catch (error) {
    console.error('Force password reset error:', error);
    
    // Log error
    await authLogger.logSecurityEvent('force_password_reset_error', req.user.username, {
      error: error.message,
      affectedUser: username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    await eventLogger.logSecurityEvent('force_password_reset_error', req.user.username, {
      error: error.message,
      stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      affectedUser: username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ 
      error: 'Failed to force password reset',
      detail: error.message
    });
  }
};

/**
 * Allow a user to change their own password
 */
const changeOwnPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.user.username;
  const isAdmin = req.user.role === 'admin';
  const oldToken = req.cookies.auth_token;

  try {
    // Validate new password
    const passwordErrors = PasswordService.validateNewPassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid password',
        detail: passwordErrors
      });
    }

    // Change password - uses the same method as admin-triggered password change
    await AuthService.changeUserPassword(username, currentPassword, newPassword, isAdmin);

    // If the user had a password reset flag, remove it after successful change
    const passwordResetKey = `user:password_reset:${username}`;
    await redisClient.del(passwordResetKey);

    // Log password change
    await authLogger.logSecurityEvent('password_change', username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      isAdmin,
      selfInitiated: true
    });

    await eventLogger.logPasswordChange(username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      isAdmin,
      selfInitiated: true,
      timestamp: new Date().toISOString()
    });

    // Create updated user object
    const user = AuthService.createUserObject(username, isAdmin);
    
    // Revoke the old token
    await revokeJwtToken(oldToken);
    
    // Generate a new token
    const tokenData = await createJwtToken(user, { expiresIn: '8h' });
    
    if (!tokenData) {
      throw new Error('Failed to create new authentication token');
    }

    // Set the new token in a cookie
    res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);
    
    res.json({ 
      message: 'Password changed successfully',
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Password change error:', error);
    
    // Log error
    await authLogger.logSecurityEvent('password_change_error', username, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      selfInitiated: true
    });

    await eventLogger.logSecurityEvent('password_change_error', username, {
      error: error.message,
      stackTrace: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      selfInitiated: true
    });

    res.status(500).json({ 
      error: 'Failed to change password',
      detail: error.message
    });
  }
};

// Google login callback handler
const googleLoginCallback = async (req, res) => {
  try {
    // User has been authenticated via Google and attached to req.user
    const user = req.user;
    
    if (!user) {
      // This shouldn't happen with proper Passport setup, but just in case
      throw new Error('No user data provided by Google authentication');
    }
    
    // IMPORTANT: Explicitly set Google-specific flags to ensure they're included in the token
    user.isGoogleSSO = true;
    user.requiresPasswordChange = false;
    
    // Store the Google SSO status in Redis for future reference
    try {
      // We'll set a flag that this user is a Google SSO user
      // This helps identify Google users even if the JWT token doesn't have the flag
      await redisClient.set(`user:${user.username}:isGoogleSSO`, 'true');
      
      // Also set a longer expiration time for Google user tokens
      // This reduces login frequency for Google users
      const extendedExpiryTime = '7d'; // 7 days instead of standard 8 hours
      
      // Make sure any existing password reset flags are removed
      const passwordResetKey = `user:password_reset:${user.username}`;
      await redisClient.del(passwordResetKey);
    } catch (redisError) {
      console.warn('Error updating Redis for Google user:', redisError);
      // Continue with authentication even if Redis operations fail
    }
    
    // Create JWT token with extended expiry for Google users
    const tokenData = await createJwtToken(user, { expiresIn: '7d' });
    
    if (!tokenData) {
      throw new Error('Failed to create authentication token');
    }
    
    // Set the JWT token in a cookie
    res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);
    
    // Log successful login
    await eventLogger.logSecurityEvent('google_login_success', user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      isGoogleSSO: true
    });
    
    // Save login info to help frontend identify Google SSO after page refreshes
    // Make sure to add this info to the redirect URL so frontend can detect it
    return res.redirect('/?auth=google');
  } catch (error) {
    console.error('Google auth callback error:', error);
    
    // Log the error
    await eventLogger.logSecurityEvent('google_login_error', 'unknown', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    // Redirect to login with error
    return res.redirect('/login?error=google_auth_failed');
  }
};

module.exports = {
  loginUser,
  logoutUser,
  getCurrentUser,
  revokeAllSessions: revokeAllUserSessions,
  changePassword,
  forcePasswordReset,
  changeOwnPassword,
  googleLoginCallback
};