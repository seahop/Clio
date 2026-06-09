// backend/routes/auth.routes.js
const express  = require('express');
const router   = express.Router();
const passport = require('passport');
const {
  loginUser,
  logoutUser,
  getCurrentUser,
  revokeAllSessions,
  changePassword,
  forcePasswordReset,
  changeOwnPassword,
  googleLoginCallback,
  getAuthProviders,
} = require('../controllers/auth.controller');
const { oidcInitiate, oidcCallback } = require('../controllers/oidc.controller');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later',
});

// Public: tells the login page which SSO buttons to display
router.get('/providers', getAuthProviders);

// Standard credential login / session management
router.post('/login',             loginLimiter, loginUser);
router.post('/logout',            authenticateJwt, logoutUser);
router.get('/me',                 authenticateJwt, getCurrentUser);
router.post('/change-password',   authenticateJwt, changePassword);
router.post('/change-own-password', authenticateJwt, changeOwnPassword);
router.post('/revoke-all',        authenticateJwt, verifyAdmin, revokeAllSessions);
router.post('/force-password-reset', authenticateJwt, verifyAdmin, forcePasswordReset);

// Google SSO routes
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
      if (err) {
        console.error('Google auth error:', err);
        return res.redirect('/login?error=google_auth_failed');
      }
      if (!user) {
        console.error('Google auth failed:', info);
        return res.redirect('/login?error=google_auth_failed');
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  googleLoginCallback
);

// Generic OIDC routes (active only when OIDC_ISSUER_URL / CLIENT_ID / SECRET are set)
router.get('/oidc',          oidcInitiate);
router.get('/oidc/callback', oidcCallback);

module.exports = router;