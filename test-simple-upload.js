#!/usr/bin/env node

/**
 * Test semplice per il nuovo sistema di upload video
 */

require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const axios = require('axios');

// Configura Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dsby0xktf',
  api_key: process.env.CLOUDINARY_API_KEY || '797287421795773',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Cd2sF9MfqneRTcsZxLFCU3nLRiE'
});

async function testSimpleVideoUpload() {
  console.log('🎬 Test sistema semplificato upload video - Inizio');
  
  try {
    // Usa un video di esempio pubblico invece di creare un file fake
    const sampleVideoUrl = 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4';
    
    console.log('📤 Upload video di esempio con conversione automatica...');
    console.log('🔗 Video sorgente:', sampleVideoUrl);
    
    const uploadResult = await cloudinary.uploader.upload(sampleVideoUrl, {
      resource_type: 'video',
      folder: 'campaign-media',
      public_id: `test-video-simple-${Date.now()}`,
      format: 'mp4',
      transformation: [
        { quality: 'auto:good' },
        { video_codec: 'h264' },
        { audio_codec: 'aac' }
      ]
    });
    
    console.log('✅ Upload completato:', {
      public_id: uploadResult.public_id,
      url: uploadResult.secure_url,
      resource_type: uploadResult.resource_type,
      format: uploadResult.format
    });
    
    // Verifica che l'URL sia accessibile
    console.log('🔗 Test accessibilità URL...');
    
    try {
      const response = await axios.head(uploadResult.secure_url, { timeout: 10000 });
      console.log('✅ URL accessibile:', {
        status: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length']
      });
      
      // Verifica Content-Type
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('codecs=')) {
        console.log('⚠️ Content-Type contiene codec:', contentType);
        console.log('🔧 Useremo il proxy per pulire il Content-Type');
      } else {
        console.log('✅ Content-Type pulito:', contentType);
      }
      
    } catch (urlError) {
      console.error('❌ URL non accessibile:', urlError.message);
    }
    
    // Test del proxy
    console.log('🔧 Test proxy per Content-Type pulito...');
    
    // Estrai il path per il proxy
    const cloudinaryPattern = /https:\/\/res\.cloudinary\.com\/[^\/]+\/(.+)/;
    const match = uploadResult.secure_url.match(cloudinaryPattern);
    
    if (match) {
      const videoPath = match[1];
      const proxyUrl = `https://menuchat-backend.onrender.com/proxy/media/${videoPath}`;
      
      console.log('🔗 URL proxy:', proxyUrl);
      
      try {
        const proxyResponse = await axios.head(proxyUrl, { timeout: 10000 });
        console.log('✅ Proxy funzionante:', {
          status: proxyResponse.status,
          contentType: proxyResponse.headers['content-type'],
          contentLength: proxyResponse.headers['content-length']
        });
      } catch (proxyError) {
        console.error('❌ Proxy non funzionante:', proxyError.message);
      }
    }
    
    // Cleanup
    console.log('🧹 Pulizia...');
    
    try {
      await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'video' });
      console.log('✅ File Cloudinary eliminato');
    } catch (e) {
      console.log('⚠️ Errore eliminazione file Cloudinary:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Errore nel test:', error);
    console.error('Dettagli:', {
      message: error.message,
      http_code: error.http_code
    });
  }
  
  console.log('🎬 Test sistema semplificato - Fine');
}

// Esegui il test
testSimpleVideoUpload().catch(console.error); 