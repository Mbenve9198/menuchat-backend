const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('@fluidjs/multer-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage per i PDF dei menu
const pdfStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'menu-pdf',
    resource_type: 'raw',
    format: 'pdf',
    public_id: (req, file) => {
      // Generiamo un ID unico basato sul nome del ristorante e timestamp
      const restaurantName = req.body.restaurantName || 'restaurant';
      const sanitizedName = restaurantName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-');
      return `${sanitizedName}-${Date.now()}`;
    }
  }
});

// Storage per i media delle campagne (immagini, video, PDF)
const mediaStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'campaign-media',
    resource_type: (req, file) => {
      // Determina il tipo di risorsa basato sul mimetype
      if (file.mimetype.startsWith('image/')) {
        return 'image';
      } else if (file.mimetype.startsWith('video/')) {
        return 'video';
      } else if (file.mimetype === 'application/pdf') {
        return 'raw';
      }
      return 'auto'; // Fallback
    },
    format: (req, file) => {
      // Estrae il formato dall'estensione originale o dal mimetype
      if (file.mimetype === 'application/pdf') {
        return 'pdf';
      }
      
      // Per estensioni video e immagini, estrai dal nome file
      const originalExt = file.originalname.split('.').pop().toLowerCase();
      
      // Se è un video che richiede conversione, usa mp4
      if (file.mimetype.startsWith('video/') && req.body.needsConversion === 'true') {
        return req.body.targetFormat || 'mp4';
      }
      
      // Altrimenti mantieni il formato originale
      return originalExt;
    },
    public_id: (req, file) => {
      // Generiamo un ID unico basato sul tipo di campagna e timestamp
      const campaignType = req.body.campaignType || 'campaign';
      const sanitizedType = campaignType
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-');
        
      // Identificatore per il tipo di risorsa
      let prefix = '';
      if (file.mimetype.startsWith('image/')) {
        prefix = 'img';
      } else if (file.mimetype.startsWith('video/')) {
        prefix = 'video';
      } else if (file.mimetype === 'application/pdf') {
        prefix = 'pdf';
      }
      
      return `${prefix}-${sanitizedType}-${Date.now()}`;
    }
  }
});

// Configurazione multer per upload PDF
const uploadPdf = multer({ 
  storage: pdfStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accettiamo solo file PDF
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo file PDF sono accettati'), false);
    }
  }
});

// Configurazione multer per upload media
const uploadMedia = multer({
  storage: mediaStorage,
  limits: {
    fileSize: 30 * 1024 * 1024 // 30MB limit per supportare video
  },
  fileFilter: (req, file, cb) => {
    // Accettiamo immagini, video e PDF
    if (
      file.mimetype.startsWith('image/') || 
      file.mimetype.startsWith('video/') || 
      file.mimetype === 'application/pdf'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Solo immagini, video e PDF sono accettati'), false);
    }
  }
});

module.exports = {
  cloudinary,
  uploadPdf,
  uploadMedia
}; 