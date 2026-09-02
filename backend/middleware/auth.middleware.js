// middleware/auth.middleware.js
const { ADMIN_SECRET } = require('../config/security');
const crypto = require('crypto');

const verifyAdmin = (req, res, next) => {
  try {
    const user = req.user;

    const expectedProof = crypto.createHmac('sha256', ADMIN_SECRET)
                               .update(user.username)
                               .digest('hex');

    if (user.role !== 'admin' || user.adminProof !== expectedProof) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid admin authentication' });
  }
};

module.exports = {
  verifyAdmin
};
