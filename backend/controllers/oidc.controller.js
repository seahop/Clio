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
const { completeLoginRedirect } = require('../lib/ssoRedirect');

const OIDC_STATE_TTL = 600; // 10 minutes — enough for the user to log in at the provider
// The oidc_state cookie holds up to this many pending states (joined with '|')
// so logins started in parallel tabs don't invalidate each other.
const MAX_PENDING_STATES = 5;

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
    const pending = (req.cookies.oidc_state || '').split('|').filter(Boolean);
    pending.push(state);
    res.cookie('oidc_state', pending.slice(-MAX_PENDING_STATES).join('|'), {
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

// Returns true (admin), false (regular user), or null (denied).
// null is returned for two cases: missing groups claim, or groups present but
// user isn't in any allowed group. Callers distinguish them by checking whether
// groups is null/non-array.
const resolveOIDCRole = (groups) => {
  if (!Array.isArray(groups)) return null;
  if (groups.includes(oidcConfig.adminGroup)) return true;
  if (groups.includes(oidcConfig.userGroup))  return false;
  return null;
};

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

  while (await redisClient.exists(
    `user:${username}:exists`,
    `admin:password:${username}`,
    `user:password:${username}`
  )) {
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
    const pendingStates = (req.cookies.oidc_state || '').split('|').filter(Boolean);
    const returnedState = req.query.state;

    // Provider returned an error (e.g. user denied consent)
    if (req.query.error) {
      console.error('OIDC provider error:', req.query.error, req.query.error_description);
      return res.redirect('/login?error=oidc_auth_failed');
    }

    // Verify state to guard against CSRF in the OAuth flow. The cookie may
    // hold several pending states (parallel tabs); consume only the one this
    // callback returns so the other tabs' logins can still complete.
    //
    // The cookie check is best-effort: it is skipped when the cookie is absent
    // (e.g. the user opened the login page via a different hostname than the one
    // in OIDC_CALLBACK_URL, so the cookie was scoped to a different origin).
    // Security still holds because the state value is verified against Redis —
    // it is 256-bit random, has a 10-minute TTL, and is deleted after first use.
    if (!returnedState) {
      console.error('OIDC callback missing state parameter');
      return res.redirect('/login?error=oidc_auth_failed');
    }
    if (pendingStates.length > 0 && !pendingStates.includes(returnedState)) {
      console.error('OIDC state mismatch (cookie present but state not found)');
      return res.redirect('/login?error=oidc_auth_failed');
    }
    const remainingStates = pendingStates.filter((s) => s !== returnedState);
    if (remainingStates.length) {
      res.cookie('oidc_state', remainingStates.join('|'), {
        httpOnly: true,
        secure:   true,
        sameSite: 'lax',
        maxAge:   OIDC_STATE_TTL * 1000,
      });
    } else {
      res.clearCookie('oidc_state');
    }

    const nonce = await redisClient.get(`oidc:state:${returnedState}`);
    if (!nonce) {
      console.error('OIDC state not found or expired');
      return res.redirect('/login?error=oidc_auth_failed');
    }
    await redisClient.del(`oidc:state:${returnedState}`);

    // Exchange code for tokens and validate nonce
    const params   = client.callbackParams(req);
    const tokenSet = await client.callback(oidcConfig.callbackUrl, params, {
      state: returnedState,
      nonce,
    });

    // sub comes from the ID token — the correct token for authenticating the user.
    // Profile claims (email, name) come from the UserInfo endpoint via the access
    // token; the ID token is only authoritative for identity, not profile data.
    const idClaims = tokenSet.claims();
    const sub      = idClaims.sub;

    let profile = idClaims;
    try {
      profile = await client.userinfo(tokenSet);
    } catch (err) {
      console.warn('OIDC UserInfo endpoint unavailable, falling back to ID token claims:', err.message);
    }

    const email        = profile.email || `${sub}@oidc`;
    const displayName  = profile.name || profile.preferred_username || email.split('@')[0];
    const baseUsername = (profile.preferred_username || email.split('@')[0]);

    if (!sub) {
      console.error('No sub claim in OIDC ID token');
      return res.redirect('/login?error=oidc_auth_failed');
    }

    // Resolve role from the groups claim (present in both userinfo and ID token paths).
    // Admin group takes precedence. null means the user is in neither allowed group.
    const groups  = Array.isArray(profile.groups)  ? profile.groups
                  : Array.isArray(idClaims.groups) ? idClaims.groups
                  : null;
    const isAdmin = resolveOIDCRole(groups);

    if (isAdmin === null) {
      const noGroupsClaim = !Array.isArray(groups);
      await eventLogger.logSecurityEvent('oidc_login_denied', sub, {
        reason:      noGroupsClaim ? 'no_groups_claim' : 'not_in_allowed_group',
        groups,
        ip:          req.ip,
        userAgent:   req.get('User-Agent'),
        providerName: oidcConfig.providerName,
      });
      return res.redirect(noGroupsClaim
        ? '/login?error=oidc_no_groups_claim'
        : '/login?error=oidc_access_denied');
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
        isAdmin,
      });
    }

    // OIDC users never go through the password-change flow
    await redisClient.del(`user:password_reset:${username}`);

    const user = AuthService.createUserObject(username, isAdmin);
    user.email       = email;
    user.displayName = displayName;
    user.oidcSub     = sub;
    user.isOIDCSSO   = true;
    user.requiresPasswordChange = false;

    // 9h matches SESSION_OPTIONS.maxAge — the cookie and the token expire
    // together, after which the user simply signs in with OIDC again.
    const tokenData = await createJwtToken(user, { expiresIn: '9h' });
    if (!tokenData) throw new Error('Failed to create JWT');

    res.cookie('token',      tokenData.token, SESSION_OPTIONS);
    res.cookie('auth_token', tokenData.token, SESSION_OPTIONS);

    await eventLogger.logSecurityEvent('oidc_login_success', username, {
      ip:          req.ip,
      userAgent:   req.get('User-Agent'),
      providerName: oidcConfig.providerName,
      isOIDCSSO:   true,
    });

    completeLoginRedirect(res, '/?auth=oidc');
  } catch (err) {
    console.error('OIDC callback error:', err);
    const algMismatch = /unexpected JWT alg received.*?got:?\s*([A-Za-z0-9]+)/.exec(err.message || '');
    if (algMismatch) {
      console.error(
        `Hint: the provider signs ID tokens with ${algMismatch[1]}. ` +
        `Set OIDC_ID_TOKEN_ALG=${algMismatch[1]} and restart to fix this.`
      );
    }
    await eventLogger.logSecurityEvent('oidc_login_error', 'unknown', {
      error:     err.message,
      ip:        req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.redirect('/login?error=oidc_auth_failed');
  }
};

module.exports = { oidcInitiate, oidcCallback, resolveOIDCRole };
