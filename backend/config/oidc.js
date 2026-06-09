// backend/config/oidc.js
module.exports = {
  issuerUrl:    process.env.OIDC_ISSUER_URL,
  clientId:     process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  // Default assumes nginx terminates TLS and forwards /api/* to the backend
  callbackUrl:  process.env.OIDC_CALLBACK_URL || 'https://localhost/api/auth/oidc/callback',
  // Human-readable name shown on the login button
  providerName: process.env.OIDC_PROVIDER_NAME || 'SSO',
  scope:        process.env.OIDC_SCOPE || 'openid email profile',
};
