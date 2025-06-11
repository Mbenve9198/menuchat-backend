const mongoose = require('mongoose');
const RestaurantMessage = require('../models/RestaurantMessage');
const Restaurant = require('../models/Restaurant');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');

const connectDB = async () => {
  try {
    const mongoURI = 'mongodb+srv://marco:XFpWdkYWfzA5KpWW@cluster0.cit5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoURI);
    console.log('✅ Connesso al database MongoDB');
  } catch (error) {
    console.error('❌ Errore connessione database:', error);
    process.exit(1);
  }
};

const activateMessages = async () => {
  try {
    console.log('🔧 CONTROLLO E ATTIVAZIONE RESTAURANT MESSAGES...');
    
    // Prima verifichiamo perché i messaggi non sono attivi
    const inactiveMessages = await RestaurantMessage.find({ isActive: false }).limit(5);
    
    console.log(`\n📋 PRIMI 5 MESSAGGI INATTIVI (Campione):`);
    for (const msg of inactiveMessages) {
      const restaurant = await Restaurant.findById(msg.restaurant);
      const sourceTemplate = msg.sourceTemplate ? await WhatsAppTemplate.findById(msg.sourceTemplate) : null;
      
      console.log(`\n   📝 RestaurantMessage ID: ${msg._id}`);
      console.log(`   🏪 Ristorante: ${restaurant?.name || 'Unknown'}`);
      console.log(`   📧 Tipo: ${msg.messageType}`);
      console.log(`   🌍 Lingua: ${msg.language}`);
      console.log(`   ✅ isActive: ${msg.isActive}`);
      
      if (sourceTemplate) {
        console.log(`   🔗 Template originale:`);
        console.log(`      - Nome: ${sourceTemplate.name}`);
        console.log(`      - Status: ${sourceTemplate.status}`);
        console.log(`      - isActive: ${sourceTemplate.isActive}`);
        
        // Controlla i criteri di attivazione
        const shouldBeActive = sourceTemplate.isActive && sourceTemplate.status === 'APPROVED';
        console.log(`   🤔 Dovrebbe essere attivo? ${shouldBeActive}`);
        
        if (shouldBeActive && !msg.isActive) {
          console.log(`   🔄 ATTIVANDO messaggio...`);
          msg.isActive = true;
          await msg.save();
          console.log(`   ✅ Messaggio attivato!`);
        }
      } else {
        console.log(`   ⚠️ Nessun template sorgente trovato`);
      }
    }
    
    // Attiva tutti i messaggi che dovrebbero essere attivi
    console.log(`\n🔄 ATTIVAZIONE MASSIVA...`);
    
    const messagesToActivate = await RestaurantMessage.find({ isActive: false });
    let activated = 0;
    let skipped = 0;
    
    for (const msg of messagesToActivate) {
      if (msg.sourceTemplate) {
        const sourceTemplate = await WhatsAppTemplate.findById(msg.sourceTemplate);
        
        if (sourceTemplate && sourceTemplate.isActive && sourceTemplate.status === 'APPROVED') {
          msg.isActive = true;
          await msg.save();
          activated++;
        } else {
          skipped++;
        }
      } else {
        // Se non ha template sorgente, attivalo comunque (potrebbe essere stato creato manualmente)
        msg.isActive = true;
        await msg.save();
        activated++;
      }
    }
    
    console.log(`\n📊 RISULTATI ATTIVAZIONE:`);
    console.log(`   ✅ Messaggi attivati: ${activated}`);
    console.log(`   ⏸️ Messaggi saltati: ${skipped}`);
    
    // Verifica finale
    const totalActive = await RestaurantMessage.countDocuments({ isActive: true });
    console.log(`\n📈 TOTALE MESSAGGI ATTIVI DOPO L'OPERAZIONE: ${totalActive}`);
    
    // Statistiche finali per Il Porto
    const ilPorto = await Restaurant.findOne({ name: /il porto/i });
    if (ilPorto) {
      const ilPortoMessages = await RestaurantMessage.find({ 
        restaurant: ilPorto._id, 
        isActive: true 
      });
      
      console.log(`\n🍽️ IL PORTO - MESSAGGI ATTIVI: ${ilPortoMessages.length}`);
      ilPortoMessages.forEach(msg => {
        console.log(`   - ${msg.messageType} (${msg.language}): "${msg.messageBody.substring(0, 40)}..."`);
      });
    }
    
  } catch (error) {
    console.error('❌ Errore attivazione:', error);
  }
};

const main = async () => {
  try {
    await connectDB();
    await activateMessages();
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnesso dal database');
  }
};

main(); 