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

// Rotta per la generazione di contenuti con AI
router.post('/generate-content', campaignController.generateCampaignContent);

// Rotta per la generazione di prompt per immagini
router.post('/generate-image-prompt', campaignController.generateImagePrompt);

// Rotta per la generazione di immagini
router.post('/generate-image', campaignController.generateImage);

module.exports = router; 