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
  // Override the ID-token signing algorithm. When unset, the value is read
  // from the provider's discovery document (id_token_signing_alg_values_supported).
  // Set this if auto-detection picks the wrong algorithm.
  idTokenAlg:   process.env.OIDC_ID_TOKEN_ALG || null,
  // Group-based role assignment via the 'groups' claim.
  // When the provider includes a groups claim, users must belong to one of
  // these groups. Admin takes precedence over user. Users in neither group are
  // denied login. When no groups claim is present, users get the regular role.
  adminGroup:   process.env.OIDC_ADMIN_GROUP || 'clio-admin',
  userGroup:    process.env.OIDC_USER_GROUP  || 'clio-user',
};
