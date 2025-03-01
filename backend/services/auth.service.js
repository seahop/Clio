// backend/services/auth.service.js

const crypto = require('crypto');
const security = require('../config/security');
const { redisClient } = require('../lib/redis');
const authLogger = require('../utils/auth-logger');

class AuthService {
  static async verifyCredentials(username, password) {
    let isAdmin = false;
    let isValidUser = false;
    let requiresPasswordChange = false;

    // First check if user has a custom password set (either admin or regular user)
    const customAdminPassword = await security.getAdminPassword(username);
    const customUserPassword = await security.getUserPassword(username);
    
    // If a custom password exists, ONLY check against that (not the initial password)
    if (customAdminPassword) {
      isValidUser = await security.verifyPassword(password, customAdminPassword);
      if (isValidUser) {
        isAdmin = true;
        requiresPasswordChange = false;
      }
    } else if (customUserPassword) {
      isValidUser = await security.verifyPassword(password, customUserPassword);
      if (isValidUser) {
        isAdmin = false;
        requiresPasswordChange = false;
      }
    } else {
      // No custom password exists yet, check against initial passwords
      if (await security.verifyPassword(password, security.getHashedAdminPassword())) {
        isAdmin = true;
        isValidUser = true;
        requiresPasswordChange = true;
      } else if (await security.verifyPassword(password, security.getHashedUserPassword())) {
        isAdmin = false;
        isValidUser = true;
        requiresPasswordChange = true;
      }
    }

    return { isValidUser, isAdmin, requiresPasswordChange };
  }

  static createUserObject(username, isAdmin) {
    const user = {
      id: crypto.randomBytes(16).toString('hex'),
      username,
      role: isAdmin ? 'admin' : 'user'
    };

    if (isAdmin) {
      user.adminProof = crypto.createHmac('sha256', security.ADMIN_SECRET)
        .update(username)
        .digest('hex');
    }

    return user;
  }

  static async changeUserPassword(username, currentPassword, newPassword, isAdmin) {
    let validCurrentPassword = false;

    // Check if this was a first-time login
    const isFirstTime = isAdmin 
      ? await security.isFirstTimeAdminLogin(username)
      : await security.isFirstTimeLogin(username);

    if (isFirstTime) {
      // For first-time login, verify against initial passwords
      if (isAdmin) {
        validCurrentPassword = await security.verifyPassword(currentPassword, security.getHashedAdminPassword());
      } else {
        validCurrentPassword = await security.verifyPassword(currentPassword, security.getHashedUserPassword());
      }
    } else {
      // For subsequent logins, verify against stored custom password
      const storedPassword = isAdmin 
        ? await security.getAdminPassword(username)
        : await security.getUserPassword(username);
        
      validCurrentPassword = await security.verifyPassword(currentPassword, storedPassword);
    }

    if (!validCurrentPassword) {
      throw new Error('Current password is incorrect');
    }

    // Set new password
    if (isAdmin) {
      await security.setAdminPassword(username, newPassword);
    } else {
      await security.setUserPassword(username, newPassword);
    }

    return true;
  }

  static async withRetry(operation, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        console.error(`Operation failed (${maxRetries - i - 1} retries left):`, error);
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    throw lastError;
  }

  static async logAuthEvent(eventType, username, success, metadata = {}) {
    await authLogger.logLoginAttempt(username, success, metadata);
  }
}

module.exports = AuthService;