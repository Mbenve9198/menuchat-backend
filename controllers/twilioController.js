const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const BotConfiguration = require('../models/BotConfiguration');
const twilioService = require('../services/twilioService');
const Menu = require('../models/Menu');
const CustomerInteraction = require('../models/CustomerInteraction');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const twilio = require('twilio');

/**
 * @desc    Gestisce i messaggi in arrivo da Twilio
 * @route   POST /api/twilio/webhook
 * @access  Public
 */
const webhookHandler = async (req, res) => {
  try {
    console.log('========= WEBHOOK TWILIO RICEVUTO =========');
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));
    
    // Validazione della richiesta di Twilio (opzionale ma consigliata)
    // const twilioSignature = req.headers['x-twilio-signature'];
    // const url = process.env.BASE_URL + '/twilio/webhook';
    // const authToken = process.env.TWILIO_AUTH_TOKEN;
    // const requestIsValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);
    
    // if (!requestIsValid && process.env.NODE_ENV === 'production') {
    //   console.log('Richiesta non valida da Twilio');
    //   return res.status(403).send('Forbidden');
    // }

    // Estrai i dati dalla richiesta
    const messageBody = req.body.Body || req.body.body;
    const fromNumber = req.body.From || req.body.from;
    const toNumber = req.body.To || req.body.to;
    const profileName = req.body.ProfileName || req.body.profileName || 'Cliente';
    
    // Log più dettagliato con formattazione
    console.log(`📥 Messaggio: "${messageBody}"`);
    console.log(`📱 Da: ${fromNumber}`);
    console.log(`📲 A: ${toNumber}`);
    console.log(`👤 Nome profilo: ${profileName}`);

    if (!messageBody || !fromNumber) {
      console.log('⚠️ Messaggio incompleto, mancano dati essenziali');
      return res.status(400).send('Bad Request - Missing message data');
    }

    // Trova la configurazione del bot in base al trigger word
    console.log(`🔍 Ricerca bot per trigger: "${messageBody.trim()}"`);
    const botConfig = await BotConfiguration.findOne({ 
      triggerWord: messageBody.trim(),
      active: true
    });

    if (!botConfig) {
      console.log('❌ Nessun bot trovato per questo trigger');
      return res.status(404).send('Bot not found');
    }

    // Trova il ristorante associato
    const restaurant = await Restaurant.findById(botConfig.restaurant);
    
    if (!restaurant) {
      console.log('❌ Ristorante non trovato');
      return res.status(404).send('Restaurant not found');
    }

    // Determina la lingua del cliente in base al prefisso telefonico
    let language = 'it'; // Default
    
    // Estrai solo il numero senza il prefisso "whatsapp:"
    const rawPhoneNumber = fromNumber.replace('whatsapp:', '');
    
    // Trova i template attivi per il ristorante
    const templates = await WhatsAppTemplate.find({
      restaurant: restaurant._id,
      isActive: true,
      status: 'APPROVED'
    });
    
    // Cerca i template di benvenuto
    const welcomeTemplates = templates.filter(t => 
      (t.type === 'MEDIA' || t.type === 'CALL_TO_ACTION') && 
      !t.name.includes('review')
    );
    
    if (!welcomeTemplates.length) {
      console.log('⚠️ Nessun template di benvenuto trovato');
      
      // Fallback al comportamento originale
      // Trova il menu del ristorante
      const menu = await Menu.findOne({ restaurant: restaurant._id });
      
      // Salva l'interazione del cliente
      const interaction = new CustomerInteraction({
        restaurant: restaurant._id,
        customerPhoneNumber: fromNumber,
        customerPhoneHash: require('crypto').createHash('md5').update(fromNumber).digest('hex'),
        customerName: profileName,
        lastMessageReceived: messageBody,
        lastMessageSent: null,
        status: 'active',
        language
      });
      
      await interaction.save();
      console.log(`Nuova interazione salvata: ${interaction._id}`);

      // Prepara la risposta con il menu
      let responseMessage = botConfig.welcomeMessage || `Benvenuto a ${restaurant.name}!`;
      
      // Sostituisci eventuali segnaposto
      responseMessage = responseMessage
        .replace('{{1}}', profileName)
        .replace('{restaurantName}', restaurant.name);
      
      // Aggiungi il menu se disponibile
      if (menu) {
        responseMessage += "\n\nEcco il nostro menu:";
        
        if (menu.categories && menu.categories.length > 0) {
          menu.categories.forEach(category => {
            responseMessage += `\n\n*${category.name}*`;
            
            if (category.items && category.items.length > 0) {
              category.items.forEach(item => {
                responseMessage += `\n- ${item.name}: ${item.price}€`;
                if (item.description) responseMessage += ` (${item.description})`;
              });
            }
          });
        } else if (menu.menuUrl) {
          responseMessage += `\n\nVisita il nostro menu completo qui: ${menu.menuUrl}`;
        }
      }
      
      // Aggiorna l'interazione con il messaggio inviato
      interaction.lastMessageSent = responseMessage;
      await interaction.save();
      
      // Invia la risposta
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(responseMessage);
      
      console.log(`✅ Risposta inviata a ${fromNumber}`);
      console.log('Contenuto risposta:', responseMessage);
      console.log('TwiML generato:', twiml.toString());
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Identifica la lingua più appropriata in base al prefisso del numero di telefono
    const getLanguageFromPhoneNumber = (phoneNumber) => {
      // Rimuovi qualsiasi formato (whatsapp:, +, spazi, ecc.)
      const cleanNumber = phoneNumber.replace(/\D+/g, '');
      
      // Mappa dei principali prefissi telefonici internazionali
      const prefixMap = {
        '39': 'it',  // Italia
        '1': 'en',   // USA/Canada
        '44': 'en',  // UK
        '34': 'es',  // Spagna
        '49': 'de',  // Germania
        '33': 'fr',  // Francia
      };
      
      // Controlla i prefissi principali
      for (const [prefix, lang] of Object.entries(prefixMap)) {
        if (cleanNumber.startsWith(prefix)) {
          return lang;
        }
      }
      
      return 'it'; // Default a italiano
    };
    
    language = getLanguageFromPhoneNumber(rawPhoneNumber);
    console.log(`🌍 Lingua rilevata: ${language}`);
    
    // Trova il template nella lingua appropriata o usa il default (italiano)
    let template = welcomeTemplates.find(t => t.language === language);
    if (!template) {
      template = welcomeTemplates.find(t => t.language === 'it') || welcomeTemplates[0];
    }
    
    // Salva l'interazione del cliente
    const interaction = new CustomerInteraction({
      restaurant: restaurant._id,
      customerPhoneNumber: fromNumber,
      customerPhoneHash: require('crypto').createHash('md5').update(fromNumber).digest('hex'),
      customerName: profileName,
      lastMessageReceived: messageBody,
      lastMessageSent: null,
      status: 'active',
      language
    });
    
    await interaction.save();
    console.log(`Nuova interazione salvata: ${interaction._id}`);
    
    // Usa il template per inviare la risposta tramite Twilio
    const result = await twilioService.sendTemplateMessage(
      fromNumber,
      template.twilioTemplateId,
      {
        1: profileName  // Sostituisce {{1}} con il nome del cliente
      },
      restaurant._id
    );
    
    if (result.success) {
      // Aggiorna l'interazione con il messaggio inviato
      interaction.lastMessageSent = 'Invio template: ' + template.name;
      interaction.lastTemplateId = template.twilioTemplateId;
      
      // Se la configurazione include un timer per le recensioni, programma l'invio tramite Twilio
      if (botConfig.reviewTimer && botConfig.reviewTimer > 0) {
        try {
          // Calcola la data pianificata
          const scheduledTime = new Date(Date.now() + botConfig.reviewTimer * 60 * 1000);
          console.log(`⏰ Scheduling recensione per ${scheduledTime}`);
          
          // Trova il template di recensione nella lingua appropriata
          const reviewTemplates = await WhatsAppTemplate.find({
            restaurant: restaurant._id,
            type: 'REVIEW',
            isActive: true,
            status: 'APPROVED',
          });
          
          if (reviewTemplates.length > 0) {
            // Seleziona il template nella lingua dell'utente o usa il default italiano
            let reviewTemplate = reviewTemplates.find(t => t.language === language);
            if (!reviewTemplate) {
              reviewTemplate = reviewTemplates.find(t => t.language === 'it') || reviewTemplates[0];
            }
            
            // Programma il messaggio di recensione con Twilio
            const scheduledResult = await twilioService.scheduleTemplateMessage(
              fromNumber,
              reviewTemplate.twilioTemplateId,
              {
                1: profileName || 'Cliente'
              },
              restaurant._id,
              scheduledTime
            );
            
            if (scheduledResult.success) {
              // Salva il riferimento al messaggio programmato
              interaction.scheduledReviewMessageId = scheduledResult.messageId;
              interaction.reviewScheduledFor = scheduledTime;
              console.log(`✅ Recensione programmata con Twilio (SID: ${scheduledResult.messageId})`);
            } else {
              console.error('❌ Errore nella programmazione del messaggio di recensione:', scheduledResult.error);
            }
          } else {
            console.log('⚠️ Nessun template di recensione disponibile per programmazione');
          }
        } catch (scheduleError) {
          console.error('❌ Errore nella programmazione della recensione:', scheduleError);
        }
      }
      
      await interaction.save();
      
      console.log(`✅ Template inviato a ${fromNumber}`);
      
      // Per webhook response, è sufficiente un 200 OK vuoto
      return res.status(200).send();
    } else {
      // Fallback al metodo tradizionale in caso di errore con il template
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(`Benvenuto a ${restaurant.name}! Per vedere il nostro menu visita il nostro sito web.`);
      
      console.log(`⚠️ Fallback: Risposta TwiML inviata a ${fromNumber}`);
      return res.type('text/xml').send(twiml.toString());
    }
  } catch (error) {
    console.error('❌ ERRORE NEL WEBHOOK TWILIO:', error);
    console.error('Stack trace:', error.stack);
    
    // Invia una risposta anche in caso di errore per evitare timeout
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('Si è verificato un errore. Riprova più tardi.');
    
    return res.type('text/xml').send(twiml.toString());
  }
};

/**
 * @desc    Connette l'account Twilio
 * @route   POST /api/twilio/connect
 * @access  Private
 */
const connectTwilio = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la configurazione del bot
    let botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });

    if (!botConfig) {
      return res.status(404).json({
        success: false,
        message: 'Configurazione bot non trovata'
      });
    }

    // Configura Twilio con le variabili d'ambiente
    const twilioConfig = await twilioService.configureTwilio({
      restaurantId: restaurant._id,
      botConfigId: botConfig._id
    });

    // Aggiorna la configurazione del bot con le informazioni di Twilio
    botConfig.whatsappNumberType = 'custom';
    botConfig.whatsappNumber = twilioConfig.phoneNumber;
    await botConfig.save();

    res.status(200).json({
      success: true,
      data: {
        phoneNumber: twilioConfig.phoneNumber,
        status: twilioConfig.status
      }
    });
  } catch (error) {
    console.error('Errore nella connessione Twilio:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la connessione a Twilio',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene lo stato dell'integrazione Twilio
 * @route   GET /api/twilio/status
 * @access  Private
 */
const getTwilioStatus = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la configurazione del bot
    const botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });

    if (!botConfig) {
      return res.status(404).json({
        success: false,
        message: 'Configurazione bot non trovata'
      });
    }

    // Controlla se Twilio è configurato nel bot
    const isConfigured = botConfig.whatsappNumberType === 'custom' && botConfig.whatsappNumber;

    if (!isConfigured) {
      // Prova a configurare Twilio automaticamente
      try {
        const twilioConfig = await twilioService.configureTwilio({
          restaurantId: restaurant._id,
          botConfigId: botConfig._id
        });
        
        // Aggiorna la configurazione del bot
        botConfig.whatsappNumberType = 'custom';
        botConfig.whatsappNumber = twilioConfig.phoneNumber;
        await botConfig.save();
        
        return res.status(200).json({
          success: true,
          data: {
            configured: true,
            phoneNumber: twilioConfig.phoneNumber,
            status: twilioConfig.status,
            message: 'Configurazione Twilio completata automaticamente'
          }
        });
      } catch (configError) {
        console.error('Errore nella configurazione automatica:', configError);
        return res.status(200).json({
          success: true,
          data: {
            configured: false,
            error: 'Configurazione automatica fallita'
          }
        });
      }
    }

    // Ottieni lo stato da Twilio
    const status = await twilioService.checkTwilioStatus(restaurant._id);

    res.status(200).json({
      success: true,
      data: {
        configured: status.active,
        phoneNumber: botConfig.whatsappNumber,
        status
      }
    });
  } catch (error) {
    console.error('Errore nel controllo stato Twilio:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il controllo dello stato Twilio',
      error: error.message
    });
  }
};

/**
 * @desc    Invia un messaggio di test
 * @route   POST /api/twilio/test
 * @access  Private
 */
const sendTestMessage = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Numero di telefono obbligatorio'
      });
    }

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Invia un messaggio di test
    const result = await twilioService.sendTestMessage(phoneNumber, restaurant._id);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Errore nell\'invio del messaggio di test:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'invio del messaggio di test',
      error: error.message
    });
  }
};

/**
 * @desc    Aggiorna le impostazioni Twilio personalizzate
 * @route   POST /api/twilio/custom-settings
 * @access  Private
 */
const updateCustomTwilioSettings = async (req, res) => {
  try {
    const { whatsappNumber, messagingServiceSid, twilioAccountSid, twilioAuthToken } = req.body;

    // Valida i dati obbligatori
    if (!whatsappNumber || !messagingServiceSid) {
      return res.status(400).json({
        success: false,
        message: 'Numero WhatsApp e Messaging Service ID sono obbligatori'
      });
    }

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la configurazione del bot
    let botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });
    if (!botConfig) {
      return res.status(404).json({
        success: false,
        message: 'Configurazione bot non trovata'
      });
    }

    // Configura Twilio con le impostazioni personalizzate
    try {
      const twilioConfig = await twilioService.configureTwilio({
        restaurantId: restaurant._id,
        botConfigId: botConfig._id,
        customWhatsappNumber: whatsappNumber,
        customMessagingServiceSid: messagingServiceSid,
        twilioAccountSid,
        twilioAuthToken
      });

      // La configurazione è stata completata con successo
      res.status(200).json({
        success: true,
        data: {
          phoneNumber: botConfig.whatsappNumber,
          messagingServiceSid: botConfig.messagingServiceSid,
          status: 'active',
          message: 'Impostazioni Twilio personalizzate aggiornate con successo'
        }
      });
    } catch (configError) {
      console.error('Errore nella configurazione personalizzata:', configError);
      res.status(400).json({
        success: false,
        message: 'Errore durante la configurazione di Twilio',
        error: configError.message
      });
    }
  } catch (error) {
    console.error('Errore nell\'aggiornamento delle impostazioni Twilio:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'aggiornamento delle impostazioni Twilio',
      error: error.message
    });
  }
};

/**
 * @desc    Ripristina le impostazioni Twilio predefinite
 * @route   POST /api/twilio/reset-to-default
 * @access  Private
 */
const resetToDefaultSettings = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la configurazione del bot
    let botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });
    if (!botConfig) {
      return res.status(404).json({
        success: false,
        message: 'Configurazione bot non trovata'
      });
    }

    // Resetta a impostazioni predefinite
    botConfig.whatsappNumberType = 'default';
    botConfig.whatsappNumber = null;
    botConfig.messagingServiceSid = null;
    botConfig.twilioAccountSid = null;
    botConfig.twilioAuthToken = null;
    
    await botConfig.save();

    res.status(200).json({
      success: true,
      data: {
        message: 'Impostazioni Twilio ripristinate alle predefinite'
      }
    });
  } catch (error) {
    console.error('Errore nel ripristino delle impostazioni Twilio:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il ripristino delle impostazioni Twilio',
      error: error.message
    });
  }
};

module.exports = {
  webhookHandler,
  connectTwilio,
  getTwilioStatus,
  sendTestMessage,
  updateCustomTwilioSettings,
  resetToDefaultSettings
}; 