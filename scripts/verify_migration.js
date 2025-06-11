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

const verifyMigration = async () => {
  try {
    console.log('🔍 VERIFICA STATO MIGRAZIONE:');
    console.log('=' * 50);
    
    const total = await RestaurantMessage.countDocuments();
    const active = await RestaurantMessage.countDocuments({ isActive: true });
    
    console.log(`📊 Total RestaurantMessage: ${total}`);
    console.log(`📊 Active RestaurantMessage: ${active}`);
    
    // Raggruppa per tipo
    const byType = await RestaurantMessage.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$messageType', count: { $sum: 1 } } }
    ]);
    
    console.log('\n📈 Per tipo:');
    byType.forEach(type => {
      console.log(`   ${type._id}: ${type.count}`);
    });
    
    // Raggruppa per lingua
    const byLanguage = await RestaurantMessage.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$language', count: { $sum: 1 } } }
    ]);
    
    console.log('\n🌍 Per lingua:');
    byLanguage.forEach(lang => {
      console.log(`   ${lang._id}: ${lang.count}`);
    });
    
    // Controlla specificamente Il Porto
    const ilPorto = await Restaurant.findOne({ name: /il porto/i });
    if (ilPorto) {
      console.log(`\n🍽️ CONTROLLO "IL PORTO" (${ilPorto.name}):`);
      
      const ilPortoMessages = await RestaurantMessage.find({ 
        restaurant: ilPorto._id, 
        isActive: true 
      });
      
      console.log(`   Total messages: ${ilPortoMessages.length}`);
      
      ilPortoMessages.forEach(msg => {
        console.log(`   - ${msg.messageType} (${msg.language}): "${msg.messageBody.substring(0, 40)}..."`);
        if (msg.ctaUrl) {
          console.log(`     CTA: ${msg.ctaText} - ${msg.ctaUrl}`);
        }
      });
    } else {
      console.log('\n❌ Ristorante "Il Porto" non trovato');
    }
    
    // Lista tutti i ristoranti con RestaurantMessage
    console.log('\n🏪 RISTORANTI CON RESTAURANT MESSAGES:');
    const restaurantMessages = await RestaurantMessage.aggregate([
      { $match: { isActive: true } },
      { $group: { 
        _id: '$restaurant', 
        messageCount: { $sum: 1 },
        types: { $addToSet: '$messageType' },
        languages: { $addToSet: '$language' }
      }}
    ]);
    
    for (const rm of restaurantMessages) {
      const restaurant = await Restaurant.findById(rm._id);
      console.log(`   ${restaurant?.name || 'Unknown'}: ${rm.messageCount} msg (${rm.types.join(', ')}) [${rm.languages.join(', ')}]`);
    }
    
  } catch (error) {
    console.error('❌ Errore verifica:', error);
  }
};

const main = async () => {
  try {
    await connectDB();
    await verifyMigration();
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnesso dal database');
  }
};

main(); 