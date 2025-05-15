const twilio = require('twilio');
const Restaurant = require('../models/Restaurant');
const BotConfiguration = require('../models/BotConfiguration');

/**
 * Service per la gestione dell'integrazione con Twilio
 */
class TwilioService {
  /**
   * Configura l'integrazione Twilio
   * @param {Object} config - Configurazione di Twilio
   * @returns {Promise<Object>} - Risultato della configurazione
   */
  async configureTwilio(config) {
    try {
      const { restaurantId, botConfigId, customWhatsappNumber, customMessagingServiceSid, twilioAccountSid, twilioAuthToken } = config;

      // Verifica che i parametri siano validi
      if (!restaurantId || !botConfigId) {
        throw new Error('Parametri mancanti nella configurazione Twilio');
      }
      
      // Trova la configurazione del bot
      const botConfig = await BotConfiguration.findById(botConfigId);
      if (!botConfig) {
        throw new Error('Configurazione bot non trovata');
      }
      
      // Utilizza le credenziali personalizzate se disponibili, altrimenti usa le variabili d'ambiente
      const accountSid = twilioAccountSid || botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const authToken = twilioAuthToken || botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = customMessagingServiceSid || botConfig.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID;
      const whatsappNumber = customWhatsappNumber || botConfig.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;
      
      if (!accountSid || !authToken || !messagingServiceSid || !whatsappNumber) {
        throw new Error('Credenziali Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(accountSid, authToken);

      // Verifica che il messaging service esista solo se è quello di default
      if (!customMessagingServiceSid) {
        try {
          const messagingService = await twilioClient.messaging.v1.services(messagingServiceSid).fetch();
          console.log('Messaging Service predefinito verificato:', messagingService.friendlyName);
        } catch (error) {
          console.error('Errore nel recupero del Messaging Service predefinito:', error);
          throw new Error('Impossibile verificare il Messaging Service Twilio predefinito');
        }
      } else {
        // Se è un Messaging Service personalizzato, assumiamo che sia valido
        console.log('Utilizzo Messaging Service personalizzato (senza verifica):', customMessagingServiceSid);
      }

      // Aggiorna la configurazione del bot con i nuovi valori
      if (customWhatsappNumber || customMessagingServiceSid || twilioAccountSid || twilioAuthToken) {
        botConfig.whatsappNumberType = 'custom';
        if (customWhatsappNumber) botConfig.whatsappNumber = customWhatsappNumber;
        if (customMessagingServiceSid) botConfig.messagingServiceSid = customMessagingServiceSid;
        if (twilioAccountSid) botConfig.twilioAccountSid = twilioAccountSid;
        if (twilioAuthToken) botConfig.twilioAuthToken = twilioAuthToken;
        await botConfig.save();
      }

      console.log('Configurazione Twilio completata per il ristorante:', restaurantId);

      return {
        phoneNumber: whatsappNumber,
        status: 'active'
      };
    } catch (error) {
      console.error('Errore nella configurazione Twilio:', error);
      throw error;
    }
  }

  /**
   * Controlla lo stato dell'integrazione Twilio
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Stato dell'integrazione
   */
  async checkTwilioStatus(restaurantId) {
    try {
      // Ottieni la configurazione del bot per il ristorante
      const botConfig = await BotConfiguration.findOne({ restaurant: restaurantId });
      
      if (!botConfig) {
        return {
          active: false,
          error: 'Configurazione bot non trovata'
        };
      }
      
      // Utilizza le credenziali personalizzate se disponibili, altrimenti usa le variabili d'ambiente
      const twilioSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = botConfig.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (!twilioSid || !twilioToken || !messagingServiceSid) {
        return {
          active: false,
          error: 'Credenziali Twilio non configurate'
        };
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);

      // Verifica lo stato del Messaging Service
      try {
        const messagingService = await twilioClient.messaging.v1.services(messagingServiceSid).fetch();
        
        return {
          active: true,
          messagingServiceStatus: messagingService.status,
          messagingServiceName: messagingService.friendlyName,
          lastChecked: new Date()
        };
      } catch (error) {
        console.error('Errore nel controllo del Messaging Service:', error);
        return {
          active: false,
          error: 'Impossibile verificare il Messaging Service Twilio'
        };
      }
    } catch (error) {
      console.error('Errore nel controllo stato Twilio:', error);
      return {
        active: false,
        error: error.message
      };
    }
  }

  /**
   * Invia un messaggio di test tramite Twilio
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Risultato dell'invio
   */
  async sendTestMessage(phoneNumber, restaurantId) {
    try {
      // Trova la configurazione del ristorante
      const restaurant = await Restaurant.findById(restaurantId);
      
      if (!restaurant) {
        throw new Error('Ristorante non trovato');
      }
      
      const botConfig = await BotConfiguration.findOne({ restaurant: restaurantId });
      
      if (!botConfig) {
        throw new Error('Configurazione bot non trovata');
      }

      // Utilizza le credenziali personalizzate se disponibili, altrimenti usa le variabili d'ambiente
      const twilioSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = botConfig.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID;
      const whatsappNumber = botConfig.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;

      if (!twilioSid || !twilioToken || !messagingServiceSid || !whatsappNumber) {
        throw new Error('Credenziali Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);

      // Formatta il numero di destinazione per WhatsApp
      const toNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
      const fromNumber = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`;

      // Invia un messaggio di test
      const message = await twilioClient.messages.create({
        body: `Messaggio di test da ${restaurant.name}. Questa è una verifica del sistema MenuChat.`,
        from: fromNumber,
        to: toNumber,
        messagingServiceSid: messagingServiceSid
      });

      console.log(`Messaggio di test inviato con SID: ${message.sid}`);
      
      return {
        success: true,
        messageId: message.sid,
        sentAt: new Date()
      };
    } catch (error) {
      console.error('Errore nell\'invio del messaggio di test:', error);
      throw error;
    }
  }

  /**
   * Invia un messaggio utilizzando un template Twilio
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {string} templateId - ID del template Twilio (content SID)
   * @param {Object} variables - Variabili da sostituire nel template
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Risultato dell'invio
   */
  async sendTemplateMessage(phoneNumber, templateId, variables, restaurantId) {
    try {
      console.log('===== INVIO MESSAGGIO TEMPLATE =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Template ID:', templateId);
      console.log('Variables:', JSON.stringify(variables));
      
      if (!phoneNumber || !templateId) {
        throw new Error('Numero di telefono e ID del template obbligatori');
      }
      
      // Ottieni la configurazione del bot per il ristorante
      const botConfig = await BotConfiguration.findOne({ restaurant: restaurantId });
      
      if (!botConfig) {
        throw new Error('Configurazione bot non trovata');
      }

      // Utilizza le credenziali personalizzate se disponibili, altrimenti usa le variabili d'ambiente
      const twilioSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
      const whatsappNumber = botConfig.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;

      if (!twilioSid || !twilioToken || !whatsappNumber) {
        throw new Error('Credenziali Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);
      
      // Formatta il numero di destinazione per WhatsApp
      const toNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
      const fromNumber = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`;

      // Prepara i dati del messaggio
      const messageData = {
        contentSid: templateId,
        from: fromNumber,
        to: toNumber
      };
      
      // Aggiungi le variabili se presenti
      if (variables && Object.keys(variables).length > 0) {
        messageData.contentVariables = JSON.stringify(variables);
      }

      console.log('Dati messaggio:', JSON.stringify(messageData));

      // Invia il messaggio
      const message = await twilioClient.messages.create(messageData);

      console.log(`Template inviato con SID: ${message.sid}`);
      
      return {
        success: true,
        messageId: message.sid,
        sentAt: new Date()
      };
    } catch (error) {
      console.error('Errore nell\'invio del template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Pianifica un messaggio utilizzando un template Twilio per invio futuro
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {string} templateId - ID del template Twilio (content SID)
   * @param {Object} variables - Variabili da sostituire nel template
   * @param {string} restaurantId - ID del ristorante
   * @param {Date} scheduledTime - Data e ora programmata per l'invio
   * @returns {Promise<Object>} - Risultato della programmazione
   */
  async scheduleTemplateMessage(phoneNumber, templateId, variables, restaurantId, scheduledTime) {
    try {
      console.log('===== PROGRAMMAZIONE MESSAGGIO TEMPLATE =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Template ID:', templateId);
      console.log('Variables:', JSON.stringify(variables));
      console.log('Scheduled Time:', scheduledTime);
      
      if (!phoneNumber || !templateId || !scheduledTime) {
        throw new Error('Numero di telefono, ID del template e orario programmato sono obbligatori');
      }

      // Verifica che la data di invio sia nel futuro (almeno 5 minuti dopo)
      const minScheduleTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minuti nel futuro
      if (scheduledTime < minScheduleTime) {
        scheduledTime = minScheduleTime; // Imposta a 5 minuti nel futuro se troppo vicino
      }

      // Verifica che la data di invio non sia troppo lontana (max 35 giorni)
      const maxScheduleTime = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000); // 35 giorni nel futuro
      if (scheduledTime > maxScheduleTime) {
        throw new Error('La data di invio non può essere oltre 35 giorni nel futuro');
      }

      // Ottieni la configurazione del bot per il ristorante
      const botConfig = await BotConfiguration.findOne({ restaurant: restaurantId });
      
      if (!botConfig) {
        throw new Error('Configurazione bot non trovata');
      }

      // Utilizza le credenziali personalizzate se disponibili, altrimenti usa le variabili d'ambiente
      const twilioSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = botConfig.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (!twilioSid || !twilioToken || !messagingServiceSid) {
        throw new Error('Credenziali Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);
      
      // Formatta il numero di destinazione per WhatsApp
      const toNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;

      // Prepara i dati del messaggio
      const messageData = {
        contentSid: templateId,
        to: toNumber,
        messagingServiceSid: messagingServiceSid,
        scheduleType: "fixed",
        sendAt: scheduledTime.toISOString()
      };
      
      // Semplifica la gestione delle contentVariables
      if (variables && Object.keys(variables).length > 0) {
        // Per il formato richiesto da Twilio, utilizziamo solo le variabili essenziali
        // Twilio si aspetta un formato semplice: {"1": "valore", "2": "valore"}
        
        // Creiamo un nuovo oggetto con solo le variabili necessarie
        const simplifiedVariables = {};
        
        // Se abbiamo il messaggio personalizzato dal wizard, lo utilizziamo per il nome del cliente
        if (variables.message) {
          // Manteniamo la prima variabile per il nome del cliente
          simplifiedVariables["1"] = variables.customerName || "Cliente";
        } else {
          // Default se non ci sono dati specifici
          simplifiedVariables["1"] = "Cliente";
        }
        
        // Aggiungiamo la seconda variabile se presente
        if (variables["2"]) {
          simplifiedVariables["2"] = variables["2"];
        }
        
        messageData.contentVariables = JSON.stringify(simplifiedVariables);
      }

      console.log('Dati messaggio programmato:', JSON.stringify(messageData));

      // Pianifica il messaggio
      const message = await twilioClient.messages.create(messageData);

      console.log(`Template programmato con SID: ${message.sid} per il: ${scheduledTime}`);
      
      return {
        success: true,
        messageId: message.sid,
        scheduledTime: scheduledTime,
        status: message.status
      };
    } catch (error) {
      console.error('Errore nella programmazione del template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Annulla un messaggio programmato
   * @param {string} messageSid - SID del messaggio da annullare
   * @returns {Promise<Object>} - Risultato dell'annullamento
   */
  async cancelScheduledMessage(messageSid) {
    try {
      if (!messageSid) {
        throw new Error('SID del messaggio obbligatorio');
      }

      // Verifica che le variabili d'ambiente siano configurate
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;

      if (!twilioSid || !twilioToken) {
        throw new Error('Variabili d\'ambiente Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);

      // Annulla il messaggio pianificato
      const canceledMessage = await twilioClient.messages(messageSid).update({
        status: 'canceled'
      });

      console.log(`Messaggio pianificato annullato: ${messageSid}`);

      return {
        success: true,
        messageId: messageSid,
        status: canceledMessage.status
      };
    } catch (error) {
      console.error('Errore nell\'annullamento del messaggio pianificato:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new TwilioService(); 