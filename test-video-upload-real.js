const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function testVideoUploadAPI() {
  console.log('🎬 Test upload video tramite API - Inizio');
  
  try {
    // Crea un file video di test (simulato)
    console.log('📄 Creazione file video di test...');
    
    const testVideoContent = Buffer.from('FAKE_VIDEO_CONTENT_FOR_TESTING');
    const testVideoPath = path.join(__dirname, 'test-video.mp4');
    
    fs.writeFileSync(testVideoPath, testVideoContent);
    console.log('✅ File video di test creato:', testVideoPath);
    
    // Prepara FormData per l'upload
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testVideoPath));
    formData.append('campaignType', 'promo');
    formData.append('optimizeForWhatsApp', 'true');
    
    console.log('📤 Invio richiesta di upload...');
    
    // Invia richiesta all'API locale
    const response = await axios.post('http://localhost:5000/api/upload/campaign-media', formData, {
      headers: {
        ...formData.getHeaders(),
        'Content-Type': 'multipart/form-data'
      },
      timeout: 30000
    });
    
    console.log('✅ Upload completato:', {
      success: response.data.success,
      url: response.data.file?.url,
      resourceType: response.data.file?.resourceType,
      optimizedForWhatsApp: response.data.file?.optimizedForWhatsApp,
      isVideo: response.data.file?.isVideo
    });
    
    // Test dell'URL generato
    if (response.data.file?.url) {
      console.log('🔗 Test accessibilità URL...');
      
      try {
        const urlTestResponse = await axios.head(response.data.file.url, { timeout: 10000 });
        console.log('✅ URL accessibile:', {
          status: urlTestResponse.status,
          contentType: urlTestResponse.headers['content-type'],
          contentLength: urlTestResponse.headers['content-length']
        });
      } catch (urlError) {
        console.error('❌ URL non accessibile:', urlError.message);
      }
    }
    
    // Cleanup
    console.log('🧹 Pulizia file locale...');
    try {
      fs.unlinkSync(testVideoPath);
      console.log('✅ File locale eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione file locale:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Errore nel test API:', error.message);
    
    if (error.response) {
      console.error('Dettagli risposta:', {
        status: error.response.status,
        data: error.response.data
      });
    }
  }
  
  console.log('🎬 Test upload video tramite API - Fine');
}

// Esegui il test
testVideoUploadAPI().catch(console.error); 