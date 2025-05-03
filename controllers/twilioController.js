const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const BotConfiguration = require('../models/BotConfiguration');
const twilioService = require('../services/twilioService');
const Menu = require('../models/Menu');
const CustomerInteraction = require('../models/CustomerInteraction');
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
    
    // Log più dettagliato con formattazione
    console.log(`📥 Messaggio: "${messageBody}"`);
    console.log(`📱 Da: ${fromNumber}`);
    console.log(`📲 A: ${toNumber}`);

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
      console.log(`Nessun bot trovato per il trigger "${messageBody}"`);
      
      // Se non è un trigger valido, cerchiamo se c'è un'interazione già attiva con questo numero
      const activeInteraction = await CustomerInteraction.findOne({
        customerPhoneNumber: fromNumber,
        status: 'active'
      }).populate({
        path: 'restaurant',
        populate: {
          path: 'botConfiguration'
        }
      });

      if (activeInteraction) {
        // Se l'interazione è attiva, inoltriamo il messaggio al ristorante
        console.log(`Interazione attiva trovata per ${fromNumber} con il ristorante ${activeInteraction.restaurant.name}`);
        // Qui si implementerebbe la logica per inoltrare il messaggio al ristorante...
        
        // TwilioResponse generica per ora
        const twiml = new twilio.twiml.MessagingResponse();
        twiml.message('Il tuo messaggio è stato inoltrato al ristorante.');
        
        return res.type('text/xml').send(twiml.toString());
      }
      
      // Se nessuna condizione è soddisfatta, rispondiamo con un messaggio generico
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message('Mi dispiace, non ho capito il tuo messaggio. Riprova con una parola chiave valida.');
      
      return res.type('text/xml').send(twiml.toString());
    }

    // Trova il ristorante associato al bot
    const restaurant = await Restaurant.findById(botConfig.restaurant);
    
    if (!restaurant) {
      console.log(`Ristorante non trovato per il bot ${botConfig._id}`);
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message('Si è verificato un errore. Riprova più tardi.');
      
      return res.type('text/xml').send(twiml.toString());
    }
    
    console.log(`Ristorante trovato: ${restaurant.name}`);

    // Trova il menu del ristorante
    const menu = await Menu.findOne({ restaurant: restaurant._id });
    
    // Determina la lingua del cliente (semplificato per ora, implementare logica più avanzata)
    const language = 'it'; // Default
    
    // Salva l'interazione del cliente
    const interaction = new CustomerInteraction({
      restaurant: restaurant._id,
      customerPhoneNumber: fromNumber,
      customerPhoneHash: require('crypto').createHash('md5').update(fromNumber).digest('hex'),
      lastMessageReceived: messageBody,
      lastMessageSent: null,
      status: 'active',
      language
    });
    
    await interaction.save();
    console.log(`Nuova interazione salvata: ${interaction._id}`);

    // Prepara la risposta con il menu
    let responseMessage = botConfig.welcomeMessage[language] || 
                          botConfig.welcomeMessage.it ||
                          `Benvenuto a ${restaurant.name}!`;
    
    // Sostituisci eventuali segnaposto
    responseMessage = responseMessage
      .replace('{customerName}', 'Cliente')
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

module.exports = {
  webhookHandler,
  connectTwilio,
  getTwilioStatus,
  sendTestMessage
}; 