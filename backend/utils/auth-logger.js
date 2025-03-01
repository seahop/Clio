// utils/authLogger.js
const fs = require('fs').promises;
const path = require('path');

class AuthLogger {
  constructor() {
    this.logPath = path.join(__dirname, '../data/auth_logs.json');
    this.ensureLogFile();
  }

  async ensureLogFile() {
    try {
      await fs.access(this.logPath);
    } catch {
      await fs.writeFile(this.logPath, JSON.stringify([], null, 2));
    }
  }

  async logEvent(event) {
    try {
      const now = new Date().toISOString();
      const logEntry = {
        timestamp: now,
        ...event,
        metadata: {
          ...event.metadata,
          serverInstanceId: global.SERVER_INSTANCE_ID
        }
      };

      // Read existing logs
      const logs = JSON.parse(await fs.readFile(this.logPath, 'utf8'));
      
      // Add new log
      logs.push(logEntry);
      
      // Keep only last 10000 logs
      const trimmedLogs = logs.slice(-10000);
      
      // Write back to file
      await fs.writeFile(this.logPath, JSON.stringify(trimmedLogs, null, 2));

      // If this is a security-critical event, also log to console
      if (event.severity === 'high' || event.type.startsWith('security_')) {
        console.error('\x1b[31m%s\x1b[0m', `SECURITY EVENT: ${JSON.stringify(logEntry)}`);
      }
    } catch (error) {
      console.error('Failed to log auth event:', error);
    }
  }

  /**
   * Log a login attempt
   */
  async logLoginAttempt(username, success, metadata = {}) {
    await this.logEvent({
      type: 'login_attempt',
      severity: success ? 'info' : 'medium',
      username,
      success,
      metadata: {
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        failureReason: metadata.failureReason
      }
    });
  }

  /**
   * Log a session event (creation, invalidation, etc)
   */
  async logSessionEvent(type, username, sessionId, metadata = {}) {
    await this.logEvent({
      type: `session_${type}`,
      severity: 'info',
      username,
      sessionId,
      metadata
    });
  }

  /**
   * Log a security event (password changes, role changes, etc)
   */
  async logSecurityEvent(type, username, metadata = {}) {
    await this.logEvent({
      type: `security_${type}`,
      severity: 'high',
      username,
      metadata
    });
  }

  /**
   * Log an admin action
   */
  async logAdminAction(action, adminUsername, affectedUsername = null, metadata = {}) {
    await this.logEvent({
      type: `admin_${action}`,
      severity: 'high',
      adminUsername,
      affectedUsername,
      metadata
    });
  }
}

// Create singleton instance
const authLogger = new AuthLogger();

module.exports = authLogger;