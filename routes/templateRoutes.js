const express = require('express');
const restaurantMessageController = require('../controllers/restaurantMessageController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotte protette per il sistema RestaurantMessage
router.get('/', protect, restaurantMessageController.getMessages);
router.put('/:messageId', protect, restaurantMessageController.updateMessage);
router.post('/:messageId/regenerate', protect, restaurantMessageController.regenerateMessage);
router.patch('/', protect, restaurantMessageController.updateReviewSettings);

module.exports = router;