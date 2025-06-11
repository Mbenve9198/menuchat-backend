const mongoose = require('mongoose');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
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

/**
 * Determina il tipo di messaggio basandosi sul template
 */
const determineMessageType = (template) => {
  if (!template || !template.name) return 'menu';
  
  const name = template.name.toLowerCase();
  
  if (name.includes('review') || name.includes('recensione') || template.type === 'REVIEW') {
    return 'review';
  }
  
  return 'menu';
};

/**
 * Converte un template WhatsApp in RestaurantMessage
 */
const convertTemplateToRestaurantMessage = (template, restaurantId) => {
  const messageType = determineMessageType(template);
  
  let messageBody = '';
  let ctaUrl = null;
  let ctaText = null;
  let mediaUrl = null;
  
  // Estrai il corpo del messaggio
  if (template.components && template.components.body && template.components.body.text) {
    messageBody = template.components.body.text;
  } else if (template.body) {
    messageBody = template.body;
  }
  
  // Gestisci i pulsanti per CTA
  if (template.components && template.components.buttons && template.components.buttons.length > 0) {
    const button = template.components.buttons[0];
    ctaUrl = button.url || button.phoneNumber;
    ctaText = button.text;
  }
  
  // Gestisci media per template MEDIA
  if (template.type === 'MEDIA' && template.components && template.components.header && template.components.header.example) {
    mediaUrl = template.components.header.example;
  }
  
  // Determina lingua dal template name o default a 'it'
  let language = 'it';
  const nameLower = template.name.toLowerCase();
  if (nameLower.includes('_en') || nameLower.includes('english')) language = 'en';
  else if (nameLower.includes('_es') || nameLower.includes('spanish')) language = 'es';
  else if (nameLower.includes('_fr') || nameLower.includes('french')) language = 'fr';
  else if (nameLower.includes('_de') || nameLower.includes('german')) language = 'de';
  
  return {
    restaurant: restaurantId,
    messageType,
    language,
    messageBody,
    mediaUrl,
    ctaUrl,
    ctaText: ctaText || (messageType === 'menu' ? '🔗 Menu' : '⭐ Lascia una recensione'),
    isActive: true,
    createdAt: new Date(),
    lastModified: new Date(),
    migrationSource: 'completion_script',
    originalTemplateId: template._id
  };
};

const completeMigration = async () => {
  try {
    console.log('🔄 COMPLETAMENTO MIGRAZIONE PER RISTORANTI MANCANTI');
    console.log('=' * 60);
    
    // Trova ristoranti senza RestaurantMessage
    const allRestaurants = await Restaurant.find({ isActive: true });
    const restaurantsToMigrate = [];
    
    for (const restaurant of allRestaurants) {
      const existingMessages = await RestaurantMessage.countDocuments({
        restaurant: restaurant._id
      });
      
      if (existingMessages === 0) {
        restaurantsToMigrate.push(restaurant);
      }
    }
    
    console.log(`🎯 Ristoranti da migrare: ${restaurantsToMigrate.length}`);
    
    let totalConverted = 0;
    
    for (const restaurant of restaurantsToMigrate) {
      console.log(`\n🍽️ Migrando: ${restaurant.name} (${restaurant._id})`);
      
      // Trova template per questo ristorante
      const templates = await WhatsAppTemplate.find({
        restaurant: restaurant._id,
        isActive: true
      });
      
      console.log(`   📋 Template trovati: ${templates.length}`);
      
      if (templates.length === 0) {
        console.log(`   ⚠️ Nessun template trovato per ${restaurant.name}`);
        continue;
      }
      
      let converted = 0;
      
      for (const template of templates) {
        try {
          // Controlla se esiste già un RestaurantMessage per questo template
          const existingMessage = await RestaurantMessage.findOne({
            restaurant: restaurant._id,
            originalTemplateId: template._id
          });
          
          if (existingMessage) {
            console.log(`   ⏩ Skip template già migrato: ${template.name}`);
            continue;
          }
          
          // Converti il template
          const messageData = convertTemplateToRestaurantMessage(template, restaurant._id);
          
          // Controlla se esiste già un messaggio simile (stesso tipo e lingua)
          const similarMessage = await RestaurantMessage.findOne({
            restaurant: restaurant._id,
            messageType: messageData.messageType,
            language: messageData.language
          });
          
          if (similarMessage) {
            console.log(`   ⏩ Skip: messaggio simile già esistente (${messageData.messageType}/${messageData.language})`);
            continue;
          }
          
          // Crea il nuovo RestaurantMessage
          const newMessage = new RestaurantMessage(messageData);
          await newMessage.save();
          
          console.log(`   ✅ Convertito: ${template.name} → ${messageData.messageType} (${messageData.language})`);
          converted++;
          totalConverted++;
          
        } catch (error) {
          console.error(`   ❌ Errore template ${template.name}:`, error.message);
        }
      }
      
      console.log(`   📊 Convertiti per questo ristorante: ${converted}`);
    }
    
    // Verifica finale
    console.log(`\n📈 RISULTATI FINALI:`);
    console.log(`   - Template convertiti: ${totalConverted}`);
    
    const finalActiveMessages = await RestaurantMessage.countDocuments({ isActive: true });
    console.log(`   - RestaurantMessage attivi totali: ${finalActiveMessages}`);
    
    // Nuova verifica copertura
    const restaurantsWithCompleteMessages = [];
    const restaurantsStillMissing = [];
    
    for (const restaurant of allRestaurants) {
      const menuCount = await RestaurantMessage.countDocuments({
        restaurant: restaurant._id,
        messageType: 'menu',
        isActive: true
      });
      
      const reviewCount = await RestaurantMessage.countDocuments({
        restaurant: restaurant._id,
        messageType: 'review',
        isActive: true
      });
      
      if (menuCount > 0 && reviewCount > 0) {
        restaurantsWithCompleteMessages.push(restaurant);
      } else if (menuCount === 0 && reviewCount === 0) {
        restaurantsStillMissing.push(restaurant);
      }
    }
    
    console.log(`\n✅ Ristoranti con messaggi completi: ${restaurantsWithCompleteMessages.length}/${allRestaurants.length}`);
    
    if (restaurantsStillMissing.length > 0) {
      console.log(`\n❌ Ristoranti ancora senza messaggi:`);
      restaurantsStillMissing.forEach(r => {
        console.log(`   - ${r.name} (${r._id})`);
      });
    } else {
      console.log(`\n🎉 TUTTI i ristoranti hanno almeno alcuni messaggi!`);
    }
    
  } catch (error) {
    console.error('❌ Errore completamento migrazione:', error);
  }
};

const main = async () => {
  try {
    await connectDB();
    await completeMigration();
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnesso dal database');
  }
};

main(); 