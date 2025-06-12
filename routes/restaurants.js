const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const { protect } = require('../middleware/authMiddleware');

// GET /api/restaurants/:id/public - Ottieni informazioni pubbliche base del ristorante
router.get('/:id/public', async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await Restaurant.findById(id).select('name profileImage');
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Ristorante non trovato'
      });
    }

    res.json({
      success: true,
      restaurant: {
        name: restaurant.name,
        profileImage: restaurant.profileImage
      }
    });

  } catch (error) {
    console.error('Error fetching public restaurant info:', error);
    res.status(500).json({
      success: false,
      error: 'Errore interno del server'
    });
  }
});

// GET /api/restaurants/:id - Ottieni informazioni complete del ristorante (autenticato)
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await Restaurant.findById(id);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Ristorante non trovato'
      });
    }

    res.json({
      success: true,
      restaurant
    });

  } catch (error) {
    console.error('Error fetching restaurant info:', error);
    res.status(500).json({
      success: false,
      error: 'Errore interno del server'
    });
  }
});

module.exports = router; 