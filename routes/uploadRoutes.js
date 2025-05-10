const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/authMiddleware');
const uploadController = require('../controllers/uploadController');

// Configurazione di Multer per il caricamento dei file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});

// Filtro per i tipi di file
const fileFilter = (req, file, cb) => {
  // Accetta solo immagini
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Il file deve essere un\'immagine'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Applica il middleware di protezione a tutte le rotte
router.use(protect);

// Rotta per caricare un menu PDF
router.post('/menu-pdf', upload.single('file'), uploadController.uploadMenuPdf);

// Rotta per caricare un'immagine del ristorante
router.post('/restaurant-image', upload.single('file'), uploadController.uploadRestaurantImage);

// Rotta per caricare un'immagine di campagna
router.post('/campaign-image', upload.single('file'), uploadController.uploadCampaignImage);

module.exports = router; 