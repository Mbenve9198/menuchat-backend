// Controller per fare da proxy ai media di Cloudinary con Content-Type corretto per WhatsApp
const axios = require('axios');

// Proxy per video che corregge il Content-Type per WhatsApp
const proxyVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    // Costruisci l'URL Cloudinary originale
    const cloudinaryUrl = `https://res.cloudinary.com/dsby0xktf/video/upload/${videoId}`;
    
    console.log('🔗 Proxy video request:', cloudinaryUrl);
    
    // Scarica il video da Cloudinary
    const response = await axios({
      method: 'get',
      url: cloudinaryUrl,
      responseType: 'stream',
      timeout: 30000
    });
    
    // Imposta gli headers corretti per WhatsApp
    res.set({
      'Content-Type': 'video/mp4', // Senza codec specifici!
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'public, max-age=31536000', // Cache per 1 anno
      'Accept-Ranges': 'bytes'
    });
    
    // Pipe del video stream
    response.data.pipe(res);
    
    console.log('✅ Video proxy completato per:', videoId);
    
  } catch (error) {
    console.error('❌ Errore proxy video:', error.message);
    
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ error: 'Video non trovato' });
    }
    
    res.status(500).json({ 
      error: 'Errore durante il proxy del video',
      details: error.message 
    });
  }
};

// Proxy generico per media con Content-Type detection
const proxyMedia = async (req, res) => {
  try {
    const { mediaPath } = req.params;
    
    // Costruisci l'URL Cloudinary completo dal path
    const cloudinaryUrl = `https://res.cloudinary.com/dsby0xktf/${mediaPath}`;
    
    console.log('🔗 Proxy media request:', cloudinaryUrl);
    
    // Scarica il media da Cloudinary
    const response = await axios({
      method: 'get',
      url: cloudinaryUrl,
      responseType: 'stream',
      timeout: 30000
    });
    
    // Determina il Content-Type corretto basato sull'URL
    let contentType = response.headers['content-type'];
    
    // Correggi il Content-Type per i video
    if (contentType && contentType.startsWith('video/mp4')) {
      contentType = 'video/mp4'; // Rimuovi codec specifici
    }
    
    // Imposta gli headers
    res.set({
      'Content-Type': contentType,
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'public, max-age=31536000',
      'Accept-Ranges': 'bytes'
    });
    
    // Pipe del media stream
    response.data.pipe(res);
    
    console.log('✅ Media proxy completato per:', mediaPath);
    
  } catch (error) {
    console.error('❌ Errore proxy media:', error.message);
    
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ error: 'Media non trovato' });
    }
    
    res.status(500).json({ 
      error: 'Errore durante il proxy del media',
      details: error.message 
    });
  }
};

module.exports = {
  proxyVideo,
  proxyMedia
}; 