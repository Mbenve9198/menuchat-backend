const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setupController');
const uploadController = require('../controllers/uploadController');
const { uploadPdf } = require('../config/cloudinary');
const menuService = require('../services/menuService');

// Rotte per il setup del ristorante
router.post('/restaurants', setupController.setupRestaurant);
router.get('/restaurants/:id', setupController.getRestaurant);
router.put('/restaurants/:id', setupController.updateRestaurant);
router.delete('/restaurants/:id', setupController.deleteRestaurant);
router.get('/restaurants/:id/profile-image', setupController.getRestaurantProfileImage);

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

module.exports = router; 