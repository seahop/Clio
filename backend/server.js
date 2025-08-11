const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { connectRedis, redisClient } = require('./lib/redis');
const { PORT } = require('./config/constants');
const security = require('./config/security');
const authRoutes = require('./routes/auth.routes');
const logsRoutes = require('./routes/logs.routes');
const tagsRoutes = require('./routes/tags.routes'); // NEW: Tags routes
const exportRoutes = require('./routes/export.routes');
const eventLogger = require('./lib/eventLogger');
const logRotationManager = require('./lib/logRotation');
const sessionRoutes = require('./routes/session.routes');
const evidenceRoutes = require('./routes/evidence.routes');
const apiKeyRoutes = require('./routes/api-key.routes');
const ingestRoutes = require('./routes/ingest.routes');
const { errorMiddleware, notFoundMiddleware } = require('./middleware/error.middleware');
const { csrfProtection, csrfTokenEndpoint } = require('./middleware/csrf.middleware');
const { authenticateJwt, verifyAdmin } = require('./middleware/jwt.middleware');
const db = require('./db');
const url = require('url');
const passport = require('passport');
const { initializeGoogleSSO } = require('./lib/passport-google');
const templatesRoutes = require('./routes/templates.routes');

const app = express();

app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal', '172.16.0.0/12']);

// Set serverInstanceId for global access
app.set('serverInstanceId', security.SERVER_INSTANCE_ID);

// Middleware setup
app.use(bodyParser.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(passport.initialize());

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  initializeGoogleSSO();
  console.log('Google SSO initialized');
} else {
  console.log('Google SSO not configured - skipping initialization');
}

// Enhanced CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Get allowed origins: FRONTEND_URL and derive alternatives
    const frontendUrl = process.env.FRONTEND_URL || 'https://localhost:3000';
    const frontendHostname = process.env.HOSTNAME || 'localhost';
    
    // Create an array of allowed origins
    const allowedOrigins = [
      frontendUrl,                         // The configured frontend URL
      `https://localhost:3000`,            // Standard localhost
      `https://${frontendHostname}:3000`,  // The hostname-based URL
      'https://frontend:3000',             // Docker service name
      'https://backend:3001',              // Allow backend self-requests
      undefined,                           // Allow requests with no origin (like curl or Postman)
      null                                 // null origin (same-origin requests)
    ];
    
    // For development, add additional debug info
    if (process.env.NODE_ENV === 'development') {
      console.log('CORS request from origin:', origin);
      console.log('Allowed origins:', allowedOrigins);
    }
    
    // THE KEY FIX IS HERE - using "includes" instead of checking for an exact match
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Origin is allowed
    } else {
      console.warn(`CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'CSRF-Token', 'Accept', 'X-CSRF-Token'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Enhanced security headers with fixed Helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      formAction: ["'self'"]
    },
    reportOnly: false
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
}));

// Modified CSRF protection to skip ingest API routes
app.use((req, res, next) => {
  // Skip CSRF protection for ingest API routes
  if (req.path.startsWith('/api/ingest') || req.headers['x-api-request'] === 'true') {
    return next();
  }
  
  // Apply CSRF protection to all other routes
  csrfProtection()(req, res, next);
});

// Add minimal logging for health checks and CSRF token requests
app.use((req, res, next) => {
  // Skip verbose logging for health checks and common endpoints
  if (req.path === '/api/csrf-token' || req.path.includes('/health') || req.path === '/ping') {
    // For frequent endpoints, log only once per minute
    const now = new Date();
    const minutes = now.getMinutes();
    
    if (req.path === '/api/csrf-token' && (!app.locals.lastCsrfMinute || app.locals.lastCsrfMinute !== minutes)) {
      console.log(`${now.toISOString()} - CSRF token request received`);
      app.locals.lastCsrfMinute = minutes;
    }
  }
  next();
});

// HTTPS options
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'backend.key')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'backend.crt')),
  minVersion: 'TLSv1.2'
};

// Ensure exports directory exists
const ensureExportsDir = async () => {
  try {
    const exportsDir = path.join(__dirname, 'exports');
    await fs.promises.access(exportsDir);
    console.log('Exports directory exists');
  } catch (error) {
    console.log('Creating exports directory');
    await fs.promises.mkdir(path.join(__dirname, 'exports'), { recursive: true });
  }
};

// Routes
app.get('/api/csrf-token', csrfTokenEndpoint);

if (process.env.NODE_ENV === 'development') {
  app.get('/api/debug/csrf-status', (req, res) => {
    const cookieToken = req.cookies._csrf;
    res.json({
      hasCsrfCookie: !!cookieToken,
      cookieTokenPreview: cookieToken ? `${cookieToken.substring(0, 8)}...` : null,
      csrfToken: req.csrfToken ? `${req.csrfToken.substring(0, 8)}...` : null,
      cookiesReceived: Object.keys(req.cookies),
      csrfHeaderName: 'CSRF-Token or X-CSRF-Token',
      serverTime: new Date().toISOString()
    });
  });
}

// Add a debug endpoint for exports
app.get('/api/debug/exports', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    const exportsDir = path.join(__dirname, 'exports');
    const files = await fs.promises.readdir(exportsDir);
    
    const fileDetails = await Promise.all(files.map(async (file) => {
      const filePath = path.join(exportsDir, file);
      const stats = await fs.promises.stat(filePath);
      return {
        name: file,
        size: stats.size,
        path: `/exports/${file}`,
        fullPath: filePath,
        exists: true
      };
    }));
    
    res.json({ 
      exportsDir,
      files: fileDetails,
      baseUrl: req.protocol + '://' + req.get('host')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/tags', tagsRoutes); // NEW: Tags API routes
app.use('/api/log-access', require('./routes/logs-access.routes'));
app.use('/api/export', exportRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/logs/s3-config', require('./routes/s3-config.routes'));
app.use('/api/health/logs', require('./routes/logs-health.routes'));
app.use('/api/templates', templatesRoutes);
app.use('/api/certificates', require('./routes/certificates.routes'));

// Important change: Serve exports WITHOUT authentication
app.use('/exports', express.static(path.join(__dirname, 'exports')));

// Health check endpoint with log status
app.get('/api/health/logs', async (req, res) => {
  try {
    // Get log file statuses
    const logFiles = ['security_logs.json', 'data_logs.json', 'system_logs.json', 'audit_logs.json'];
    const logStatuses = await Promise.all(logFiles.map(async (fileName) => {
      const filePath = path.join(__dirname, 'data', fileName);
      
      try {
        const stats = await fs.promises.stat(filePath);
        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        let logs = [];
        
        try {
          logs = JSON.parse(fileContent);
        } catch (error) {
          return {
            file: fileName,
            status: 'corrupted',
            error: error.message,
            size: stats.size,
            lastModified: stats.mtime
          };
        }
        
        return {
          file: fileName,
          status: 'ok',
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size),
          lastModified: stats.mtime,
          logCount: Array.isArray(logs) ? logs.length : 'invalid',
          percentFull: Array.isArray(logs) ? Math.round((logs.length / logRotationManager.maxLogsPerFile) * 100) : 0
        };
      } catch (error) {
        return {
          file: fileName,
          status: 'error',
          error: error.message
        };
      }
    }));
    
    // Get archive information
    const archiveDir = path.join(__dirname, 'data', 'archives');
    let archives = [];
    
    try {
      await fs.promises.access(archiveDir);
      const archiveFiles = await fs.promises.readdir(archiveDir);
      
      // Get stats for zip files only
      const archiveStats = await Promise.all(
        archiveFiles
          .filter(file => file.endsWith('.zip'))
          .map(async (file) => {
            const filePath = path.join(archiveDir, file);
            const stats = await fs.promises.stat(filePath);
            return {
              file,
              size: stats.size,
              sizeFormatted: formatFileSize(stats.size),
              created: stats.mtime
            };
          })
      );
      
      archives = archiveStats.sort((a, b) => b.created - a.created);
    } catch (error) {
      console.error('Error reading archives:', error);
    }
    
    // Get log rotation information
    const logRotationInfo = {
      isInitialized: logRotationManager.isInitialized,
      rotationInterval: logRotationManager.rotationInterval,
      rotationIntervalFormatted: formatDuration(logRotationManager.rotationInterval),
      maxLogsPerFile: logRotationManager.maxLogsPerFile
    };
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      logs: logStatuses,
      archives: archives.slice(0, 10), // Show only the 10 most recent archives
      totalArchives: archives.length,
      logRotation: logRotationInfo,
      features: {
        tags: true // NEW: Indicate tags support
      }
    });
  } catch (error) {
    console.error('Error getting log status:', error);
    res.status(500).json({ error: 'Failed to get log status' });
  }
});

// Route to manually trigger log rotation (admin only)
app.post('/api/logs/rotate', authenticateJwt, verifyAdmin, async (req, res) => {
  try {
    // Log the manual rotation trigger
    await eventLogger.logAuditEvent('manual_log_rotation', req.user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    // Force rotation of all logs
    const result = await logRotationManager.forceRotation();
    
    res.json({
      success: true,
      message: 'Log rotation triggered successfully',
      result
    });
  } catch (error) {
    console.error('Error triggering log rotation:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to trigger log rotation',
      message: error.message
    });
  }
});

// Helper functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

// Error handling
app.use(errorMiddleware);
app.use(notFoundMiddleware);

// Wait for Redis function
async function waitForRedis(maxRetries = 30, interval = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (!redisClient.isReady) {
        await connectRedis();
      }
      
      await redisClient.set('test_key', 'test_value');
      await redisClient.del('test_key');
      
      await eventLogger.logSystemEvent('redis_connection', {
        status: 'connected',
        attempt: i + 1
      });

      console.log('Redis connection verified');
      return true;
    } catch (error) {
      console.log(`Waiting for Redis... attempt ${i + 1}/${maxRetries}`);
      
      await eventLogger.logSystemEvent('redis_connection_attempt', {
        status: 'failed',
        attempt: i + 1,
        error: error.message
      });

      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  throw new Error('Redis connection timeout');
}

// Wait for Database function
async function waitForDatabase(maxRetries = 30, interval = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const connected = await db.testConnection();
      if (connected) {
        // Verify SSL if enabled
        if (process.env.POSTGRES_SSL === 'true') {
          const sslEnabled = await db.testSslConnection();
          if (!sslEnabled) {
            console.warn('PostgreSQL SSL is enabled but not activated on the server!');
            await eventLogger.logSystemEvent('database_ssl_warning', {
              status: 'SSL not enabled on PostgreSQL server',
              attempt: i + 1
            });
          } else {
            console.log('PostgreSQL SSL connection verified');
          }
        }
        
        await eventLogger.logSystemEvent('database_connection', {
          status: 'connected',
          attempt: i + 1,
          ssl: process.env.POSTGRES_SSL === 'true'
        });

        console.log('Database connection verified');
        return true;
      }
    } catch (error) {
      console.log(`Waiting for Database... attempt ${i + 1}/${maxRetries}`);
      
      await eventLogger.logSystemEvent('database_connection_attempt', {
        status: 'failed',
        attempt: i + 1,
        error: error.message
      });

      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  throw new Error('Database connection timeout');
}

// Initialize function
async function initialize() {
  try {
    await security.initialize();
    console.log('Security initialized');
    
    await eventLogger.logSystemEvent('security_initialization', {
      status: 'success',
      serverInstanceId: security.SERVER_INSTANCE_ID
    });
    
    // Initialize log rotation system
    await logRotationManager.initialize();
    console.log('Log rotation system initialized');
    
    // Ensure exports directory exists
    await ensureExportsDir();
    
    await waitForRedis();
    console.log('Redis connection established');
    
    await waitForDatabase();
    console.log('Database connection established');
    
    // Create HTTPS server
    const server = https.createServer(httpsOptions, app);
    
    server.listen(PORT, () => {
      console.log(`Secure server running on port ${PORT}`);
      console.log('\x1b[36m%s\x1b[0m', `Server Instance ID: ${security.SERVER_INSTANCE_ID}`);
      
      // NEW: Enhanced startup message with tags
      console.log('\n╔════════════════════════════════════════════════╗');
      console.log('║                                                ║');
      console.log('║        Red Team Logger Backend Server          ║');
      console.log('║                                                ║');
      console.log(`║  🚀 HTTPS Server running on port ${PORT}          ║`);
      console.log(`║  🔐 Environment: ${process.env.NODE_ENV || 'development'}               ║`);
      console.log('║  📊 Redis: Connected                           ║');
      console.log('║  🗄️  Database: Connected                       ║');
      console.log('║  🏷️  Tags: Enabled                             ║'); // NEW
      console.log('║  📁 Evidence: Enabled                          ║');
      console.log('║  📦 Export: Enabled                            ║');
      console.log('║  🔑 API Keys: Enabled                          ║');
      console.log('║  📝 Templates: Enabled                         ║');
      console.log('║                                                ║');
      console.log('╚════════════════════════════════════════════════╝\n');
      
      eventLogger.logSystemEvent('server_start', {
        port: PORT,
        serverInstanceId: security.SERVER_INSTANCE_ID,
        nodeEnv: process.env.NODE_ENV,
        sslEnabled: true,
        dbSslEnabled: process.env.POSTGRES_SSL === 'true',
        jwtEnabled: true,
        tagsEnabled: true // NEW
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\x1b[33m%s\x1b[0m', `API URL: https://localhost:${PORT}`);
        console.log('\x1b[33m%s\x1b[0m', `Frontend URL: ${process.env.FRONTEND_URL || 'https://localhost:3000'}`);
        console.log('\x1b[33m%s\x1b[0m', '\nAvailable endpoints:');
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/health`);
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/csrf-token`);
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/logs`);
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/tags`); // NEW
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/evidence`);
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/export`);
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/templates`);
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/api-keys`);
        console.log('\x1b[33m%s\x1b[0m', `  - https://localhost:${PORT}/api/ingest`);
      }
    });

    // Handle server shutdown
    process.on('SIGTERM', async () => {
      // Stop log rotation
      logRotationManager.stop();
      
      await eventLogger.logSystemEvent('server_shutdown', {
        reason: 'SIGTERM',
        serverInstanceId: security.SERVER_INSTANCE_ID
      });
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      // Stop log rotation
      logRotationManager.stop();
      
      await eventLogger.logSystemEvent('server_shutdown', {
        reason: 'SIGINT',
        serverInstanceId: security.SERVER_INSTANCE_ID
      });
      process.exit(0);
    });

  } catch (error) {
    console.error('Server initialization failed:', error);
    
    await eventLogger.logSystemEvent('server_initialization_failed', {
      error: error.message,
      stack: error.stack
    });

    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  
  await eventLogger.logSystemEvent('uncaught_exception', {
    error: error.message,
    stack: error.stack
  });

  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  
  await eventLogger.logSystemEvent('unhandled_rejection', {
    error: reason?.message || 'Unknown reason',
    stack: reason?.stack
  });

  process.exit(1);
});

// Start the application
initialize().catch(async error => {
  console.error('Failed to start server:', error);
  
  await eventLogger.logSystemEvent('initialization_error', {
    error: error.message,
    stack: error.stack
  });

  process.exit(1);
});