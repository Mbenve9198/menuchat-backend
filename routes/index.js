const express = require('express');
const authRoutes = require('./authRoutes');
const setupRoutes = require('./setupRoutes');
const twilioRoutes = require('./twilioRoutes');
const templateRoutes = require('./templateRoutes');
const contactRoutes = require('./contactRoutes');
const apiRoutes = require('./api');
const aiRoutes = require('./aiRoutes');

const router = express.Router();

// Rotte di autenticazione
router.use('/auth', authRoutes);

// Rotte di setup
router.use('/setup', setupRoutes);

// Rotte di Twilio - importante: per il webhook usiamo direttamente /twilio/webhook
router.use('/twilio', twilioRoutes);

// Rotte dei template
router.use('/templates', templateRoutes);

// Rotte dei contatti
router.use('/contacts', contactRoutes);

// Rotte API generali
router.use('/', apiRoutes);

// Rotte AI
router.use('/ai', aiRoutes);

module.exports = router; 