const express = require('express');
const authRoutes = require('./authRoutes');
const setupRoutes = require('./setupRoutes');
const twilioRoutes = require('./twilioRoutes');
const templateRoutes = require('./templateRoutes');
const apiRoutes = require('./api');
const campaignRoutes = require('./campaignRoutes');
const campaignTemplateRoutes = require('./campaignTemplateRoutes');

const router = express.Router();

// Rotte di autenticazione
router.use('/auth', authRoutes);

// Rotte di setup
router.use('/setup', setupRoutes);

// Rotte di Twilio - importante: per il webhook usiamo direttamente /twilio/webhook
router.use('/twilio', twilioRoutes);

// Rotte dei template
router.use('/templates', templateRoutes);

// Rotte delle campagne
router.use('/campaign', campaignRoutes);

// Rotte dei template delle campagne
router.use('/campaign-templates', campaignTemplateRoutes);

// Rotte API generali
router.use('/', apiRoutes);

module.exports = router; 