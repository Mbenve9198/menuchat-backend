// Route per il proxy dei media con Content-Type corretto per WhatsApp
const express = require('express');
const router = express.Router();
const { proxyVideo, proxyMedia } = require('../controllers/mediaProxyController');

// Route per proxy video specifico (formato semplificato)
router.get('/video/:videoId', proxyVideo);

// Route per proxy media generico (path completo)
router.get('/media/*', (req, res) => {
  // Estrai il path completo dopo /media/
  const mediaPath = req.params[0];
  req.params.mediaPath = mediaPath;
  proxyMedia(req, res);
});

module.exports = router; 