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

// Rotta per lo scheduler delle recensioni (protetta da API key tramite middleware nel controller)
router.post('/send-scheduled-reviews', twilioController.sendScheduledReviews);

// Rotta per programmare messaggi
router.post('/schedule', protect, twilioController.scheduleTemplateMessage);

// Rotta per controllare lo stato di un template
router.get('/template/:id/status', protect, twilioController.checkTemplateStatus);

module.exports = router; 