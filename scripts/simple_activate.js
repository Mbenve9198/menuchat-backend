const mongoose = require('mongoose');
const RestaurantMessage = require('../models/RestaurantMessage');
const Restaurant = require('../models/Restaurant');

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

const activateAllMessages = async () => {
  try {
    console.log('🚀 ATTIVAZIONE SEMPLICE DI TUTTI I RESTAURANT MESSAGES');
    console.log('Il nuovo sistema non dipende dallo stato APPROVED dei template vecchi!\n');
    
    // Conta i messaggi attuali
    const totalInactive = await RestaurantMessage.countDocuments({ isActive: false });
    const totalActive = await RestaurantMessage.countDocuments({ isActive: true });
    
    console.log(`📊 Stato attuale:`);
    console.log(`   - Inattivi: ${totalInactive}`);
    console.log(`   - Attivi: ${totalActive}`);
    
    if (totalInactive === 0) {
      console.log('\n✅ Tutti i messaggi sono già attivi!');
      return;
    }
    
    console.log(`\n🔄 Attivando ${totalInactive} messaggi...`);
    
    // Attiva tutti i messaggi inattivi
    const result = await RestaurantMessage.updateMany(
      { isActive: false },
      { 
        $set: { 
          isActive: true,
          lastModified: new Date(),
          modifiedBy: 'activation_script'
        }
      }
    );
    
    console.log(`✅ Messaggi attivati: ${result.modifiedCount}`);
    
    // Verifica finale
    const finalActive = await RestaurantMessage.countDocuments({ isActive: true });
    console.log(`\n📈 TOTALE MESSAGGI ATTIVI: ${finalActive}`);
    
    // Statistiche per tipo
    const byType = await RestaurantMessage.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$messageType', count: { $sum: 1 } } }
    ]);
    
    console.log(`\n📊 Per tipo:`);
    byType.forEach(type => {
      console.log(`   ${type._id}: ${type.count}`);
    });
    
    // Statistiche per lingua
    const byLanguage = await RestaurantMessage.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$language', count: { $sum: 1 } } }
    ]);
    
    console.log(`\n🌍 Per lingua:`);
    byLanguage.forEach(lang => {
      console.log(`   ${lang._id}: ${lang.count}`);
    });
    
    // Controlla Il Porto
    const ilPorto = await Restaurant.findOne({ name: /il porto/i });
    if (ilPorto) {
      const ilPortoMessages = await RestaurantMessage.find({ 
        restaurant: ilPorto._id, 
        isActive: true 
      });
      
      console.log(`\n🍽️ IL PORTO - MESSAGGI ATTIVI: ${ilPortoMessages.length}`);
      ilPortoMessages.forEach(msg => {
        console.log(`   - ${msg.messageType} (${msg.language}): "${msg.messageBody.substring(0, 40)}..."`);
        if (msg.ctaUrl) {
          console.log(`     🔗 CTA: ${msg.ctaText} → ${msg.ctaUrl}`);
        }
      });
    }
    
    console.log(`\n🎉 ATTIVAZIONE COMPLETATA!`);
    console.log(`💡 Il nuovo sistema è ora pronto per l'uso.`);
    
  } catch (error) {
    console.error('❌ Errore attivazione:', error);
  }
};

const main = async () => {
  try {
    await connectDB();
    await activateAllMessages();
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnesso dal database');
  }
};

main(); 