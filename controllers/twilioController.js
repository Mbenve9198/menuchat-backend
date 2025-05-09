const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const BotConfiguration = require('../models/BotConfiguration');
const twilioService = require('../services/twilioService');
const Menu = require('../models/Menu');
const CustomerInteraction = require('../models/CustomerInteraction');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Contact = require('../models/Contact');
const twilio = require('twilio');
const ScheduledMessage = require('../models/ScheduledMessage');

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

    // Estrai solo il numero senza il prefisso "whatsapp:"
    const rawPhoneNumber = fromNumber.replace('whatsapp:', '');
    
    // Crea o aggiorna il contatto
    let contact = await Contact.findOne({ 
      restaurant: restaurant._id,
      phoneNumber: rawPhoneNumber
    });
    
    // Determina il codice paese dal numero di telefono
    const countryCode = Contact.getCountryCodeFromPhoneNumber(rawPhoneNumber);
    
    if (!contact) {
      // Nuovo contatto
      console.log(`🆕 Creazione nuovo contatto per ${profileName} (${rawPhoneNumber})`);
      contact = new Contact({
        restaurant: restaurant._id,
        name: profileName,
        phoneNumber: rawPhoneNumber,
        countryCode: countryCode,
        firstContact: new Date(),
        lastContact: new Date(),
        interactionDates: [new Date()],
        totalInteractions: 1,
        uniqueDayInteractions: 1
      });
      await contact.save();
      console.log(`✅ Nuovo contatto creato: ${contact._id}`);
    } else {
      // Contatto esistente, aggiorna
      console.log(`🔄 Aggiornamento contatto esistente: ${contact._id}`);
      contact.recordInteraction();
      if (contact.name === 'Cliente' && profileName !== 'Cliente') {
        contact.name = profileName;
      }
      await contact.save();
      console.log(`✅ Contatto aggiornato: interazioni totali = ${contact.totalInteractions}, giorni unici = ${contact.uniqueDayInteractions}`);
    }
    
    // Determina la lingua del cliente in base al prefisso telefonico
    let language = 'it'; // Default
    
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
      language,
      // Importante: salva l'interazione per poter inviare la recensione in seguito
      scheduledForReview: botConfig.reviewTimer ? new Date(Date.now() + botConfig.reviewTimer * 60 * 1000) : null
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
      await interaction.save();
      
      console.log(`✅ Template inviato a ${fromNumber}`);
      
      // Se la configurazione include un timer per le recensioni, programma l'invio
      if (botConfig.reviewTimer && botConfig.reviewTimer > 0) {
        console.log(`⏰ Recensione programmata tra ${botConfig.reviewTimer} minuti`);
        // L'effettivo invio sarà gestito dal job scheduler
      }
      
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
 * @desc    Invia richieste di recensione programmate
 * @route   POST /api/twilio/send-scheduled-reviews
 * @access  Private (solo per cron jobs)
 */
const sendScheduledReviews = async (req, res) => {
  try {
    // Verifica l'autenticazione del cron job (usa un token o chiave API)
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.SCHEDULER_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    console.log('===== AVVIO INVIO RECENSIONI PROGRAMMATE =====');
    const now = new Date();
    
    // Non inviare recensioni durante la notte (00:00 - 08:00)
    const currentHour = now.getHours();
    if (currentHour >= 0 && currentHour < 8) {
      console.log('🌙 Orario notturno, invio recensioni posticipato');
      return res.status(200).json({
        success: true,
        message: 'Orario notturno, invio recensioni posticipato',
        sent: 0
      });
    }

    // Trova tutte le interazioni che devono ricevere una recensione ora
    const interactionsDue = await CustomerInteraction.find({
      scheduledForReview: { $lte: now },
      reviewSent: { $ne: true },
      status: 'active'
    }).populate('restaurant');

    console.log(`📊 Trovate ${interactionsDue.length} recensioni da inviare`);

    let sentCount = 0;
    const results = [];

    for (const interaction of interactionsDue) {
      try {
        // Trova la configurazione del bot per questo ristorante
        const botConfig = await BotConfiguration.findOne({ 
          restaurant: interaction.restaurant._id,
          active: true
        });

        if (!botConfig) {
          console.log(`⚠️ Nessuna configurazione bot attiva per il ristorante ${interaction.restaurant._id}`);
          continue;
        }

        // Trova il template di recensione nella lingua appropriata
        const reviewTemplates = await WhatsAppTemplate.find({
          restaurant: interaction.restaurant._id,
          type: 'REVIEW',
          isActive: true,
          status: 'APPROVED',
        });

        if (!reviewTemplates.length) {
          console.log(`⚠️ Nessun template di recensione trovato per ${interaction.restaurant.name}`);
          continue;
        }

        // Seleziona il template nella lingua dell'utente o usa il default italiano
        let template = reviewTemplates.find(t => t.language === interaction.language);
        if (!template) {
          template = reviewTemplates.find(t => t.language === 'it') || reviewTemplates[0];
        }

        // Invia il template di recensione
        const result = await twilioService.sendTemplateMessage(
          interaction.customerPhoneNumber,
          template.twilioTemplateId,
          {
            1: interaction.customerName || 'Cliente'
          },
          interaction.restaurant._id
        );

        if (result.success) {
          // Aggiorna l'interazione
          interaction.reviewSent = true;
          interaction.lastReviewSentAt = now;
          interaction.lastMessageSent = 'Invio recensione: ' + template.name;
          await interaction.save();
          
          sentCount++;
          results.push({
            interactionId: interaction._id,
            restaurant: interaction.restaurant.name,
            customerPhone: interaction.customerPhoneNumber,
            templateId: template.twilioTemplateId,
            success: true
          });
        } else {
          results.push({
            interactionId: interaction._id,
            restaurant: interaction.restaurant.name,
            customerPhone: interaction.customerPhoneNumber,
            error: result.error,
            success: false
          });
        }
      } catch (error) {
        console.error(`❌ Errore nell'invio della recensione per ${interaction._id}:`, error);
        results.push({
          interactionId: interaction._id,
          restaurant: interaction.restaurant ? interaction.restaurant.name : 'Unknown',
          error: error.message,
          success: false
        });
      }
    }

    console.log(`✅ Inviate ${sentCount}/${interactionsDue.length} recensioni programmate`);

    res.status(200).json({
      success: true,
      message: `Inviate ${sentCount}/${interactionsDue.length} recensioni programmate`,
      sent: sentCount,
      total: interactionsDue.length,
      results
    });
  } catch (error) {
    console.error('❌ ERRORE NELL\'INVIO DELLE RECENSIONI PROGRAMMATE:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'invio delle recensioni programmate',
      error: error.message
    });
  }
};

/**
 * @desc    Programma l'invio di un messaggio WhatsApp
 * @route   POST /api/twilio/schedule
 * @access  Private
 */
const scheduleTemplateMessage = async (req, res) => {
  try {
    const { phoneNumber, templateId, variables, scheduleDate, restaurantId } = req.body;

    if (!phoneNumber || !templateId || !scheduleDate || !restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Parametri mancanti'
      });
    }

    // Verifica che il template esista
    const template = await WhatsAppTemplate.findOne({
      _id: templateId,
      restaurant: restaurantId
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Se il template non è approvato, salviamo comunque la programmazione
    // ma con uno stato speciale
    const pendingStatus = template.status !== 'APPROVED' ? 'pending_approval' : 'scheduled';

    // Salva la programmazione nel database
    const scheduledMessage = new ScheduledMessage({
      restaurant: restaurantId,
      template: templateId,
      phoneNumber,
      scheduledFor: scheduleDate,
      status: pendingStatus,
      // Salviamo il messageId solo se il template è approvato
      twilioMessageId: template.status === 'APPROVED' ? result.messageId : null
    });
    await scheduledMessage.save();

    // Se il template è approvato, programma effettivamente il messaggio con Twilio
    let twilioResult = null;
    if (template.status === 'APPROVED') {
      twilioResult = await twilioService.scheduleMessage(
        phoneNumber,
        template.twilioTemplateId,
        variables,
        new Date(scheduleDate)
      );
      
      // Aggiorna il messageId se abbiamo programmato con successo
      if (twilioResult.success) {
        scheduledMessage.twilioMessageId = twilioResult.messageId;
        await scheduledMessage.save();
      }
    }

    res.status(200).json({
      success: true,
      data: {
        messageId: twilioResult?.messageId || null,
        scheduledFor: scheduleDate,
        status: pendingStatus,
        templateStatus: template.status
      }
    });
  } catch (error) {
    console.error('Errore nella programmazione del messaggio:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la programmazione del messaggio',
      error: error.message
    });
  }
};

/**
 * @desc    Controlla lo stato di approvazione di un template
 * @route   GET /api/twilio/template/:id/status
 * @access  Private
 */
const checkTemplateStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Trova il template nel database
    const template = await WhatsAppTemplate.findById(id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Controlla lo stato su Twilio
    const status = await twilioService.checkTemplateApprovalStatus(template.twilioTemplateId);

    if (!status.success) {
      throw new Error(status.error);
    }

    // Aggiorna lo stato nel database se è cambiato
    if (status.status !== template.status) {
      template.status = status.status;
      template.rejectionReason = status.rejectionReason;
      await template.save();
    }

    res.status(200).json({
      success: true,
      data: {
        status: status.status,
        rejectionReason: status.rejectionReason,
        whatsappCategory: status.whatsappCategory
      }
    });
  } catch (error) {
    console.error('Errore nel controllo dello stato del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il controllo dello stato',
      error: error.message
    });
  }
};

module.exports = {
  webhookHandler,
  connectTwilio,
  getTwilioStatus,
  sendTestMessage,
  sendScheduledReviews,
  scheduleTemplateMessage,
  checkTemplateStatus
}; 