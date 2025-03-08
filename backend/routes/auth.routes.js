// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { loginUser, logoutUser, getCurrentUser, revokeAllSessions, changePassword, forcePasswordReset, changeOwnPassword } = require('../controllers/auth.controller');
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later'
});

router.post('/login', loginLimiter, loginUser);
router.post('/logout', authenticateJwt, logoutUser);
router.get('/me', authenticateJwt, getCurrentUser);
router.post('/change-password', authenticateJwt, changePassword);
router.post('/change-own-password', authenticateJwt, changeOwnPassword);
router.post('/revoke-all', authenticateJwt, verifyAdmin, revokeAllSessions);
router.post('/force-password-reset', authenticateJwt, verifyAdmin, forcePasswordReset);

module.exports = router;