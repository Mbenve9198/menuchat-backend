const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const imageController = require('../../controllers/ai/imageController');
const messageController = require('../../controllers/ai/messageController');

// Applica il middleware di protezione a tutte le rotte
router.use(protect);

// Rotte per generazione di immagini e messaggi
router.post('/generate-image', imageController.generateImage);
router.post('/generate-message', messageController.generateMessage);

module.exports = router; 