const express = require('express');
const templateController = require('../controllers/templateController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotte protette (richiedono autenticazione)
router.get('/:restaurantId', protect, templateController.getTemplates);
router.put('/:templateId', protect, templateController.updateTemplate);
router.get('/:templateId/status', protect, templateController.checkTemplateStatus);
router.delete('/:templateId', protect, templateController.deleteTemplate);

module.exports = router; 