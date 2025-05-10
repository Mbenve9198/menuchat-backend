const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

// Protezione: tutte le rotte richiedono autenticazione
router.use(protect);

// Rotte principali per le campagne
router.route('/')
  .get(campaignController.getCampaigns)
  .post(campaignController.createCampaign);

// Rotte per operazioni su singola campagna
router.route('/:id')
  .get(campaignController.getCampaignById)
  .put(campaignController.updateCampaign)
  .delete(campaignController.deleteCampaign);

// Rotta per la selezione dei destinatari
router.post('/:id/recipients', campaignController.selectRecipients);

// Rotte per la generazione di contenuti con AI
router.post('/:id/generate-text', campaignController.generateCampaignText);
router.post('/:id/generate-image', campaignController.generateCampaignImage);

// Rotte per la gestione del template Twilio
router.post('/:id/submit-template', campaignController.submitCampaignTemplate);
router.get('/:id/check-template', campaignController.checkCampaignTemplate);

module.exports = router; 