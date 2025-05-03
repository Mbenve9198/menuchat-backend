const express = require('express');
const twilioController = require('../controllers/twilioController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotte protette (richiedono autenticazione)
router.post('/connect', protect, twilioController.connectTwilio);
router.get('/status', protect, twilioController.getTwilioStatus);
router.post('/test', protect, twilioController.sendTestMessage);

module.exports = router; 