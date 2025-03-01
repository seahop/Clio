// backend/config/security.config.js

const helmet = require('helmet');

const securityConfig = {
  // Content Security Policy configuration
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for React in development
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      formAction: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      // Additional CSP directives
      baseUri: ["'self'"], // Restricts base URI
      frameAncestors: ["'none'"], // Prevents clickjacking
      manifestSrc: ["'self'"], // Restricts manifest files
      sandboxExceptions: ['allow-forms', 'allow-same-origin', 'allow-scripts'], // Sandbox exceptions
      upgradeInsecureRequests: true, // Upgrades HTTP to HTTPS
      blockAllMixedContent: true // Blocks mixed content
    }
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  },

  // Special rate limiting for authentication routes
  authRateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  },

  // Cookie security options
  cookieOptions: {
    httpOnly: true,
    secure: true, // Always use secure cookies with HTTPS
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
    secureProxy: true
  },

  // CORS configuration
  corsOptions: {
    origin: process.env.FRONTEND_URL || 'https://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'CSRF-Token'
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 204
  },

  // Helmet configuration with enhanced security headers
  getHelmetConfig: () => ({
    contentSecurityPolicy: {
      directives: securityConfig.csp.directives
    },
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    dnsPrefetchControl: { allow: false },
    expectCt: {
      enforce: true,
      maxAge: 30,
      reportUri: process.env.EXPECT_CT_REPORT_URI
    },
    frameguard: { 
      action: 'deny' 
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { 
      policy: ['no-referrer', 'strict-origin-when-cross-origin']
    },
    xssFilter: true,
    // Additional security headers
    customHeaders: {
      'X-Permitted-Cross-Domain-Policies': 'none',
      'X-Content-Type-Options': 'nosniff',
      'X-Download-Options': 'noopen',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Permissions-Policy': `
        document-domain=(),
        sync-xhr=()
      `.replace(/\s+/g, ' ').trim(),
      'Clear-Site-Data': '"cache","cookies","storage"',
      'Cache-Control': 'no-store, max-age=0',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    }
  })
};

module.exports = securityConfig;