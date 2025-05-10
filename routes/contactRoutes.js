const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { authenticateJWT } = require('../middleware/authMiddleware');

// Proteggi tutte le rotte con autenticazione JWT
router.use(authenticateJWT);

// Rotte per la gestione dei contatti
router.get('/restaurant/:restaurantId', contactController.getContactsByRestaurant);
router.get('/restaurant/:restaurantId/stats', contactController.getContactStats);
router.get('/:contactId', contactController.getContactById);
router.put('/:contactId', contactController.updateContact);
router.patch('/:contactId/opt-in', contactController.updateContactOptInStatus);
router.delete('/:contactId', contactController.deleteContact);

module.exports = router; 