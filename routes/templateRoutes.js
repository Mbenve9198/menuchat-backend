const express = require('express');
const templateController = require('../controllers/templateController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotte protette (richiedono autenticazione)
router.get('/', protect, templateController.getTemplates);
router.put('/:templateId', protect, templateController.updateTemplate);
router.post('/:templateId/regenerate', protect, templateController.regenerateMessage);

// Rotte per le impostazioni di recensione
router.put('/review-settings', protect, templateController.updateReviewSettings);

module.exports = router;