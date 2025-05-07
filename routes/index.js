const express = require('express');
const authRoutes = require('./authRoutes');
const setupRoutes = require('./setupRoutes');
const twilioRoutes = require('./twilioRoutes');
const templateRoutes = require('./templateRoutes');

const router = express.Router();

// Rotte di autenticazione
router.use('/auth', authRoutes);

// Rotte di setup
router.use('/setup', setupRoutes);

// Rotte di Twilio - importante: per il webhook usiamo direttamente /twilio/webhook
router.use('/twilio', twilioRoutes);

// Rotte dei template
router.use('/templates', templateRoutes);

module.exports = router; 