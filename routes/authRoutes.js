const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// Rotte pubbliche
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/verify-token', authController.verifyToken);
router.post('/logout', authController.logout);

module.exports = router; 