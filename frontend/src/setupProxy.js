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
        
        // Special handling for Google OAuth redirects
        // If the backend sends a redirect, we need to ensure it uses the frontend URL
        if (proxyRes.headers.location && 
            (req.path.includes('/auth/google') || 
             proxyRes.headers.location.includes('google.com'))) {
          
          // Log the original redirect for debugging
          if (debug) {
            console.log('[OAuth] Original redirect:', proxyRes.headers.location);
          }
          
          // Don't modify Google's own redirects
          if (proxyRes.headers.location.startsWith('https://accounts.google.com')) {
            if (debug) {
              console.log('[OAuth] Preserving Google redirect');
            }
          } 
          // Only adjust backend redirects to frontend
          else if (proxyRes.headers.location.includes('backend:3001')) {
            // Replace backend URL with frontend URL
            const frontendUrl = process.env.FRONTEND_URL || 'https://localhost:3000';
            const backendUrl = 'https://backend:3001';
            
            proxyRes.headers.location = proxyRes.headers.location.replace(
              backendUrl, 
              frontendUrl
            );
            
            if (debug) {
              console.log('[OAuth] Modified redirect:', proxyRes.headers.location);
            }
          }
        }
      },
      onProxyReq: function(proxyReq, req, res) {
        // Copy auth cookies from frontend to the backend
        if (req.headers.cookie) {
          proxyReq.setHeader('Cookie', req.headers.cookie);
        }
        
        // Log OAuth-related requests for debugging
        if (debug && req.path.includes('/auth/google')) {
          console.log('[OAuth] Proxying request:', req.method, req.path);
          console.log('[OAuth] Query params:', req.query);
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
        'Origin': process.env.FRONTEND_URL || 'https://localhost:3000',
        // Skip CSRF check by sending a special header
        'X-API-Request': 'true'
      },
      onProxyReq: function(proxyReq, req, res) {
        // Add content-type if not present
        if (!req.headers['content-type']) {
          proxyReq.setHeader('Content-Type', 'application/json');
        }
        
        // Copy any cookies from frontend to backend
        if (req.headers.cookie) {
          proxyReq.setHeader('Cookie', req.headers.cookie);
        }
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