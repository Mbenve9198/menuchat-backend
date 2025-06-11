const mongoose = require('mongoose');
const Restaurant = require('../models/Restaurant');
const RestaurantMessage = require('../models/RestaurantMessage');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const BotConfiguration = require('../models/BotConfiguration');

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

const checkMigrationCoverage = async () => {
  try {
    console.log('🔍 VERIFICA COPERTURA MIGRAZIONE');
    console.log('=' * 50);
    
    // Conta ristoranti totali e attivi
    const totalRestaurants = await Restaurant.countDocuments();
    const activeRestaurants = await Restaurant.find({ isActive: true });
    
    console.log(`📊 RISTORANTI:`);
    console.log(`   - Totali nel database: ${totalRestaurants}`);
    console.log(`   - Attivi: ${activeRestaurants.length}`);
    
    // Verifica quali ristoranti hanno BotConfiguration
    const restaurantsWithBot = [];
    const restaurantsWithoutBot = [];
    
    for (const restaurant of activeRestaurants) {
      const botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });
      if (botConfig) {
        restaurantsWithBot.push(restaurant);
      } else {
        restaurantsWithoutBot.push(restaurant);
      }
    }
    
    console.log(`\n🤖 CONFIGURAZIONE BOT:`);
    console.log(`   - Ristoranti CON bot configurato: ${restaurantsWithBot.length}`);
    console.log(`   - Ristoranti SENZA bot: ${restaurantsWithoutBot.length}`);
    
    if (restaurantsWithoutBot.length > 0) {
      console.log(`\n❌ Ristoranti senza bot:`);
      restaurantsWithoutBot.forEach(r => {
        console.log(`   - ${r.name} (${r._id})`);
      });
    }
    
    // Verifica copertura RestaurantMessage
    const restaurantsWithMessages = [];
    const restaurantsWithoutMessages = [];
    const partialCoverage = [];
    
    for (const restaurant of restaurantsWithBot) {
      const menuMessages = await RestaurantMessage.countDocuments({
        restaurant: restaurant._id,
        messageType: 'menu',
        isActive: true
      });
      
      const reviewMessages = await RestaurantMessage.countDocuments({
        restaurant: restaurant._id,
        messageType: 'review',
        isActive: true
      });
      
      if (menuMessages > 0 && reviewMessages > 0) {
        restaurantsWithMessages.push({
          restaurant,
          menuMessages,
          reviewMessages
        });
      } else if (menuMessages > 0 || reviewMessages > 0) {
        partialCoverage.push({
          restaurant,
          menuMessages,
          reviewMessages
        });
      } else {
        restaurantsWithoutMessages.push(restaurant);
      }
    }
    
    console.log(`\n📋 COPERTURA RESTAURANT MESSAGES:`);
    console.log(`   - Ristoranti CON messaggi completi (menu + review): ${restaurantsWithMessages.length}`);
    console.log(`   - Ristoranti con copertura PARZIALE: ${partialCoverage.length}`);
    console.log(`   - Ristoranti SENZA messaggi: ${restaurantsWithoutMessages.length}`);
    
    if (restaurantsWithoutMessages.length > 0) {
      console.log(`\n❌ Ristoranti senza RestaurantMessage:`);
      restaurantsWithoutMessages.forEach(r => {
        console.log(`   - ${r.name} (${r._id})`);
      });
    }
    
    if (partialCoverage.length > 0) {
      console.log(`\n⚠️ Ristoranti con copertura parziale:`);
      partialCoverage.forEach(({ restaurant, menuMessages, reviewMessages }) => {
        console.log(`   - ${restaurant.name}: menu=${menuMessages}, review=${reviewMessages}`);
      });
    }
    
    // Verifica template originali vs RestaurantMessage
    console.log(`\n🔄 VERIFICA MIGRAZIONE TEMPLATE:`);
    
    const templatesTotal = await WhatsAppTemplate.countDocuments({ isActive: true });
    const restaurantMessagesTotal = await RestaurantMessage.countDocuments({ isActive: true });
    
    console.log(`   - Template WhatsApp attivi: ${templatesTotal}`);
    console.log(`   - RestaurantMessage attivi: ${restaurantMessagesTotal}`);
    
    // Verifica esempio di ristorante con molti template
    const ilPorto = await Restaurant.findOne({ name: /il porto/i });
    if (ilPorto) {
      console.log(`\n🍽️ ESEMPIO: IL PORTO`);
      
      const templatesCount = await WhatsAppTemplate.countDocuments({
        restaurant: ilPorto._id,
        isActive: true
      });
      
      const messagesCount = await RestaurantMessage.countDocuments({
        restaurant: ilPorto._id,
        isActive: true
      });
      
      console.log(`   - Template originali: ${templatesCount}`);
      console.log(`   - RestaurantMessage: ${messagesCount}`);
      
      // Dettaglio per lingua
      const messagesByLanguage = await RestaurantMessage.aggregate([
        { $match: { restaurant: ilPorto._id, isActive: true } },
        { $group: { _id: { type: '$messageType', language: '$language' }, count: { $sum: 1 } } }
      ]);
      
      console.log(`   - Dettaglio per tipo e lingua:`);
      messagesByLanguage.forEach(item => {
        console.log(`     ${item._id.type} (${item._id.language}): ${item.count}`);
      });
    }
    
    // Raccomandazioni
    console.log(`\n💡 RACCOMANDAZIONI:`);
    if (restaurantsWithoutMessages.length > 0) {
      console.log(`   ❗ ${restaurantsWithoutMessages.length} ristoranti NON hanno RestaurantMessage`);
      console.log(`   🔧 Eseguire migrazione per questi ristoranti`);
    }
    
    if (partialCoverage.length > 0) {
      console.log(`   ⚠️ ${partialCoverage.length} ristoranti hanno copertura PARZIALE`);
      console.log(`   🔧 Verificare template mancanti per questi ristoranti`);
    }
    
    if (restaurantsWithMessages.length === restaurantsWithBot.length) {
      console.log(`   ✅ TUTTI i ristoranti con bot hanno RestaurantMessage completi!`);
    }
    
  } catch (error) {
    console.error('❌ Errore verifica:', error);
  }
};

const main = async () => {
  try {
    await connectDB();
    await checkMigrationCoverage();
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnesso dal database');
  }
};

main(); 