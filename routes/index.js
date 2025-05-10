const express = require('express');
const router = express.Router();

// Importa i controller
const restaurantController = require('../controllers/restaurantController');
const reviewController = require('../controllers/reviewController');
const twilioController = require('../controllers/twilioController');

// Importa le rotte specifiche
const authRoutes = require('./authRoutes');
const restaurantRoutes = require('./restaurantRoutes');
const reviewRoutes = require('./reviewRoutes');
const contactRoutes = require('./contactRoutes');
const messageRoutes = require('./messageRoutes');
const webhookRoutes = require('./webhookRoutes');
const templateRoutes = require('./templateRoutes');
const statsRoutes = require('./statsRoutes');
const activityRoutes = require('./activityRoutes');
const uploadRoutes = require('./uploadRoutes');
const aiRoutes = require('./ai');

// Monta le rotte specifiche
router.use('/auth', authRoutes);
router.use('/restaurants', restaurantRoutes);
router.use('/reviews', reviewRoutes);
router.use('/contacts', contactRoutes);
router.use('/messages', messageRoutes);
router.use('/webhook', webhookRoutes);
router.use('/templates', templateRoutes);
router.use('/stats', statsRoutes);
router.use('/activities', activityRoutes);
router.use('/upload', uploadRoutes);
router.use('/ai', aiRoutes);

// Rotte semplici gestite direttamente qui
router.post('/twilio/send-scheduled-reviews', twilioController.sendScheduledReviews);

// Endpoint di test per verificare il corretto funzionamento delle API
router.get('/test', (req, res) => {
  res.json({ message: 'API MenuChat funzionante!' });
});

module.exports = router; 