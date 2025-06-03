const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setupController');
const uploadController = require('../controllers/uploadController');
const statsController = require('../controllers/statsController');
const restaurantController = require('../controllers/restaurantController');
const { uploadPdf, uploadMedia } = require('../config/cloudinary');
const menuService = require('../services/menuService');
const googlePlacesService = require('../services/googlePlacesService');
const Restaurant = require('../models/Restaurant');

// Rotte per il setup del ristorante
router.post('/restaurants', setupController.setupRestaurant);
router.get('/restaurants/:id', restaurantController.getRestaurantById);
router.put('/restaurants/:id', setupController.updateRestaurant);
router.delete('/restaurants/:id', setupController.deleteRestaurant);
router.get('/restaurants/:id/profile-image', setupController.getRestaurantProfileImage);

// Rotta per sincronizzare le recensioni di un ristorante
router.post('/restaurants/:id/sync-reviews', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Trova il ristorante
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Ristorante non trovato'
      });
    }

    // Verifica che il ristorante abbia un Google Place ID
    if (!restaurant.googlePlaceId) {
      return res.status(400).json({
        success: false,
        error: 'Ristorante non collegato a Google Places'
      });
    }

    // Sincronizza le recensioni
    const updatedRestaurant = await googlePlacesService.syncRestaurantReviews(restaurant);

    res.json({
      success: true,
      restaurant: updatedRestaurant
    });
  } catch (error) {
    console.error('Error syncing reviews:', error);
    res.status(500).json({
      success: false,
      error: 'Errore durante la sincronizzazione delle recensioni'
    });
  }
});

// Rotte per le statistiche e le attività
router.get('/stats', statsController.getStats);
router.get('/activities', statsController.getActivities);

// Rotte per la generazione di messaggi di benvenuto
router.post('/welcome', setupController.generateWelcomeMessage);

// Rotte per la generazione di template di recensioni
router.post('/review', setupController.generateReviewTemplates);

// Rotte per verificare la disponibilità del trigger
router.post('/check-trigger', setupController.checkTrigger);

// Rotte per i menu
router.get('/menu/:id', async (req, res) => {
  try {
    const menu = await menuService.findMenuById(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, error: 'Menu non trovato' });
    }
    res.json({ success: true, menu });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/menu/restaurant/:restaurantId', async (req, res) => {
  try {
    const menus = await menuService.findMenusByRestaurant(req.params.restaurantId);
    res.json({ success: true, menus });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/menu', async (req, res) => {
  try {
    const { restaurantId } = req.body;
    if (!restaurantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID del ristorante mancante'
      });
    }
    
    const menu = await menuService.createMenu(req.body, restaurantId);
    res.status(201).json({ success: true, menu });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/menu/:id', async (req, res) => {
  try {
    const menu = await menuService.updateMenu(req.params.id, req.body);
    res.json({ success: true, menu });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/menu/:id', async (req, res) => {
  try {
    const result = await menuService.deleteMenu(req.params.id);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rotte per l'upload di file
router.post('/upload/menu-pdf', uploadPdf.single('file'), uploadController.uploadMenuPdf);
router.delete('/upload/menu-pdf/:publicId/:menuId?', uploadController.deleteMenuPdf);

// Rotta per l'upload di media per campagne (immagini, video, PDF)
router.post('/upload/campaign-media', uploadMedia.single('file'), uploadController.uploadCampaignMedia);

// Endpoint per verificare la disponibilità di un'email
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        available: false,
        error: 'Email is required'
      });
    }

    // Verifica se l'email esiste già nel database
    const User = require('../models/User');
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    return res.json({
      available: !existingUser,
      message: existingUser ? 'Email already registered' : 'Email available'
    });

  } catch (error) {
    console.error('Error checking email availability:', error);
    return res.status(500).json({
      available: false,
      error: 'Server error'
    });
  }
});

// Endpoint per verificare la disponibilità di una trigger phrase

module.exports = router; 