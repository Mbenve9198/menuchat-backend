router.post('/campaign-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nessun file caricato'
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'campaign-images',
      resource_type: 'image'
    });

    res.json({
      success: true,
      file: {
        url: result.secure_url,
        publicId: result.public_id
      }
    });
  } catch (error) {
    console.error('Errore nel caricamento dell\'immagine:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel caricamento dell\'immagine'
    });
  }
}); 