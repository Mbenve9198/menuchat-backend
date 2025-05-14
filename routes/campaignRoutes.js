const express = require('express');
const campaignController = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Tutte le routes richiedono autenticazione
router.use(protect);

// Rotte per i contatti
router.get('/contacts', campaignController.getContacts);

// Rotte per le campagne
router.get('/', campaignController.getCampaigns);
router.post('/', campaignController.createCampaign);
router.get('/:id', campaignController.getCampaignById);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);
router.put('/:id/cancel', campaignController.cancelCampaign);

module.exports = router; 