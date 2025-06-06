const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Prima prova con le variabili d'ambiente
console.log('🔍 Controllo variabili d\'ambiente...');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME || 'NON IMPOSTATA');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY || 'NON IMPOSTATA');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '***impostata***' : 'NON IMPOSTATA');

// Configura Cloudinary - prima prova con le variabili d'ambiente, poi con le credenziali corrette
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  console.log('✅ Uso credenziali dalle variabili d\'ambiente');
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
} else {
  console.log('⚠️ Uso credenziali corrette hardcoded');
  cloudinary.config({
    cloud_name: 'dsby0xktf',
    api_key: '797287421795773',
    api_secret: 'Cd2sF9MfqneRTcsZxLFCU3nLRiE'
  });
}

async function testCloudinaryUpload() {
  console.log('🧪 Test diretto Cloudinary - Inizio');
  
  try {
    // Test 1: Verifica configurazione
    console.log('📋 Configurazione Cloudinary:', {
      cloud_name: cloudinary.config().cloud_name,
      api_key: cloudinary.config().api_key,
      api_secret: cloudinary.config().api_secret ? '***configurato***' : 'MANCANTE'
    });
    
    // Test 2: Test semplice - upload di un'immagine di test
    console.log('🖼️ Test upload immagine semplice...');
    
    const simpleImageUrl = 'https://via.placeholder.com/300x200.png';
    
    const imageUploadResult = await cloudinary.uploader.upload(simpleImageUrl, {
      folder: 'test-folder',
      public_id: `test-image-${Date.now()}`
    });
    
    console.log('✅ Upload immagine completato:', {
      public_id: imageUploadResult.public_id,
      url: imageUploadResult.secure_url,
      resource_type: imageUploadResult.resource_type
    });
    
    // Test 3: Verifica accessibilità URL immagine
    const axios = require('axios');
    try {
      const response = await axios.head(imageUploadResult.secure_url, { timeout: 10000 });
      console.log('✅ URL immagine accessibile:', {
        status: response.status,
        contentType: response.headers['content-type']
      });
    } catch (urlError) {
      console.error('❌ URL immagine non accessibile:', urlError.message);
    }
    
    // Test 4: Ora prova con un video più piccolo
    console.log('📹 Test upload video piccolo come RAW...');
    
    // Usa un video più piccolo e pubblico
    const smallVideoUrl = 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4';
    
    const rawUploadResult = await cloudinary.uploader.upload(smallVideoUrl, {
      resource_type: 'raw',
      folder: 'campaign-media',
      public_id: `test-video-raw-${Date.now()}`
    });
    
    console.log('✅ Upload video RAW completato:', {
      public_id: rawUploadResult.public_id,
      url: rawUploadResult.secure_url,
      resource_type: rawUploadResult.resource_type,
      format: rawUploadResult.format
    });
    
    // Test 5: Verifica accessibilità URL video
    try {
      const response = await axios.head(rawUploadResult.secure_url, { timeout: 10000 });
      console.log('✅ URL video accessibile:', {
        status: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length']
      });
    } catch (urlError) {
      console.error('❌ URL video non accessibile:', urlError.message);
    }
    
    // Cleanup - elimina i file di test
    console.log('🧹 Pulizia file di test...');
    
    try {
      await cloudinary.uploader.destroy(imageUploadResult.public_id);
      console.log('✅ Immagine eliminata');
    } catch (e) {
      console.log('⚠️ Errore eliminazione immagine:', e.message);
    }
    
    try {
      await cloudinary.uploader.destroy(rawUploadResult.public_id, { resource_type: 'raw' });
      console.log('✅ Video RAW eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione video RAW:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Errore nel test Cloudinary:', error);
    console.error('Dettagli errore:', {
      message: error.message,
      http_code: error.http_code,
      name: error.name
    });
  }
  
  console.log('🧪 Test diretto Cloudinary - Fine');
}

// Esegui il test
testCloudinaryUpload().catch(console.error); 