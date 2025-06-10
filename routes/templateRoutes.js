const express = require('express');
const templateController = require('../controllers/templateController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotte protette (richiedono autenticazione)
router.get('/', protect, templateController.getTemplates);
router.get('/:restaurantId', protect, templateController.getTemplates);
router.put('/:templateId', protect, templateController.updateTemplate);
router.get('/:templateId/status', protect, templateController.checkTemplateStatus);
router.delete('/:templateId', protect, templateController.deleteTemplate);
router.post('/:templateId/convert', protect, templateController.convertTemplate);
router.post('/:templateId/regenerate', protect, templateController.regenerateMessage);

// Rotte per le impostazioni di recensione
router.get('/:restaurantId/review-settings', protect, templateController.getReviewSettings);
router.put('/:restaurantId/review-settings', protect, templateController.updateReviewSettings);

// Rotte per gestire il testo dei pulsanti
router.get('/:templateId/button-text', protect, templateController.getButtonText);
router.put('/:templateId/button-text', protect, templateController.updateButtonText);

module.exports = router; 