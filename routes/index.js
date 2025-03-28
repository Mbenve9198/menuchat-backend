const express = require('express');
const authRoutes = require('./authRoutes');
const setupRoutes = require('./setupRoutes');

const router = express.Router();

// Rotte di autenticazione
router.use('/auth', authRoutes);

// Rotte di setup
router.use('/setup', setupRoutes);

module.exports = router; 