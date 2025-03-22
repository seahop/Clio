// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const { 
  loginUser, 
  logoutUser, 
  getCurrentUser, 
  revokeAllSessions, 
  changePassword, 
  forcePasswordReset, 
  changeOwnPassword,
  googleLoginCallback // Add the new controller function
} = require('../controllers/auth.controller');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later'
});

// Existing routes
router.post('/login', loginLimiter, loginUser);
router.post('/logout', authenticateJwt, logoutUser);
router.get('/me', authenticateJwt, getCurrentUser);
router.post('/change-password', authenticateJwt, changePassword);
router.post('/change-own-password', authenticateJwt, changeOwnPassword);
router.post('/revoke-all', authenticateJwt, verifyAdmin, revokeAllSessions);
router.post('/force-password-reset', authenticateJwt, verifyAdmin, forcePasswordReset);

// Google SSO routes
router.get('/google', 
  (req, res, next) => {
    console.log('Starting Google OAuth flow from:', req.get('Referer'));
    console.log('Client IP:', req.ip);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    next();
  },
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false
  })
);

router.get('/google/callback', 
  (req, res, next) => {
    console.log('Google callback received:');
    console.log('  Query params:', req.query);
    console.log('  Headers:', JSON.stringify(req.headers, null, 2));
    next();
  },
  (req, res, next) => {
    // Custom error handler for authentication failures
    passport.authenticate('google', { 
      session: false
    }, (err, user, info) => {
      if (err) {
        console.error('Google auth error:', err);
        return res.redirect('/?error=google_auth_error&message=' + encodeURIComponent(err.message));
      }
      
      if (!user) {
        console.error('Google auth failed. Info:', info);
        return res.redirect('/?error=google_auth_failed&message=' + encodeURIComponent(info?.message || 'Authentication failed'));
      }
      
      // Authentication successful, attach user to request
      req.user = user;
      next();
    })(req, res, next);
  },
  (req, res, next) => {
    console.log('Google authentication successful, user:', req.user?.username);
    next();
  },
  googleLoginCallback
);

module.exports = router;