const express = require('express');
const campaignTemplateController = require('../controllers/campaignTemplateController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Tutte le routes richiedono autenticazione
router.use(protect);

// Rotte per i template predefiniti
router.post('/create-defaults', campaignTemplateController.createDefaultTemplates);

// Rotte per la gestione dei template
router.route('/')
  .get(campaignTemplateController.getTemplates)
  .post(campaignTemplateController.createTemplate);

router.route('/:id')
  .get(campaignTemplateController.getTemplateById)
  .put(campaignTemplateController.updateTemplate)
  .delete(campaignTemplateController.deleteTemplate);

// Rotte speciali
router.post('/:id/duplicate', campaignTemplateController.duplicateTemplate);
router.post('/:id/submit', campaignTemplateController.submitTemplateToTwilio);
router.get('/:id/status', campaignTemplateController.checkTemplateStatus);

module.exports = router; 