// backend/routes/operations.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const operationsController = require('../controllers/operations.controller.js');

// All routes require authentication
router.use(authenticateJwt);

// User routes (available to all authenticated users)
router.get('/my-operations', operationsController.getMyOperations);
router.get('/active', operationsController.getActiveOperation);
router.post('/set-active', operationsController.setActiveOperation);

// Admin routes
router.get('/', operationsController.getAllOperations);
router.post('/', verifyAdmin, operationsController.createOperation);
router.put('/:id', verifyAdmin, operationsController.updateOperation);
router.delete('/:id', verifyAdmin, operationsController.deleteOperation);

// User assignment routes (admin only)
router.post('/:id/users', verifyAdmin, operationsController.assignUserToOperation);
router.delete('/:id/users/:username', verifyAdmin, operationsController.removeUserFromOperation);
router.get('/:id/users', verifyAdmin, operationsController.getOperationUsers);

module.exports = router;