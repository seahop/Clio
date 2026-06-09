// backend/controllers/oidc.controller.js
// Handles the generic OIDC authorization-code flow without Passport's session
// requirement. State and nonce are stored in Redis (10-minute TTL) and the
// state value is echoed back via a short-lived httpOnly cookie so the callback
// can verify it without needing express-session.
const { generators } = require('openid-client');
const { getOIDCClient, isOIDCConfigured } = require('../lib/oidc-client');
const oidcConfig  = require('../config/oidc');
const AuthService = require('../services/auth.service');
const eventLogger = require('../lib/eventLogger');
const { redisClient }   = require('../lib/redis');
const { createJwtToken } = require('../middleware/jwt.middleware');
const { SESSION_OPTIONS } = require('../config/constants');

const OIDC_STATE_TTL = 600; // 10 minutes — enough for the user to log in at the provider

// ── Initiate ────────────────────────────────────────────────────────────────
const oidcInitiate = async (req, res) => {
  if (!isOIDCConfigured()) {
    return res.status(503).json({ error: 'OIDC not configured' });
  }
  try {
    const client = getOIDCClient();
    const state  = generators.state();
    const nonce  = generators.nonce();

    // Persist nonce keyed by state so the callback can retrieve it
    await redisClient.setEx(`oidc:state:${state}`, OIDC_STATE_TTL, nonce);

    // SameSite=Lax is required: the browser must include this cookie when the
    // OIDC provider redirects back to our callback (a cross-site top-level GET).
    // SameSite=Strict would block the cookie on that redirect.
    res.cookie('oidc_state', state, {
      httpOnly: true,
      secure:   true,
      sameSite: 'lax',
      maxAge:   OIDC_STATE_TTL * 1000,
    });

    const redirectUrl = client.authorizationUrl({
      scope: oidcConfig.scope,
      state,
      nonce,
    });

    res.redirect(redirectUrl);
  } catch (err) {
    console.error('OIDC initiate error:', err);
    res.redirect('/login?error=oidc_auth_failed');
  }
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const findUserByOIDCSub = async (sub) => {
  const username = await redisClient.get(`oidc:${sub}`);
  return username ? { username } : null;
};

const createOIDCUser = async (sub, email, proposedUsername) => {
  // Sanitize first, then use that sanitized base for ALL variants (including
  // counter suffixes). Using the raw proposedUsername in the counter loop
  // would produce names like "john.doe1" (dot preserved) when the first-try
  // sanitized form "john_doe" collides with an existing account.
  const sanitizedBase = proposedUsername.replace(/[^a-zA-Z0-9_-]/g, '_');
  let username = sanitizedBase;
  let counter  = 1;

  while (await redisClient.exists(`user:${username}:exists`)) {
    username = `${sanitizedBase}${counter++}`;
  }

  await redisClient.set(`oidc:${sub}`,                username);
  await redisClient.set(`user:${username}:oidcSub`,   sub);
  await redisClient.set(`user:${username}:email`,     email);
  await redisClient.set(`user:${username}:isOIDCSSO`, 'true');
  await redisClient.set(`user:${username}:exists`,    'true');

  return username;
};

// ── Callback ────────────────────────────────────────────────────────────────
const oidcCallback = async (req, res) => {
  if (!isOIDCConfigured()) {
    return res.redirect('/login?error=oidc_auth_failed');
  }
  try {
    const client        = getOIDCClient();
    const cookieState   = req.cookies.oidc_state;
    const returnedState = req.query.state;

    res.clearCookie('oidc_state');

    // Provider returned an error (e.g. user denied consent)
    if (req.query.error) {
      console.error('OIDC provider error:', req.query.error, req.query.error_description);
      return res.redirect('/login?error=oidc_auth_failed');
    }

    // Verify state to guard against CSRF in the OAuth flow
    if (!cookieState || cookieState !== returnedState) {
      console.error('OIDC state mismatch');
      return res.redirect('/login?error=oidc_auth_failed');
    }

    const nonce = await redisClient.get(`oidc:state:${cookieState}`);
    if (!nonce) {
      console.error('OIDC state not found or expired');
      return res.redirect('/login?error=oidc_auth_failed');
    }
    await redisClient.del(`oidc:state:${cookieState}`);

    // Exchange code for tokens and validate nonce
    const params   = client.callbackParams(req);
    const tokenSet = await client.callback(oidcConfig.callbackUrl, params, {
      state: cookieState,
      nonce,
    });

    const claims       = tokenSet.claims();
    const sub          = claims.sub;
    const email        = claims.email || `${sub}@oidc`;
    const displayName  = claims.name || claims.preferred_username || email.split('@')[0];
    const baseUsername = (claims.preferred_username || email.split('@')[0]);

    if (!sub) {
      console.error('No sub claim in OIDC ID token');
      return res.redirect('/login?error=oidc_auth_failed');
    }

    const existing = await findUserByOIDCSub(sub);
    let username;

    if (existing) {
      username = existing.username;
    } else {
      username = await createOIDCUser(sub, email, baseUsername);
      await eventLogger.logSecurityEvent('oidc_account_created', username, {
        sub,
        email,
        providerName: oidcConfig.providerName,
        isAdmin: false,
      });
    }

    // OIDC users never go through the password-change flow
    await redisClient.del(`user:password_reset:${username}`);

    const user = AuthService.createUserObject(username, false);
    user.email       = email;
    user.displayName = displayName;
    user.oidcSub     = sub;
    user.isOIDCSSO   = true;
    user.requiresPasswordChange = false;

    const tokenData = await createJwtToken(user, { expiresIn: '7d' });
    if (!tokenData) throw new Error('Failed to create JWT');

    res.cookie('token',      tokenData.token, SESSION_OPTIONS);
    res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);

    await eventLogger.logSecurityEvent('oidc_login_success', username, {
      ip:          req.ip,
      userAgent:   req.get('User-Agent'),
      providerName: oidcConfig.providerName,
      isOIDCSSO:   true,
    });

    res.redirect('/?auth=oidc');
  } catch (err) {
    console.error('OIDC callback error:', err);
    await eventLogger.logSecurityEvent('oidc_login_error', 'unknown', {
      error:     err.message,
      ip:        req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.redirect('/login?error=oidc_auth_failed');
  }
};

module.exports = { oidcInitiate, oidcCallback };
