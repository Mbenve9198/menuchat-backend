const express = require('express');
const twilioController = require('../controllers/twilioController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotta pubblica per il webhook di Twilio
router.post('/webhook', twilioController.webhookHandler);

// Rotte protette (richiedono autenticazione)
router.post('/connect', protect, twilioController.connectTwilio);
router.get('/status', protect, twilioController.getTwilioStatus);
router.post('/test', protect, twilioController.sendTestMessage);
router.post('/custom-settings', protect, twilioController.updateCustomTwilioSettings);
router.post('/reset-to-default', protect, twilioController.resetToDefaultSettings);

module.exports = router; 