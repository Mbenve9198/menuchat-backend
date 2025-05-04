const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
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

const uploadPdf = multer({ 
  storage: storage,
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

module.exports = {
  cloudinary,
  uploadPdf
}; 