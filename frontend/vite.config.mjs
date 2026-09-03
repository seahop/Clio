import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// The backend serves self-signed TLS on the internal Docker network.
const BACKEND = 'https://backend:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://localhost:3000';

// HTTPS dev server using the certs mounted into the container. Falls back to
// plain HTTP when the certs are absent (e.g. a bare `vite` run on a laptop).
function httpsConfig() {
  try {
    const cert = process.env.SSL_CRT_FILE || '/app/certs/server.crt';
    const key = process.env.SSL_KEY_FILE || '/app/certs/server.key';
    if (fs.existsSync(cert) && fs.existsSync(key)) {
      return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
    }
  } catch (_) {
    /* fall through to http */
  }
  return undefined;
}

// Shared proxy behaviour (mirrors the old CRA setupProxy.js): reach the backend
// over its self-signed TLS, forward the Origin, strip "; Secure" from Set-Cookie
// so the browser keeps auth cookies on the dev origin, and rewrite backend→
// frontend redirect Locations so the SSO round-trip lands back on the UI.
function makeProxy(extra = {}) {
  return {
    target: BACKEND,
    changeOrigin: true,
    secure: false,
    cookieDomainRewrite: '',
    headers: { Origin: FRONTEND_URL, ...(extra.headers || {}) },
    rewrite: extra.rewrite,
    configure: (proxy) => {
      proxy.on('proxyRes', (proxyRes) => {
        const sc = proxyRes.headers['set-cookie'];
        if (sc) {
          proxyRes.headers['set-cookie'] = sc.map((c) => c.replace(/; secure/gi, ''));
        }
        const loc = proxyRes.headers.location;
        if (loc && loc.includes('backend:3001')) {
          proxyRes.headers.location = loc.replace('https://backend:3001', FRONTEND_URL);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    https: httpsConfig(),
    proxy: {
      '/api': makeProxy(),
      '/exports': makeProxy(),
      '/archives': makeProxy(),
      // Legacy path prefix kept for backward-compat: /relation-service/api/* → /api/*
      '/relation-service': makeProxy({
        rewrite: (p) => p.replace(/^\/relation-service\/api/, '/api'),
      }),
      // Log ingestion helper: /ingest → /api/ingest (CSRF-exempt via header)
      '/ingest': makeProxy({
        rewrite: (p) => p.replace(/^\/ingest/, '/api/ingest'),
        headers: { 'X-API-Request': 'true' },
      }),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
