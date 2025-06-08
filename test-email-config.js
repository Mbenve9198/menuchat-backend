const mongoose = require('mongoose');
const emailService = require('./services/emailService');
require('dotenv').config();

/**
 * Script per testare la configurazione email
 * Verifica che Resend sia configurato correttamente
 */

async function testEmailConfiguration() {
  console.log('🔍 Test Configurazione Email MenuChat\n');
  
  // 1. Verifica variabili ambiente
  console.log('📋 Verifica Variabili Ambiente:');
  console.log(`   RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✅ Configurata' : '❌ Mancante'}`);
  console.log(`   RESEND_FROM_EMAIL: ${process.env.RESEND_FROM_EMAIL ? '✅ ' + process.env.RESEND_FROM_EMAIL : '❌ Mancante'}`);
  console.log(`   FROM_EMAIL (fallback): ${process.env.FROM_EMAIL ? '✅ ' + process.env.FROM_EMAIL : '❌ Mancante'}`);
  
  // 2. Verifica configurazione servizio
  console.log('\n🔧 Configurazione Servizio Email:');
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'noreply@menuchat.com';
  console.log(`   Email mittente: ${fromEmail}`);
  
  if (fromEmail === 'noreply@menuchat.com') {
    console.log('   ⚠️  ATTENZIONE: Usando dominio di default non verificato!');
    console.log('   📝 Configura RESEND_FROM_EMAIL con un dominio verificato');
  }
  
  // 3. Test connessione database
  console.log('\n🗄️  Test Connessione Database:');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('   ✅ Database connesso');
  } catch (error) {
    console.log('   ❌ Errore database:', error.message);
    return;
  }
  
  // 4. Test invio email semplice
  console.log('\n📧 Test Invio Email:');
  
  if (!process.env.RESEND_API_KEY) {
    console.log('   ❌ Impossibile testare: RESEND_API_KEY mancante');
    return;
  }
  
  const testEmail = process.argv[2] || 'test@example.com';
  console.log(`   📮 Invio email di test a: ${testEmail}`);
  
  try {
    // Crea dati di test minimi
    const testData = {
      restaurantName: 'Test Restaurant',
      metrics: {
        menusSent: 5,
        reviewRequests: 3,
        reviewsCollected: 2,
        campaignsSent: 1
      },
      period: {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date()
      }
    };
    
    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: testEmail,
      languagePreference: 'italiano'
    };
    
    const mockRestaurant = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Restaurant'
    };
    
    // Test invio
    const result = await emailService.sendDailyReport(mockUser, mockRestaurant, testData.metrics);
    
    if (result.success) {
      console.log('   ✅ Email inviata con successo!');
      console.log(`   📧 Email ID: ${result.emailId}`);
      console.log(`   📮 Resend ID: ${result.resendId}`);
      console.log('\n🎉 Configurazione email funzionante!');
      console.log('💡 Controlla la tua casella email per verificare la ricezione');
    } else {
      console.log('   ❌ Errore nell\'invio:', result.error);
      console.log('\n🔧 Possibili soluzioni:');
      console.log('   1. Verifica che RESEND_API_KEY sia valida');
      console.log('   2. Configura RESEND_FROM_EMAIL con un dominio verificato');
      console.log('   3. Controlla il dashboard Resend per errori');
    }
    
  } catch (error) {
    console.log('   ❌ Errore nel test:', error.message);
    console.log('\n🔧 Verifica la configurazione e riprova');
  }
  
  // 5. Suggerimenti finali
  console.log('\n📝 Checklist Configurazione Email:');
  console.log('   □ RESEND_API_KEY configurata nel dashboard Render');
  console.log('   □ RESEND_FROM_EMAIL configurata con dominio verificato');
  console.log('   □ Dominio aggiunto e verificato nel dashboard Resend');
  console.log('   □ DNS records configurati per il dominio');
  console.log('   □ Test di invio completato con successo');
  
  mongoose.disconnect();
}

// Esegui il test
if (require.main === module) {
  console.log('📧 Test Configurazione Email');
  console.log('Uso: node test-email-config.js [email-destinatario]');
  console.log('Esempio: node test-email-config.js marco.benvenuti91@gmail.com\n');
  
  testEmailConfiguration().catch(error => {
    console.error('❌ Errore nel test:', error);
    process.exit(1);
  });
}

module.exports = { testEmailConfiguration }; 