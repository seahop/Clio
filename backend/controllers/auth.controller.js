// backend/controllers/auth.controller.js
const AuthService = require('../services/auth.service');
const PasswordService = require('../services/password.service');
const authLogger = require('../utils/auth-logger');
const eventLogger = require('../lib/eventLogger');
const security = require('../config/security');
const { SESSION_OPTIONS } = require('../config/constants');
const { createJwtToken, revokeJwtToken, revokeAllTokens } = require('../middleware/jwt.middleware');

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
      const user = AuthService.createUserObject(sanitizedUsername, isAdmin);

      // Generate JWT token
      const tokenData = await createJwtToken(user, { expiresIn: '8h' });
      
      if (!tokenData) {
        throw new Error('Failed to create authentication token');
      }

      // Log successful login
      await AuthService.logAuthEvent('login', sanitizedUsername, true, {
        ...clientInfo,
        role: user.role
      });

      await eventLogger.logLogin(sanitizedUsername, true, {
        ...clientInfo,
        role: user.role,
        requiresPasswordChange,
        tokenId: tokenData.jti.substring(0, 8) // Log only first 8 chars for security
      });

      // Set the JWT token in a secure cookie
      res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);
      
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

    // Log password change
    await authLogger.logSecurityEvent('password_change', username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      isAdmin
    });

    await eventLogger.logPasswordChange(username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      isAdmin,
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
    
    // Revoke the token
    await revokeJwtToken(token);

    // Log logout event
    await eventLogger.logSecurityEvent('logout', req.user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Clear the cookie
    res.clearCookie('auth_token', SESSION_OPTIONS);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);

    await eventLogger.logSecurityEvent('logout_error', req.user?.username, {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

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

    const isFirstTime = isAdmin 
      ? await security.isFirstTimeAdminLogin(username)
      : await security.isFirstTimeLogin(username);

    // Log user check event
    await eventLogger.logSecurityEvent('user_check', username, {
      isFirstTime,
      isAdmin,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (isFirstTime) {
      return res.status(401).json({
        error: 'Password change required',
        requiresPasswordChange: true,
        username: req.user.username,
        role: req.user.role
      });
    }

    res.json({
      username: req.user.username,
      role: req.user.role
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

module.exports = {
  loginUser,
  logoutUser,
  getCurrentUser,
  revokeAllSessions: revokeAllUserSessions,
  changePassword
};