const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configura Cloudinary con le credenziali corrette
cloudinary.config({
  cloud_name: 'dsby0xktf',
  api_key: '797287421795773',
  api_secret: 'Cd2sF9MfqneRTcsZxLFCU3nLRiE'
});

async function testCloudinaryLocalUpload() {
  console.log('🧪 Test Cloudinary con file locale - Inizio');
  
  try {
    // Test 1: Verifica configurazione
    console.log('📋 Configurazione Cloudinary:', {
      cloud_name: cloudinary.config().cloud_name,
      api_key: cloudinary.config().api_key,
      api_secret: cloudinary.config().api_secret ? '***configurato***' : 'MANCANTE'
    });
    
    // Test 2: Crea un file di test locale
    console.log('📄 Creazione file di test locale...');
    
    const testContent = Buffer.from('Test file content for Cloudinary upload');
    const testFilePath = path.join(__dirname, 'test-file.txt');
    
    fs.writeFileSync(testFilePath, testContent);
    console.log('✅ File di test creato:', testFilePath);
    
    // Test 3: Upload del file locale come RAW
    console.log('📤 Upload file locale come RAW...');
    
    const uploadResult = await cloudinary.uploader.upload(testFilePath, {
      resource_type: 'raw',
      folder: 'campaign-media',
      public_id: `test-file-${Date.now()}`
    });
    
    console.log('✅ Upload completato:', {
      public_id: uploadResult.public_id,
      url: uploadResult.secure_url,
      resource_type: uploadResult.resource_type,
      format: uploadResult.format,
      bytes: uploadResult.bytes
    });
    
    // Test 4: Verifica accessibilità URL
    const axios = require('axios');
    try {
      const response = await axios.head(uploadResult.secure_url, { timeout: 10000 });
      console.log('✅ URL accessibile:', {
        status: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length']
      });
    } catch (urlError) {
      console.error('❌ URL non accessibile:', urlError.message);
    }
    
    // Test 5: Simula upload di un video (usando lo stesso file ma con estensione .mp4)
    console.log('🎬 Simula upload video...');
    
    const videoUploadResult = await cloudinary.uploader.upload(testFilePath, {
      resource_type: 'raw',
      folder: 'campaign-media',
      public_id: `test-video-${Date.now()}`,
      format: 'mp4'
    });
    
    console.log('✅ Upload video simulato completato:', {
      public_id: videoUploadResult.public_id,
      url: videoUploadResult.secure_url,
      resource_type: videoUploadResult.resource_type,
      format: videoUploadResult.format
    });
    
    // Test 6: Verifica URL video
    try {
      const response = await axios.head(videoUploadResult.secure_url, { timeout: 10000 });
      console.log('✅ URL video accessibile:', {
        status: response.status,
        contentType: response.headers['content-type']
      });
    } catch (urlError) {
      console.error('❌ URL video non accessibile:', urlError.message);
    }
    
    // Test 7: Lista file nella cartella
    console.log('📂 Lista file nella cartella campaign-media...');
    
    try {
      const listResult = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'campaign-media/',
        max_results: 5
      });
      
      console.log('📂 File trovati:', listResult.resources.map(r => ({
        public_id: r.public_id,
        resource_type: r.resource_type,
        format: r.format,
        created_at: r.created_at
      })));
    } catch (listError) {
      console.log('⚠️ Errore nel listing:', listError.message);
    }
    
    // Cleanup
    console.log('🧹 Pulizia...');
    
    // Elimina file locale
    try {
      fs.unlinkSync(testFilePath);
      console.log('✅ File locale eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione file locale:', e.message);
    }
    
    // Elimina file da Cloudinary
    try {
      await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'raw' });
      console.log('✅ File Cloudinary eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione file Cloudinary:', e.message);
    }
    
    try {
      await cloudinary.uploader.destroy(videoUploadResult.public_id, { resource_type: 'raw' });
      console.log('✅ Video Cloudinary eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione video Cloudinary:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Errore nel test:', error);
    console.error('Dettagli errore:', {
      message: error.message,
      http_code: error.http_code,
      name: error.name
    });
  }
  
  console.log('🧪 Test Cloudinary con file locale - Fine');
}

// Esegui il test
testCloudinaryLocalUpload().catch(console.error); 