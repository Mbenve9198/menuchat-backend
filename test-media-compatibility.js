// Test della funzione ensureMediaCompatibility aggiornata
const axios = require('axios');

// Simula la funzione ensureMediaCompatibility aggiornata
const ensureMediaCompatibility = (mediaUrl) => {
  console.log('🔗 ensureMediaCompatibility - URL originale:', mediaUrl);
  
  if (!mediaUrl) {
    console.log('🔗 ensureMediaCompatibility - URL nullo, nessuna modifica');
    return mediaUrl;
  }
  
  // Verifica se è un URL Cloudinary
  const isCloudinaryUrl = mediaUrl.includes('cloudinary.com');
  
  // Verifica se è un video
  const isVideo = mediaUrl.includes('/video/') || 
                  mediaUrl.includes('.mp4') || 
                  mediaUrl.includes('.mov') || 
                  mediaUrl.includes('.avi') ||
                  mediaUrl.includes('.webm') ||
                  mediaUrl.includes('/raw/') && (
                    mediaUrl.includes('video-') || 
                    mediaUrl.endsWith('.mp4')
                  );
  
  console.log('🔗 ensureMediaCompatibility - Analisi URL:', {
    isCloudinaryUrl,
    isVideo,
    url: mediaUrl.substring(0, 100) + '...'
  });
  
  // Se non è Cloudinary, restituisci l'URL originale
  if (!isCloudinaryUrl) {
    console.log('🔗 ensureMediaCompatibility - Non è un URL Cloudinary, nessuna modifica');
    return mediaUrl;
  }
  
  // Per i video Cloudinary, usa il proxy per correggere il Content-Type
  if (isVideo) {
    // Estrai il path dal URL Cloudinary per costruire l'URL del proxy
    const cloudinaryPattern = /https:\/\/res\.cloudinary\.com\/[^\/]+\/(.+)/;
    const match = mediaUrl.match(cloudinaryPattern);
    
    if (match) {
      const videoPath = match[1];
      const backendUrl = 'https://menuchat-backend.onrender.com';
      const proxyUrl = `${backendUrl}/proxy/media/${videoPath}`;
      
      console.log('🔗 ensureMediaCompatibility - Video Cloudinary rilevato, uso proxy');
      console.log('🔗 Path estratto:', videoPath);
      console.log('🔗 URL proxy generato:', proxyUrl);
      
      return proxyUrl;
    } else {
      console.log('🔗 ensureMediaCompatibility - Impossibile estrarre path da URL Cloudinary:', mediaUrl);
    }
  }
  
  console.log('🔗 ensureMediaCompatibility - URL finale (nessuna modifica):', mediaUrl);
  return mediaUrl;
};

async function testMediaCompatibility() {
  console.log('🧪 TEST FUNZIONE ensureMediaCompatibility AGGIORNATA');
  console.log('='.repeat(60));
  
  // Test cases
  const testCases = [
    {
      name: 'Video Cloudinary normale',
      url: 'https://res.cloudinary.com/dsby0xktf/video/upload/v1749221057/campaign-media/video-test-1749221054857.mp4',
      expectedProxy: true
    },
    {
      name: 'Video Cloudinary raw (come nel tuo errore)',
      url: 'https://res.cloudinary.com/dsby0xktf/raw/upload/v1749222930/campaign-media/campaign-update-1749222930090.mp4',
      expectedProxy: true
    },
    {
      name: 'Immagine Cloudinary',
      url: 'https://res.cloudinary.com/dsby0xktf/image/upload/v1234567890/test-image.jpg',
      expectedProxy: false
    },
    {
      name: 'URL non Cloudinary',
      url: 'https://example.com/video.mp4',
      expectedProxy: false
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🔍 Test: ${testCase.name}`);
    console.log(`📋 URL originale: ${testCase.url}`);
    
    const result = ensureMediaCompatibility(testCase.url);
    const isProxy = result.includes('/proxy/media/');
    
    console.log(`📋 URL risultato: ${result}`);
    console.log(`📋 Usa proxy: ${isProxy ? 'SÌ' : 'NO'}`);
    console.log(`📋 Atteso proxy: ${testCase.expectedProxy ? 'SÌ' : 'NO'}`);
    
    if (isProxy === testCase.expectedProxy) {
      console.log('✅ TEST PASSATO');
    } else {
      console.log('❌ TEST FALLITO');
    }
  }
  
  // Test specifico per il tuo caso
  console.log('\n🎯 TEST SPECIFICO PER IL TUO CASO');
  const yourUrl = 'https://res.cloudinary.com/dsby0xktf/raw/upload/v1749222930/campaign-media/campaign-update-1749222930090.mp4';
  const yourResult = ensureMediaCompatibility(yourUrl);
  
  console.log('📋 URL del tuo errore:', yourUrl);
  console.log('📋 URL dopo ensureMediaCompatibility:', yourResult);
  
  if (yourResult.includes('/proxy/media/')) {
    console.log('✅ SUCCESS! Ora userà il proxy');
    
    // Testa se il proxy funziona
    console.log('\n🔍 Test del proxy per il tuo URL');
    try {
      const proxyResponse = await axios.head(yourResult, { timeout: 15000 });
      console.log('✅ Proxy accessibile!');
      console.log('📋 Content-Type proxy:', proxyResponse.headers['content-type']);
      console.log('📋 Status:', proxyResponse.status);
    } catch (proxyError) {
      console.log('❌ Proxy non accessibile:', proxyError.message);
      if (proxyError.response) {
        console.log('📋 Status:', proxyError.response.status);
      }
    }
  } else {
    console.log('❌ PROBLEMA! Non usa il proxy');
  }
}

// Esegui il test
testMediaCompatibility()
  .then(() => {
    console.log('\n🎉 Test completato!');
  })
  .catch(error => {
    console.error('\n💥 Errore durante il test:', error.message);
  }); 