const express = require('express');
const setupController = require('../controllers/setupController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Rotte pubbliche
router.post('/', setupController.setupRestaurant);

// Rotte protette (richiedono autenticazione)
router.get('/:id', protect, setupController.getRestaurant);
router.put('/:id', protect, setupController.updateRestaurant);
router.delete('/:id', protect, setupController.deleteRestaurant);

module.exports = router; 