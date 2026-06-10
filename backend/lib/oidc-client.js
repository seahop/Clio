// backend/lib/oidc-client.js
// Wraps openid-client v5 (CommonJS-compatible). Handles auto-discovery so any
// OIDC-compliant provider (Keycloak, Okta, Auth0, Azure AD, …) can be used
// by setting OIDC_ISSUER_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET.
const { Issuer } = require('openid-client');
const oidcConfig = require('../config/oidc');

let _client = null;

// Map a JWK to the signature algorithm it implies when the key doesn't carry
// an explicit `alg` member.
const algFromKey = (key) => {
  if (key.alg) return key.alg;
  if (key.kty === 'RSA') return 'RS256';
  if (key.kty === 'EC') {
    return { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' }[key.crv] || null;
  }
  if (key.kty === 'OKP') return 'EdDSA';
  return null;
};

// Determine which algorithm the provider actually signs ID tokens with.
// The discovery document's id_token_signing_alg_values_supported is an
// unordered *capability* list (Keycloak advertises ~13 entries, Auth0 lists
// HS256 first), so it only identifies the signing alg when it has exactly one
// entry. Beyond that the provider's JWKS is the better signal: the published
// signing keys are the ones ID tokens are actually verified against.
const detectIdTokenAlg = async (issuer) => {
  if (oidcConfig.idTokenAlg) {
    return { alg: oidcConfig.idTokenAlg, source: 'OIDC_ID_TOKEN_ALG' };
  }

  const supported = issuer.id_token_signing_alg_values_supported;
  if (Array.isArray(supported) && supported.length === 1) {
    return { alg: supported[0], source: 'discovery document' };
  }

  if (issuer.jwks_uri) {
    try {
      const res = await fetch(issuer.jwks_uri);
      if (res.ok) {
        const { keys = [] } = await res.json();
        const algs = [...new Set(
          keys
            .filter((k) => !k.use || k.use === 'sig')
            .map(algFromKey)
            .filter(Boolean)
        )];
        if (algs.length === 1) {
          return { alg: algs[0], source: 'provider JWKS' };
        }
        if (algs.length > 1) {
          const alg = algs.includes('RS256') ? 'RS256' : algs[0];
          console.warn(
            `OIDC provider publishes signing keys for multiple algorithms (${algs.join(', ')}); ` +
            `using ${alg}. Set OIDC_ID_TOKEN_ALG if ID-token validation fails.`
          );
          return { alg, source: 'provider JWKS (ambiguous)' };
        }
      }
    } catch (err) {
      console.warn('Could not inspect provider JWKS for the signing algorithm:', err.message);
    }
  }

  return { alg: 'RS256', source: 'default' };
};

const initializeOIDCClient = async () => {
  if (!oidcConfig.issuerUrl || !oidcConfig.clientId || !oidcConfig.clientSecret) {
    return false;
  }
  try {
    const issuer = await Issuer.discover(oidcConfig.issuerUrl);
    const { alg, source } = await detectIdTokenAlg(issuer);
    _client = new issuer.Client({
      client_id:     oidcConfig.clientId,
      client_secret: oidcConfig.clientSecret,
      redirect_uris: [oidcConfig.callbackUrl],
      response_types: ['code'],
      id_token_signed_response_alg: alg,
    });
    console.log(`OIDC client initialised (issuer: ${issuer.issuer}, alg: ${alg} via ${source})`);
    return true;
  } catch (err) {
    console.error('OIDC client initialisation failed:', err.message);
    return false;
  }
};

const getOIDCClient    = () => _client;
const isOIDCConfigured = () => _client !== null;

module.exports = { initializeOIDCClient, getOIDCClient, isOIDCConfigured };
