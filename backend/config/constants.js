//config/constants.js - Configuration and environment variables
const path = require('path');

const constants = {
  PORT: process.env.PORT || 3001,
  DATA_PATH: process.env.DATA_PATH || path.join(__dirname, '../data/logs.json'),
  REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  SESSION_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 9 * 60 * 60 * 1000, // 9 hours in milliseconds
    //maxAge: 60 * 1000, // 1 minute in milliseconds (for testing)
    path: '/'
  }
};

module.exports = constants;