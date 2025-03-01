// middleware/error.middleware.js
const errorMiddleware = (err, req, res, next) => {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({
        error: 'Invalid CSRF token',
        detail: 'Form has been tampered with'
      });
    }
  
    // Handle Redis connection errors
    if (err.code === 'ECONNREFUSED' && err.message.includes('redis')) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        detail: 'Database connection error'
      });
    }
  
    // Handle file system errors
    if (err.code === 'ENOENT') {
      return res.status(500).json({
        error: 'Internal server error',
        detail: 'Resource not found'
      });
    }
  
    // Handle validation errors
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        detail: err.message
      });
    }
  
    // Default error
    res.status(500).json({
      error: 'Internal server error',
      detail: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
  };
  
  // Default 404 handler
  const notFoundMiddleware = (req, res) => {
    res.status(404).json({
      error: 'Not found',
      detail: `Cannot ${req.method} ${req.path}`
    });
  };
  
  module.exports = {
    errorMiddleware,
    notFoundMiddleware
  };