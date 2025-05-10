const express = require('express');
const authRoutes = require('./authRoutes');
const setupRoutes = require('./setupRoutes');
const twilioRoutes = require('./twilioRoutes');
const templateRoutes = require('./templateRoutes');
const contactRoutes = require('./contactRoutes');
const campaignRoutes = require('./campaignRoutes');
const apiRoutes = require('./api');

const router = express.Router();

// Rotte di autenticazione
router.use('/auth', authRoutes);

// Rotte di setup
router.use('/setup', setupRoutes);

// Rotte di Twilio - importante: per il webhook usiamo direttamente /twilio/webhook
router.use('/twilio', twilioRoutes);

// Rotte dei template
router.use('/templates', templateRoutes);

// Rotte per i contatti
router.use('/contacts', contactRoutes);

// Rotte per le campagne
router.use('/campaigns', campaignRoutes);

// Rotte API generali
router.use('/', apiRoutes);

module.exports = router; 