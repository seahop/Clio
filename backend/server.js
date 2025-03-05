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
const exportRoutes = require('./routes/export.routes');
const eventLogger = require('./lib/eventLogger');
const sessionRoutes = require('./routes/session.routes');
const evidenceRoutes = require('./routes/evidence.routes');
const { errorMiddleware, notFoundMiddleware } = require('./middleware/error.middleware');
const { csrfProtection, csrfTokenEndpoint } = require('./middleware/csrf.middleware');
const db = require('./db');
const url = require('url');

const app = express();

app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal', '172.16.0.0/12']);

// Set serverInstanceId for global access
app.set('serverInstanceId', security.SERVER_INSTANCE_ID);

// Middleware setup
app.use(bodyParser.json({ limit: '1mb' }));
app.use(cookieParser());

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

// Add enhanced CSRF protection
app.use(csrfProtection());

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

app.use('/api/auth', authRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/log-access', require('./routes/logs-access.routes'));
app.use('/api/export', exportRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/evidence', evidenceRoutes);

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
    
    await waitForRedis();
    console.log('Redis connection established');
    
    await waitForDatabase();
    console.log('Database connection established');
    
    // Create HTTPS server
    const server = https.createServer(httpsOptions, app);
    
    server.listen(PORT, () => {
      console.log(`Secure server running on port ${PORT}`);
      console.log('\x1b[36m%s\x1b[0m', `Server Instance ID: ${security.SERVER_INSTANCE_ID}`);
      
      eventLogger.logSystemEvent('server_start', {
        port: PORT,
        serverInstanceId: security.SERVER_INSTANCE_ID,
        nodeEnv: process.env.NODE_ENV,
        sslEnabled: true,
        dbSslEnabled: process.env.POSTGRES_SSL === 'true',
        jwtEnabled: true
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\x1b[33m%s\x1b[0m', `API URL: https://localhost:${PORT}`);
        console.log('\x1b[33m%s\x1b[0m', `Frontend URL: ${process.env.FRONTEND_URL || 'https://localhost:3000'}`);
      }
    });

    // Handle server shutdown
    process.on('SIGTERM', async () => {
      await eventLogger.logSystemEvent('server_shutdown', {
        reason: 'SIGTERM',
        serverInstanceId: security.SERVER_INSTANCE_ID
      });
      process.exit(0);
    });

    process.on('SIGINT', async () => {
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