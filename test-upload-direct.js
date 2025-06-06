const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { uploadMedia } = require('./config/cloudinary');
const uploadController = require('./controllers/uploadController');

async function testUploadDirect() {
  console.log('🎬 Test upload diretto - Inizio');
  
  try {
    // Crea un file video di test
    console.log('📄 Creazione file video di test...');
    
    const testVideoContent = Buffer.from('FAKE_VIDEO_CONTENT_FOR_TESTING_WHATSAPP_COMPATIBILITY');
    const testVideoPath = path.join(__dirname, 'test-video.mp4');
    
    fs.writeFileSync(testVideoPath, testVideoContent);
    console.log('✅ File video di test creato:', testVideoPath);
    
    // Simula un oggetto file come quello che multer creerebbe
    const mockFile = {
      fieldname: 'file',
      originalname: 'test-video.mp4',
      encoding: '7bit',
      mimetype: 'video/mp4',
      destination: '',
      filename: 'test-video.mp4',
      path: testVideoPath,
      size: testVideoContent.length
    };
    
    // Simula req e res
    const mockReq = {
      file: null, // Sarà impostato dopo l'upload
      body: {
        campaignType: 'promo',
        optimizeForWhatsApp: 'true'
      }
    };
    
    const mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.responseData = data;
        return this;
      },
      statusCode: 200,
      responseData: null
    };
    
    console.log('📤 Test upload tramite multer...');
    
    // Usa multer per processare il file
    const upload = uploadMedia.single('file');
    
    // Simula una richiesta HTTP
    const mockHttpReq = {
      file: mockFile,
      body: mockReq.body,
      headers: { 'content-type': 'multipart/form-data' }
    };
    
    // Prova a caricare direttamente su Cloudinary
    const cloudinary = require('cloudinary').v2;
    
    console.log('☁️ Upload diretto su Cloudinary...');
    
    const uploadResult = await cloudinary.uploader.upload(testVideoPath, {
      resource_type: 'raw',
      folder: 'campaign-media',
      public_id: `test-video-direct-${Date.now()}`,
      format: 'mp4'
    });
    
    console.log('✅ Upload Cloudinary completato:', {
      public_id: uploadResult.public_id,
      url: uploadResult.secure_url,
      resource_type: uploadResult.resource_type,
      format: uploadResult.format,
      bytes: uploadResult.bytes
    });
    
    // Test dell'URL
    console.log('🔗 Test accessibilità URL...');
    
    const axios = require('axios');
    try {
      const urlTestResponse = await axios.head(uploadResult.secure_url, { timeout: 10000 });
      console.log('✅ URL accessibile:', {
        status: urlTestResponse.status,
        contentType: urlTestResponse.headers['content-type'],
        contentLength: urlTestResponse.headers['content-length']
      });
      
      // Questo è l'URL che dovrebbe funzionare con WhatsApp
      console.log('🎯 URL per WhatsApp:', uploadResult.secure_url);
      
    } catch (urlError) {
      console.error('❌ URL non accessibile:', urlError.message);
    }
    
    // Cleanup
    console.log('🧹 Pulizia...');
    
    try {
      fs.unlinkSync(testVideoPath);
      console.log('✅ File locale eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione file locale:', e.message);
    }
    
    try {
      await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'raw' });
      console.log('✅ File Cloudinary eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione file Cloudinary:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Errore nel test diretto:', error);
    console.error('Dettagli errore:', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
  }
  
  console.log('🎬 Test upload diretto - Fine');
}

// Esegui il test
testUploadDirect().catch(console.error); 