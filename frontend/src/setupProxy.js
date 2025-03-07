// frontend/src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Enable debug logging during development
  const debug = process.env.NODE_ENV !== 'production';
  
  const logProvider = function() {
    return {
      log: (...args) => debug && console.log('[HPM]', ...args),
      debug: (...args) => debug && console.debug('[HPM]', ...args),
      info: (...args) => debug && console.info('[HPM]', ...args),
      warn: (...args) => debug && console.warn('[HPM]', ...args),
      error: (...args) => console.error('[HPM]', ...args)
    };
  };

  // Proxy requests to the backend API
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://backend:3001',
      secure: false,
      changeOrigin: true,
      cookieDomainRewrite: '',
      logProvider,
      logLevel: debug ? 'debug' : 'error',
      headers: {
        // Set the Origin header to match what the backend expects
        'Origin': process.env.FRONTEND_URL || 'https://localhost:3000'
      },
      onProxyRes: function (proxyRes, req, res) {
        // Copy cookies from backend response to frontend
        if (proxyRes.headers['set-cookie']) {
          const cookies = proxyRes.headers['set-cookie'].map(cookie => {
            return cookie.replace(/; secure/gi, '');
          });
          proxyRes.headers['set-cookie'] = cookies;
        }
      },
      onProxyReq: function(proxyReq, req, res) {
        // Copy auth cookies from frontend to the backend
        if (req.headers.cookie) {
          proxyReq.setHeader('Cookie', req.headers.cookie);
        }
      }
    })
  );

  // Proxy requests to the relation-service API
  app.use(
    '/relation-service',
    createProxyMiddleware({
      target: 'https://relation-service:3002',
      secure: false,
      changeOrigin: true,
      logProvider,
      logLevel: debug ? 'debug' : 'error',
      // Don't rewrite paths - we need to keep the 'api' part but remove 'relation-service'
      pathRewrite: {
        '^/relation-service/api': '/api', // Keep the /api part
      },
      headers: {
        // Set the Origin header to match what the relation-service expects
        'Origin': process.env.FRONTEND_URL || 'https://localhost:3000'
      },
      cookieDomainRewrite: '',
      onProxyRes: function (proxyRes, req, res) {
        // Copy cookies from relation-service response to frontend 
        if (proxyRes.headers['set-cookie']) {
          const cookies = proxyRes.headers['set-cookie'].map(cookie => {
            return cookie.replace(/; secure/gi, '');
          });
          proxyRes.headers['set-cookie'] = cookies;
        }
      },
      onProxyReq: function(proxyReq, req, res) {
        // Copy auth cookies from frontend to the relation-service
        if (req.headers.cookie) {
          proxyReq.setHeader('Cookie', req.headers.cookie);
        }
      }
    })
  );

  // Add a new proxy for the log ingestion API
  app.use(
    '/ingest',
    createProxyMiddleware({
      target: 'https://backend:3001',
      secure: false,
      changeOrigin: true,
      logProvider,
      logLevel: debug ? 'debug' : 'error',
      pathRewrite: {
        '^/ingest': '/api/ingest', // Rewrite to the backend's ingest endpoint
      },
      headers: {
        'Origin': process.env.FRONTEND_URL || 'https://localhost:3000'
      },
      onProxyRes: function (proxyRes, req, res) {
        if (proxyRes.headers['set-cookie']) {
          const cookies = proxyRes.headers['set-cookie'].map(cookie => {
            return cookie.replace(/; secure/gi, '');
          });
          proxyRes.headers['set-cookie'] = cookies;
        }
      }
    })
  );
};