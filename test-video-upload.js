#!/usr/bin/env node

/**
 * Script di test per verificare l'upload e l'ottimizzazione dei video per WhatsApp
 * 
 * Uso: node test-video-upload.js
 */

const axios = require('axios');

// URL di test problematici che abbiamo visto
const testUrls = [
  'https://res.cloudinary.com/dsby0xktf/raw/upload/v1749217405/campaign-media/campaign-update-1749217404671.MOV.mp4',
  'https://res.cloudinary.com/dsby0xktf/video/upload/v1749217405/campaign-media/video-update-1749217404671.mp4',
  'https://res.cloudinary.com/dsby0xktf/video/upload/q_auto:good,vc_h264,ac_aac,fl_streaming_attachment/v1749217405/campaign-media/video-update-1749217404671.mp4'
];

async function testVideoUrl(url) {
  console.log(`\n🧪 Testing URL: ${url}`);
  console.log('='.repeat(80));
  
  try {
    const response = await axios.head(url, { timeout: 10000 });
    console.log('✅ URL accessibile');
    console.log('📋 Status:', response.status);
    console.log('📋 Content-Type:', response.headers['content-type']);
    console.log('📋 Content-Length:', response.headers['content-length']);
    
    // Controlla problemi comuni
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('codecs=')) {
      console.log('⚠️  PROBLEMA: Content-Type contiene parametri codec');
    }
    
    if (url.includes('.MOV.mp4')) {
      console.log('⚠️  PROBLEMA: URL contiene estensioni multiple');
    }
    
    if (url.match(/\/upload\/[^\/]*[qf]_[^\/]*\//)) {
      console.log('⚠️  PROBLEMA: URL contiene trasformazioni Cloudinary');
    }
    
  } catch (error) {
    console.log('❌ URL non accessibile');
    console.log('📋 Errore:', error.message);
    
    if (error.response) {
      console.log('📋 Status:', error.response.status);
      console.log('📋 Status Text:', error.response.statusText);
    }
  }
}

async function runTests() {
  console.log('🎬 Test compatibilità URL video per WhatsApp');
  console.log('='.repeat(80));
  
  for (const url of testUrls) {
    await testVideoUrl(url);
  }
  
  console.log('\n✨ Test completati');
  console.log('\n💡 Raccomandazioni:');
  console.log('1. Usa sempre estensione .mp4 per i video');
  console.log('2. Evita trasformazioni nell\'URL per WhatsApp');
  console.log('3. Carica come "raw" se il Content-Type ha parametri codec');
  console.log('4. Testa sempre l\'URL prima di inviare a WhatsApp');
}

// Esegui i test se questo script viene chiamato direttamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testVideoUrl, runTests }; 