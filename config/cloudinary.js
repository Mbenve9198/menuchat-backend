const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('@fluidjs/multer-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dsby0xktf',
  api_key: process.env.CLOUDINARY_API_KEY || '797287421795773',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Cd2sF9MfqneRTcsZxLFCU3nLRiE'
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
        // Se il video è destinato a WhatsApp, caricalo come raw per evitare problemi di Content-Type
        if (req.body.optimizeForWhatsApp === 'true') {
          return 'raw';
        }
        return 'video';
      } else if (file.mimetype === 'application/pdf') {
        return 'raw';
      }
      return 'auto'; // Fallback
    },
    format: (req, file) => {
      // Per i video destinati a WhatsApp, forza sempre mp4
      if (file.mimetype.startsWith('video/')) {
        return 'mp4';
      }
      
      // Per PDF mantieni il formato
      if (file.mimetype === 'application/pdf') {
        return 'pdf';
      }
      
      // Per le immagini, estrai dal nome file o usa il formato originale
      const originalExt = file.originalname.split('.').pop().toLowerCase();
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
      
      // Per i video, non includere l'estensione originale nel public_id
      // per evitare problemi con estensioni multiple
      const timestamp = Date.now();
      return `${prefix}-${sanitizedType}-${timestamp}`;
    },
    // Aggiungi trasformazioni specifiche per i video destinati a WhatsApp
    transformation: (req, file) => {
      if (file.mimetype.startsWith('video/') && req.body.optimizeForWhatsApp === 'true') {
        return [
          { quality: 'auto:good' },
          { video_codec: 'h264' },
          { audio_codec: 'aac' },
          { flags: 'streaming_attachment' }
        ];
      }
      return undefined; // Nessuna trasformazione per altri tipi di file
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