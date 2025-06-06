const express = require('express');
const campaignController = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Endpoint pubblico per gestire le unsubscribe (senza autenticazione)
router.get('/unsubscribe/:contactId/:token', campaignController.handleUnsubscribe);

// Tutte le altre routes richiedono autenticazione
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

// Rotte per l'approvazione e scheduling dei template
router.post('/:id/submit-template', campaignController.submitCampaignTemplate);
router.post('/:id/schedule', campaignController.scheduleCampaignSending);
router.get('/:id/template-status', campaignController.checkTemplateStatus);

// Rotta per la generazione di contenuti con AI
router.post('/generate-content', campaignController.generateCampaignContent);

// Rotta per la generazione di prompt per immagini
router.post('/generate-image-prompt', campaignController.generateImagePrompt);

// Rotta per la generazione di immagini
router.post('/generate-image', campaignController.generateImage);

// Endpoint di test per verificare la funzionalità di unsubscribe
router.get('/test-unsubscribe', campaignController.testUnsubscribe);

// Endpoint di test per verificare la compatibilità degli URL video con WhatsApp
router.post('/test-video-url', campaignController.testVideoUrl);

module.exports = router; 