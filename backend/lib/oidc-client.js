// backend/lib/oidc-client.js
// Wraps openid-client v5 (CommonJS-compatible). Handles auto-discovery so any
// OIDC-compliant provider (Keycloak, Okta, Auth0, Azure AD, …) can be used
// by setting OIDC_ISSUER_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET.
const { Issuer } = require('openid-client');
const oidcConfig = require('../config/oidc');

let _client = null;

const initializeOIDCClient = async () => {
  if (!oidcConfig.issuerUrl || !oidcConfig.clientId || !oidcConfig.clientSecret) {
    return false;
  }
  try {
    const issuer = await Issuer.discover(oidcConfig.issuerUrl);
    _client = new issuer.Client({
      client_id:     oidcConfig.clientId,
      client_secret: oidcConfig.clientSecret,
      redirect_uris: [oidcConfig.callbackUrl],
      response_types: ['code'],
    });
    console.log(`OIDC client initialised (issuer: ${issuer.issuer})`);
    return true;
  } catch (err) {
    console.error('OIDC client initialisation failed:', err.message);
    return false;
  }
};

const getOIDCClient    = () => _client;
const isOIDCConfigured = () => _client !== null;

module.exports = { initializeOIDCClient, getOIDCClient, isOIDCConfigured };
