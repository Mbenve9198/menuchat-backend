const express = require('express');
const authRoutes = require('./authRoutes');
const setupRoutes = require('./setupRoutes');
const twilioRoutes = require('./twilioRoutes');
const templateRoutes = require('./templateRoutes');
const apiRoutes = require('./api');
const campaignRoutes = require('./campaignRoutes');
const campaignTemplateRoutes = require('./campaignTemplateRoutes');
const schedulerRoutes = require('./scheduler');
const emailPreferencesRoutes = require('./emailPreferences');
const userPreferencesRoutes = require('./userPreferences');
const emailTestRoutes = require('./emailTest');
const paymentRoutes = require('./payment');

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

// Rotte dello scheduler
router.use('/scheduler', schedulerRoutes);

// Rotte delle preferenze email
router.use('/email-preferences', emailPreferencesRoutes);

// Rotte delle preferenze utente
router.use('/user/preferences', userPreferencesRoutes);

// Rotte per testare le email
router.use('/email-test', emailTestRoutes);

// Rotte per i pagamenti
router.use('/payment', paymentRoutes);

// Rotte API generali
router.use('/', apiRoutes);

module.exports = router; 