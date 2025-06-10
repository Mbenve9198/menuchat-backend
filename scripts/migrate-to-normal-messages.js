require('dotenv').config();
const mongoose = require('mongoose');

// Modelli
const ScheduledMessage = require('../models/ScheduledMessage');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');

/**
 * Converte un template in un messaggio testuale normale
 * (Copia della funzione dal twilioService)
 */
function convertTemplateToMessage(template, customerName = 'Cliente', restaurant = null) {
  try {
    let messageBody = template.components.body.text;
    let mediaUrl = null;

    // Sostituisci le variabili nel testo
    messageBody = messageBody.replace(/\{\{1\}\}/g, customerName);
    if (restaurant) {
      messageBody = messageBody.replace(/\{restaurantName\}/g, restaurant.name);
    }

    // Gestisci i diversi tipi di template
    switch (template.type) {
      case 'MEDIA':
        // Estrai l'URL del PDF dal header se presente
        if (template.components.header && template.components.header.example) {
          mediaUrl = template.components.header.example;
        }
        break;

      case 'CALL_TO_ACTION':
        // Aggiungi l'URL del pulsante al corpo del messaggio
        if (template.components.buttons && template.components.buttons.length > 0) {
          const button = template.components.buttons[0];
          if (button.url) {
            messageBody += `\n\n🔗 ${button.text}: ${button.url}`;
          }
        }
        break;

      case 'REVIEW':
        // Aggiungi l'URL di recensione al corpo del messaggio
        if (template.components.buttons && template.components.buttons.length > 0) {
          const button = template.components.buttons[0];
          if (button.url) {
            messageBody += `\n\n⭐ ${button.text}: ${button.url}`;
          }
        }
        break;
    }

    return {
      messageBody,
      mediaUrl,
      messageType: template.type === 'REVIEW' ? 'review' : 'menu'
    };
  } catch (error) {
    console.error('Errore nella conversione del template:', error);
    throw error;
  }
}

// Connessione al database remoto
async function connectToDatabase() {
  try {
    const mongoUri = 'mongodb+srv://marco:XFpWdkYWfzA5KpWW@cluster0.cit5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoUri);
    console.log('✅ Connesso al database MongoDB remoto');
  } catch (error) {
    console.error('❌ Errore connessione database:', error);
    process.exit(1);
  }
}

async function migrateScheduledMessages() {
  console.log('\n🔄 Inizio migrazione messaggi programmati...');
  
  // Trova tutti i messaggi che hanno templateId ma non hanno messageBody valido
  const scheduledMessages = await ScheduledMessage.find({
    templateId: { $exists: true },
    $or: [
      { messageBody: { $exists: false } },
      { messageBody: null },
      { messageBody: "" }
    ]
  });
  
  console.log(`📊 Trovati ${scheduledMessages.length} messaggi da migrare`);
  
  let migratedCount = 0;
  let errorCount = 0;
  
  for (const message of scheduledMessages) {
    try {
      console.log(`🔄 Elaborazione messaggio ${message._id}...`);
      
      // Cerca il template nel database usando il templateId (che è il Twilio Content SID)
      let template = await WhatsAppTemplate.findOne({ 
        twilioContentSid: message.templateId 
      });
      
      // Se non trovato con twilioContentSid, prova con altri campi
      if (!template) {
        template = await WhatsAppTemplate.findOne({ 
          name: { $regex: message.templateId, $options: 'i' }
        });
      }
      
      if (!template) {
        console.log(`⚠️ Template non trovato per ID: ${message.templateId}`);
        // Crea un template placeholder per mantenere compatibilità
        template = {
          type: message.messageType === 'review' ? 'REVIEW' : 'CALL_TO_ACTION',
          components: {
            body: {
              text: message.messageType === 'review' 
                ? 'Ciao {{1}}, come è andato il tuo pasto da noi?' 
                : 'Ciao {{1}}, benvenuto! Ecco il nostro menu:'
            }
          }
        };
        
        if (message.messageType === 'review') {
          template.components.buttons = [{
            type: 'URL',
            text: 'Lascia Recensione',
            url: 'https://g.page/r/placeholder'
          }];
        } else {
          template.components.buttons = [{
            type: 'URL', 
            text: 'Menu',
            url: 'https://menu.placeholder.com'
          }];
        }
      }
      
      // Ottieni i dati del ristorante se necessario
      let restaurant = null;
      if (message.restaurantId) {
        restaurant = await Restaurant.findById(message.restaurantId);
      }
      
      // Estrai il nome del cliente dalle variabili
      const customerName = message.variables && message.variables['1'] ? message.variables['1'] : 'Cliente';
      
      // Converti il template in messaggio usando la logica dal twilioService
      const messageData = convertTemplateToMessage(template, customerName, restaurant);
      
      // Aggiorna il messaggio con i nuovi campi (NON toccare il campo template)
      const updateData = {
        messageBody: messageData.messageBody,
        messageType: messageData.messageType
      };
      
      // Aggiungi mediaUrl se presente
      if (messageData.mediaUrl) {
        updateData.mediaUrl = messageData.mediaUrl;
      }
      
      await ScheduledMessage.findByIdAndUpdate(message._id, updateData);
      
      migratedCount++;
      console.log(`✅ Messaggio ${message._id} migrato con successo`);
      
    } catch (error) {
      console.error(`❌ Errore migrazione messaggio ${message._id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Migrazione completata:`);
  console.log(`   ✅ Messaggi migrati con successo: ${migratedCount}`);
  console.log(`   ❌ Messaggi con errori: ${errorCount}`);
}

async function validateMigration() {
  console.log('\n🔍 Validazione della migrazione...');
  
  try {
    // Conta i messaggi che NON hanno messageBody valido (sistema vecchio)
    const messagesWithoutValidMessageBody = await ScheduledMessage.countDocuments({
      $or: [
        { messageBody: { $exists: false } },
        { messageBody: null },
        { messageBody: "" }
      ]
    });
    
    // Conta i messaggi che hanno messageBody valido (nuovo sistema)
    const messagesWithValidMessageBody = await ScheduledMessage.countDocuments({
      messageBody: { $exists: true, $ne: null, $ne: "" }
    });
    
    console.log(`📊 Risultati validazione:`);
    console.log(`   🔴 Messaggi ancora nel vecchio sistema: ${messagesWithoutValidMessageBody}`);
    console.log(`   🟢 Messaggi nel nuovo sistema: ${messagesWithValidMessageBody}`);
    
    if (messagesWithoutValidMessageBody > 0) {
      console.log('⚠️ Alcuni messaggi richiedono ancora migrazione manuale.');
    } else {
      console.log('✅ Tutti i messaggi sono stati migrati al nuovo sistema!');
    }
    
  } catch (error) {
    console.error('❌ Errore durante la validazione:', error);
  }
}

async function addMissingFields() {
  console.log('\n🔄 Aggiornamento schema ScheduledMessage...');
  
  try {
    // Aggiungi i nuovi campi ai messaggi che non li hanno
    const result = await ScheduledMessage.updateMany(
      { 
        messageBody: { $exists: false }
      },
      { 
        $set: { 
          messageBody: '',
          messageType: 'menu'
        }
      }
    );

    console.log(`✅ Aggiornati ${result.modifiedCount} documenti con i nuovi campi`);

  } catch (error) {
    console.error('❌ Errore nell\'aggiornamento dello schema:', error);
  }
}

async function debugExistingMessages() {
  console.log('\n🔍 Analisi messaggi esistenti...');
  
  const allMessages = await ScheduledMessage.find({}).limit(5);
  console.log(`📊 Totale messaggi nel database: ${await ScheduledMessage.countDocuments({})}`);
  
  // Debug specifico per i campi di migrazione
  const withTemplateId = await ScheduledMessage.countDocuments({ templateId: { $exists: true } });
  const withMessageBody = await ScheduledMessage.countDocuments({ messageBody: { $exists: true } });
  const withNonEmptyMessageBody = await ScheduledMessage.countDocuments({ 
    messageBody: { $exists: true, $ne: null, $ne: "" }
  });
  const withTemplateIdButNoMessageBody = await ScheduledMessage.countDocuments({ 
    templateId: { $exists: true },
    messageBody: { $exists: false }
  });
  const withTemplateIdButEmptyMessageBody = await ScheduledMessage.countDocuments({ 
    templateId: { $exists: true },
    $or: [
      { messageBody: { $exists: false } },
      { messageBody: null },
      { messageBody: "" }
    ]
  });
  
  console.log(`\n📊 Analisi campi migrazione:`);
  console.log(`   📄 Messaggi con templateId: ${withTemplateId}`);
  console.log(`   💬 Messaggi con messageBody (esiste): ${withMessageBody}`);
  console.log(`   💬 Messaggi con messageBody (non vuoto): ${withNonEmptyMessageBody}`);
  console.log(`   🔄 Messaggi da migrare (templateId ma NO messageBody): ${withTemplateIdButNoMessageBody}`);
  console.log(`   🔄 Messaggi da migrare (templateId ma messageBody vuoto): ${withTemplateIdButEmptyMessageBody}`);
  
  if (allMessages.length > 0) {
    console.log('\n📋 Struttura primi 5 messaggi:');
    allMessages.forEach((msg, index) => {
      console.log(`\n--- Messaggio ${index + 1} ---`);
      console.log(`ID: ${msg._id}`);
      console.log(`Tipo messaggio: ${msg.messageType || 'Non specificato'}`);
      console.log(`Ha templateId: ${!!msg.templateId}`);
      console.log(`Ha template object: ${!!msg.template}`);
      console.log(`Ha messageBody: ${!!msg.messageBody}`);
      console.log(`Status: ${msg.status}`);
      console.log(`Scheduled per: ${msg.scheduledTime}`);
      
      if (msg.templateId) {
        console.log(`Template ID: ${msg.templateId}`);
      }
      
      if (msg.messageBody) {
        console.log(`Message body preview: ${msg.messageBody.substring(0, 100)}...`);
      }
    });
  }
  
  // Analizza i tipi di messaggi
  const messageTypes = await ScheduledMessage.aggregate([
    {
      $group: {
        _id: '$messageType',
        count: { $sum: 1 }
      }
    }
  ]);
  
  console.log('\n📊 Distribuzione per tipo di messaggio:');
  messageTypes.forEach(type => {
    console.log(`   ${type._id || 'Sconosciuto'}: ${type.count} messaggi`);
  });
  
  // Analizza gli status
  const statuses = await ScheduledMessage.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  console.log('\n📊 Distribuzione per status:');
  statuses.forEach(status => {
    console.log(`   ${status._id || 'Sconosciuto'}: ${status.count} messaggi`);
  });
}

async function main() {
  console.log('🚀 Script di migrazione al sistema di messaggi normali');
  console.log('============================================================');
  
  await connectToDatabase();
  
  // NUOVO: Debug dei messaggi esistenti
  await debugExistingMessages();
  
  await addMissingFields();
  await migrateScheduledMessages();
  await validateMigration();
  
  console.log('\n🎉 Migrazione completata!');
  console.log('🔌 Connessione database chiusa');
  await mongoose.connection.close();
}

// Esegui il script solo se chiamato direttamente
if (require.main === module) {
  main();
}

module.exports = {
  migrateScheduledMessages,
  validateMigration,
  addMissingFields
}; 