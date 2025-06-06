// Test finale con proxy funzionante per WhatsApp
const axios = require('axios');

async function testFinalSuccess() {
  console.log('🎉 TEST FINALE - PROXY FUNZIONANTE');
  console.log('='.repeat(50));
  
  // URL video originale e proxy
  const originalVideoUrl = 'https://res.cloudinary.com/dsby0xktf/video/upload/v1749221057/campaign-media/video-test-1749221054857.mp4';
  const proxyUrl = 'https://menuchat-backend.onrender.com/proxy/media/video/upload/v1749221057/campaign-media/video-test-1749221054857.mp4';
  
  console.log('📋 URL originale:', originalVideoUrl);
  console.log('📋 URL proxy:', proxyUrl);
  
  // Test 1: Verifica Content-Type originale vs proxy
  console.log('\n🔍 Test 1: Confronto Content-Type');
  
  try {
    const [originalResponse, proxyResponse] = await Promise.all([
      axios.head(originalVideoUrl, { timeout: 10000 }),
      axios.head(proxyUrl, { timeout: 10000 })
    ]);
    
    console.log('📋 Content-Type originale:', originalResponse.headers['content-type']);
    console.log('📋 Content-Type proxy:', proxyResponse.headers['content-type']);
    
    if (originalResponse.headers['content-type'].includes('codecs') && 
        proxyResponse.headers['content-type'] === 'video/mp4') {
      console.log('✅ SUCCESS! Proxy corregge il Content-Type');
    } else {
      console.log('❌ Problema con la correzione del Content-Type');
      return { success: false, error: 'Content-Type non corretto' };
    }
  } catch (error) {
    console.log('❌ Errore nel test Content-Type:', error.message);
    return { success: false, error: 'Errore accesso video' };
  }
  
  // Test 2: Crea template con URL proxy (usando variabili d'ambiente per sicurezza)
  console.log('\n📋 Test 2: Creazione template con proxy');
  
  // Usa variabili d'ambiente per le credenziali (più sicuro)
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    console.log('⚠️ Credenziali Twilio non trovate nelle variabili d\'ambiente');
    console.log('📋 Imposta TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN per testare la creazione del template');
    return { 
      success: true, 
      proxyWorking: true, 
      templateCreated: false,
      message: 'Proxy funziona, ma credenziali Twilio non disponibili per il test'
    };
  }
  
  const templateData = {
    friendly_name: `proxy_success_${Date.now()}`,
    language: 'it',
    variables: { "1": "customerName" },
    types: {
      'twilio/card': {
        title: 'Ciao {{1}}! Video con proxy funzionante! 🎉',
        media: [proxyUrl], // Usa l'URL del proxy
        actions: [
          {
            type: "URL",
            title: "Ordina Ora",
            url: "https://example.com/order"
          }
        ]
      }
    }
  };
  
  try {
    const contentApiBaseUrl = 'https://content.twilio.com/v1/Content';
    
    // Crea il template
    const contentResponse = await axios({
      method: 'post',
      url: contentApiBaseUrl,
      auth: {
        username: accountSid,
        password: authToken
      },
      data: templateData,
      timeout: 30000
    });
    
    const templateId = contentResponse.data.sid;
    console.log('✅ Template creato con successo!');
    console.log('📋 Template ID:', templateId);
    
    // Richiedi approvazione WhatsApp
    const approvalResponse = await axios({
      method: 'post',
      url: `${contentApiBaseUrl}/${templateId}/ApprovalRequests/whatsapp`,
      auth: {
        username: accountSid,
        password: authToken
      },
      data: {
        name: templateData.friendly_name,
        category: 'MARKETING'
      },
      timeout: 30000
    });
    
    console.log('✅ Richiesta approvazione inviata!');
    console.log('📋 Status:', approvalResponse.data.status);
    
    return {
      success: true,
      proxyWorking: true,
      templateCreated: true,
      templateId: templateId,
      templateName: templateData.friendly_name,
      approvalStatus: approvalResponse.data.status
    };
    
  } catch (templateError) {
    console.log('❌ Errore creazione template:', templateError.message);
    return {
      success: false,
      proxyWorking: true,
      templateCreated: false,
      error: templateError.message
    };
  }
}

// Esegui il test
testFinalSuccess()
  .then(result => {
    console.log('\n' + '='.repeat(50));
    console.log('📋 RISULTATO FINALE:');
    console.log('='.repeat(50));
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.proxyWorking) {
      console.log('\n🎉 SUCCESS! Proxy funziona correttamente');
      if (result.templateCreated) {
        console.log('🎉 Template creato e inviato per approvazione');
        console.log('📋 Ora WhatsApp dovrebbe approvare il template!');
      }
    } else {
      console.log('\n❌ Qualcosa non ha funzionato');
    }
  })
  .catch(error => {
    console.error('\n💥 Errore generale:', error.message);
  }); 