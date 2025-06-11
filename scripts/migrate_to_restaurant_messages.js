const mongoose = require('mongoose');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const RestaurantMessage = require('../models/RestaurantMessage');
const Restaurant = require('../models/Restaurant');
const BotConfiguration = require('../models/BotConfiguration');

// Connessione al database
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://marco:XFpWdkYWfzA5KpWW@cluster0.cit5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
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
  if (template.type === 'REVIEW' || template.name.toLowerCase().includes('review')) {
    return 'review';
  }
  // Menu è il default per tutti gli altri tipi (MEDIA, CALL_TO_ACTION, etc.)
  return 'menu';
};

/**
 * Estrae URL del media dal template
 */
const extractMediaUrl = (template) => {
  if (template.components?.header?.type === 'DOCUMENT' && template.components.header.example) {
    return template.components.header.example;
  }
  return null;
};

/**
 * Estrae URL della CTA dal template
 */
const extractCtaUrl = (template) => {
  if (template.components?.buttons && template.components.buttons.length > 0) {
    const urlButton = template.components.buttons.find(button => button.type === 'URL');
    if (urlButton) {
      return urlButton.url;
    }
  }
  return null;
};

/**
 * Estrae il testo della CTA dal template
 */
const extractCtaText = (template) => {
  if (template.components?.buttons && template.components.buttons.length > 0) {
    const urlButton = template.components.buttons.find(button => button.type === 'URL');
    if (urlButton) {
      return urlButton.text;
    }
  }
  
  // Fallback basato sul tipo di messaggio
  const messageType = determineMessageType(template);
  return messageType === 'menu' ? '🔗 Menu' : '⭐ Lascia una recensione';
};

/**
 * Converte un template WhatsApp in RestaurantMessage
 */
const convertTemplateToRestaurantMessage = (template) => {
  const messageType = determineMessageType(template);
  const mediaUrl = extractMediaUrl(template);
  const ctaUrl = extractCtaUrl(template);
  const ctaText = extractCtaText(template);
  
  // Il corpo del messaggio dal template (già contiene le variabili {{1}}, ecc.)
  const messageBody = template.components?.body?.text || '';
  
  return {
    restaurant: template.restaurant,
    messageType: messageType,
    language: template.language || 'it',
    messageBody: messageBody,
    mediaUrl: mediaUrl,
    mediaType: mediaUrl ? 'pdf' : undefined,
    ctaUrl: ctaUrl,
    ctaText: ctaText,
    isActive: template.isActive && template.status === 'APPROVED',
    sourceTemplate: template._id,
    lastModified: new Date(),
    modifiedBy: 'system'
  };
};

/**
 * Migra tutti i template WhatsApp al nuovo sistema
 */
const migrateTemplates = async () => {
  try {
    console.log('🚀 Inizio migrazione template WhatsApp a RestaurantMessage...');
    
    // Trova tutti i template attivi e approvati
    const templates = await WhatsAppTemplate.find({
      isActive: true,
      status: 'APPROVED'
    }).populate('restaurant');
    
    console.log(`📊 Trovati ${templates.length} template da migrare`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const template of templates) {
      try {
        console.log(`\n🔄 Elaborazione template: ${template.name} (${template.restaurant?.name || 'Ristorante sconosciuto'})`);
        
        // Converti template in RestaurantMessage
        const restaurantMessageData = convertTemplateToRestaurantMessage(template);
        
        console.log(`   - Tipo messaggio: ${restaurantMessageData.messageType}`);
        console.log(`   - Lingua: ${restaurantMessageData.language}`);
        console.log(`   - Corpo messaggio: "${restaurantMessageData.messageBody.substring(0, 50)}..."`);
        
        // Controlla se esiste già un RestaurantMessage per questo ristorante+tipo+lingua
        const existingMessage = await RestaurantMessage.findOne({
          restaurant: restaurantMessageData.restaurant,
          messageType: restaurantMessageData.messageType,
          language: restaurantMessageData.language
        });
        
        if (existingMessage) {
          console.log(`   ⚠️ Esiste già un RestaurantMessage per questo ristorante+tipo+lingua`);
          console.log(`   📝 Aggiorno il messaggio esistente con i nuovi dati...`);
          
          // Aggiorna il messaggio esistente
          existingMessage.messageBody = restaurantMessageData.messageBody;
          existingMessage.mediaUrl = restaurantMessageData.mediaUrl;
          existingMessage.mediaType = restaurantMessageData.mediaType;
          existingMessage.ctaUrl = restaurantMessageData.ctaUrl;
          existingMessage.ctaText = restaurantMessageData.ctaText;
          existingMessage.isActive = restaurantMessageData.isActive;
          existingMessage.sourceTemplate = restaurantMessageData.sourceTemplate;
          existingMessage.lastModified = new Date();
          existingMessage.modifiedBy = 'migration';
          
          await existingMessage.save();
          console.log(`   ✅ Messaggio aggiornato: ${existingMessage._id}`);
        } else {
          // Crea nuovo RestaurantMessage
          const restaurantMessage = new RestaurantMessage(restaurantMessageData);
          await restaurantMessage.save();
          console.log(`   ✅ Nuovo messaggio creato: ${restaurantMessage._id}`);
        }
        
        migrated++;
        
      } catch (error) {
        console.error(`   ❌ Errore migrazione template ${template.name}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n📊 RIEPILOGO MIGRAZIONE:`);
    console.log(`   ✅ Template migrati: ${migrated}`);
    console.log(`   ⚠️ Template saltati: ${skipped}`);
    console.log(`   ❌ Errori: ${errors}`);
    
    return { migrated, skipped, errors };
    
  } catch (error) {
    console.error('❌ Errore generale nella migrazione:', error);
    throw error;
  }
};

/**
 * Verifica la migrazione confrontando i dati
 */
const verifyMigration = async () => {
  try {
    console.log('\n🔍 Verifica migrazione...');
    
    const totalTemplates = await WhatsAppTemplate.countDocuments({
      isActive: true,
      status: 'APPROVED'
    });
    
    const totalRestaurantMessages = await RestaurantMessage.countDocuments({
      isActive: true
    });
    
    console.log(`📊 Template attivi e approvati: ${totalTemplates}`);
    console.log(`📊 RestaurantMessage attivi: ${totalRestaurantMessages}`);
    
    // Raggruppa per ristorante
    const restaurantMessagesByRestaurant = await RestaurantMessage.aggregate([
      { $match: { isActive: true } },
      { 
        $group: { 
          _id: "$restaurant", 
          menuCount: { 
            $sum: { $cond: [{ $eq: ["$messageType", "menu"] }, 1, 0] } 
          },
          reviewCount: { 
            $sum: { $cond: [{ $eq: ["$messageType", "review"] }, 1, 0] } 
          },
          total: { $sum: 1 }
        } 
      }
    ]);
    
    console.log(`\n📈 STATISTICHE PER RISTORANTE:`);
    for (const stat of restaurantMessagesByRestaurant) {
      const restaurant = await Restaurant.findById(stat._id);
      console.log(`   ${restaurant?.name || 'Ristorante sconosciuto'}: ${stat.menuCount} menu, ${stat.reviewCount} review (totale: ${stat.total})`);
    }
    
  } catch (error) {
    console.error('❌ Errore verifica migrazione:', error);
  }
};

/**
 * Script principale
 */
const main = async () => {
  try {
    await connectDB();
    
    console.log('🎯 MIGRAZIONE TEMPLATE WHATSAPP → RESTAURANT MESSAGE');
    console.log('=' * 60);
    
    // Esegui migrazione
    const result = await migrateTemplates();
    
    // Verifica risultati
    await verifyMigration();
    
    console.log('\n🎉 Migrazione completata!');
    console.log('\n💡 NOTA: I template WhatsApp originali sono stati mantenuti per retrocompatibilità.');
    console.log('💡 Il sistema userà automaticamente RestaurantMessage quando disponibili.');
    
  } catch (error) {
    console.error('❌ Errore esecuzione script:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnesso dal database');
    process.exit(0);
  }
};

// Esegui solo se il file viene chiamato direttamente
if (require.main === module) {
  main();
}

module.exports = {
  migrateTemplates,
  verifyMigration,
  convertTemplateToRestaurantMessage
}; 