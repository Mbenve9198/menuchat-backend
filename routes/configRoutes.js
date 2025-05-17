const express = require('express');
const router = express.Router();
const { cloudinary } = require('../config/cloudinary');

/**
 * @route   GET /api/config/cloudinary
 * @desc    Ottieni configurazione pubblica di Cloudinary
 * @access  Public
 */
router.get('/cloudinary', (req, res) => {
  try {
    res.json({
      success: true,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'menuchat',
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'menuchat_preset'
    });
  } catch (error) {
    console.error('Errore nel recupero della configurazione Cloudinary:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Errore interno' 
    });
  }
});

module.exports = router; 