#!/usr/bin/env node

/**
 * Test semplice per verificare l'upload video con la nuova configurazione
 */

const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');

async function testVideoUpload() {
  console.log('🧪 Test upload video con nuova configurazione...');
  
  // Crea un video di test molto semplice (file vuoto con estensione .mp4)
  const testVideoPath = '/tmp/test-video.mp4';
  
  // Crea un file di test molto piccolo
  const testContent = Buffer.from('fake video content for testing');
  fs.writeFileSync(testVideoPath, testContent);
  
  try {
    // Prepara il form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testVideoPath));
    formData.append('campaignType', 'test');
    formData.append('optimizeForWhatsApp', 'true');
    
    console.log('📤 Invio richiesta di upload...');
    
    // Invia la richiesta
    const response = await axios.post('http://localhost:5000/api/upload/campaign-media', formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000
    });
    
    console.log('✅ Upload completato!');
    console.log('📋 Risposta:', JSON.stringify(response.data, null, 2));
    
    // Testa l'URL risultante
    if (response.data.success && response.data.file && response.data.file.url) {
      const videoUrl = response.data.file.url;
      console.log('\n🔗 Test accessibilità URL...');
      
      try {
        const headResponse = await axios.head(videoUrl, { timeout: 10000 });
        console.log('✅ URL accessibile');
        console.log('📋 Status:', headResponse.status);
        console.log('📋 Content-Type:', headResponse.headers['content-type']);
        console.log('📋 Content-Length:', headResponse.headers['content-length']);
        
        // Verifica se è un URL raw
        if (videoUrl.includes('/raw/')) {
          console.log('✅ Video caricato come raw - compatibile con WhatsApp');
        } else {
          console.log('⚠️ Video non caricato come raw');
        }
        
      } catch (urlError) {
        console.log('❌ URL non accessibile:', urlError.message);
      }
    }
    
  } catch (error) {
    console.log('❌ Errore durante l\'upload:', error.message);
    if (error.response) {
      console.log('📋 Response status:', error.response.status);
      console.log('📋 Response data:', error.response.data);
    }
  } finally {
    // Pulisci il file di test
    if (fs.existsSync(testVideoPath)) {
      fs.unlinkSync(testVideoPath);
    }
  }
}

// Esegui il test se questo script viene chiamato direttamente
if (require.main === module) {
  testVideoUpload().catch(console.error);
}

module.exports = { testVideoUpload }; 