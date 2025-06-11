const express = require('express');
const templateController = require('../controllers/templateController');
const restaurantMessageController = require('../controllers/restaurantMessageController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotte protette (richiedono autenticazione) - NUOVO SISTEMA RestaurantMessage
router.get('/', protect, restaurantMessageController.getMessages);
router.put('/:messageId', protect, restaurantMessageController.updateMessage);
router.post('/:messageId/regenerate', protect, restaurantMessageController.regenerateMessage);

// Rotte per le impostazioni di recensione - NUOVO SISTEMA
router.patch('/', protect, restaurantMessageController.updateReviewSettings);

// === ROUTE LEGACY PER COMPATIBILITÀ (SYSTEM VECCHIO WhatsAppTemplate) ===
// Queste route vengono mantenute per il fallback al sistema vecchio
router.get('/legacy', protect, templateController.getTemplates);
router.put('/legacy/:templateId', protect, templateController.updateTemplate);
router.post('/legacy/:templateId/regenerate', protect, templateController.regenerateMessage);
router.get('/legacy/:templateId/status', protect, templateController.checkTemplateStatus);
router.patch('/legacy', protect, templateController.updateReviewSettings);

module.exports = router;