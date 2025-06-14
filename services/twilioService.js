const twilio = require('twilio');
const Restaurant = require('../models/Restaurant');
const BotConfiguration = require('../models/BotConfiguration');
const WhatsAppContact = require('../models/WhatsAppContact');
const crypto = require('crypto');

/**
 * Genera un token sicuro per l'unsubscribe
 * @param {String} contactId - ID del contatto
 * @param {String} phoneNumber - Numero di telefono del contatto
 * @returns {String} - Token crittografato
 */
const generateUnsubscribeToken = (contactId, phoneNumber) => {
  // Crea una stringa segreta basata sull'ID del contatto e sul numero di telefono
  const secret = `${contactId}-${phoneNumber}-${process.env.JWT_SECRET || 'menuchat-secret-key'}`;
  
  // Genera un hash SHA-256 come token
  return crypto
    .createHash('sha256')
    .update(secret)
    .digest('hex');
};

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
      
      // Ottieni o crea il contatto WhatsApp
      let contact;
      try {
        const normalizedPhone = phoneNumber.replace('whatsapp:', '');
        // Cerca il contatto nel database
        const phoneHash = crypto
          .createHash('sha256')
          .update(normalizedPhone.replace(/\D/g, ''))
          .digest('hex');
        
        contact = await WhatsAppContact.findOne({
          restaurant: restaurantId,
          phoneHash: phoneHash
        });
        
        if (!contact) {
          console.log(`Contatto non trovato per ${phoneNumber}, creando nuovo contatto...`);
          contact = new WhatsAppContact({
            restaurant: restaurantId,
            phoneNumber: normalizedPhone,
            phoneHash: phoneHash,
            name: "Cliente",
            language: variables.language || 'it'
          });
          await contact.save();
        }
        
        console.log(`Contatto trovato: ID=${contact._id}, Nome=${contact.name}`);
      } catch (error) {
        console.error('Errore nel recupero/creazione del contatto:', error);
        // Continuiamo comunque, anche se non abbiamo trovato il contatto
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
      
      // Prepara le variabili di contenuto per Twilio
      const contentVariables = {};
      
      // Variabile 1: Nome del cliente
      if (contact && contact.name && contact.name !== 'Cliente') {
        contentVariables["1"] = contact.name;
        console.log(`Usando nome cliente reale: ${contact.name}`);
      } else {
        contentVariables["1"] = "Cliente";
        console.log('Usando nome cliente predefinito: Cliente');
      }
      
      // Variabile 2: URL di unsubscribe (solo se abbiamo il contatto)
      if (contact) {
        const contactId = contact._id.toString();
        const unsubscribeToken = generateUnsubscribeToken(contactId, contact.phoneNumber);
        
        // Crea l'URL completo di unsubscribe
        const unsubscribePath = `api/campaign/unsubscribe/${contactId}/${unsubscribeToken}`;
        contentVariables["2"] = unsubscribePath;
        
        console.log(`Generato path di unsubscribe: ${unsubscribePath}`);
        
        // Registra il contatto come target della campagna se abbiamo l'ID della campagna
        if (variables.campaignId) {
          contact.receivedCampaigns.push({
            campaignId: variables.campaignId,
            sentAt: scheduledTime,
            status: 'scheduled'
          });
          await contact.save();
          console.log(`Contatto registrato come target per la campagna ${variables.campaignId}`);
        }
      }
      
      // Imposta le variabili di contenuto nel messaggio
      messageData.contentVariables = JSON.stringify(contentVariables);
      
      console.log('Dati messaggio programmato:', JSON.stringify(messageData));

      // Pianifica il messaggio
      const message = await twilioClient.messages.create(messageData);

      console.log(`Template programmato con SID: ${message.sid} per il: ${scheduledTime}`);
      console.log(`Variabili utilizzate: ${JSON.stringify(contentVariables)}`);
      
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

  /**
   * Invia un messaggio normale tramite Twilio (testo semplice)
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {string} messageBody - Testo del messaggio
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Risultato dell'invio
   */
  async sendNormalMessage(phoneNumber, messageBody, restaurantId) {
    try {
      console.log('===== INVIO MESSAGGIO NORMALE =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Message Body:', messageBody);
      
      if (!phoneNumber || !messageBody) {
        throw new Error('Numero di telefono e testo del messaggio obbligatori');
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
      const whatsappNumber = botConfig.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;

      if (!twilioSid || !twilioToken || !messagingServiceSid || !whatsappNumber) {
        throw new Error('Credenziali Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);
      
      // Formatta il numero di destinazione per WhatsApp
      const toNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
      const fromNumber = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`;

      // Prepara i dati del messaggio
      const messageData = {
        body: messageBody,
        from: fromNumber,
        to: toNumber,
        messagingServiceSid: messagingServiceSid
      };

      console.log('Dati messaggio normale:', JSON.stringify(messageData));

      // Invia il messaggio
      const message = await twilioClient.messages.create(messageData);

      console.log(`Messaggio normale inviato con SID: ${message.sid}`);
      
      return {
        success: true,
        messageId: message.sid,
        sentAt: new Date()
      };
    } catch (error) {
      console.error('Errore nell\'invio del messaggio normale:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Invia un messaggio (normale o con media) tramite Twilio
   * Metodo unificato per il nuovo sistema RestaurantMessage
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {string} messageBody - Testo del messaggio
   * @param {string} mediaUrl - URL del media (opzionale)
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Risultato dell'invio
   */
  async sendRegularMessage(phoneNumber, messageBody, mediaUrl, restaurantId) {
    try {
      console.log('===== INVIO MESSAGGIO REGOLARE (NUOVO SISTEMA) =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Message Body:', messageBody);
      console.log('Media URL:', mediaUrl || 'Nessun media');
      
      // Se c'è un media URL, usa sendMediaMessage, altrimenti sendNormalMessage
      if (mediaUrl && mediaUrl.trim() !== '') {
        return await this.sendMediaMessage(phoneNumber, messageBody, mediaUrl, restaurantId);
      } else {
        return await this.sendNormalMessage(phoneNumber, messageBody, restaurantId);
      }
      
    } catch (error) {
      console.error('Errore nell\'invio del messaggio regolare:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Invia un messaggio con media (PDF, immagine, ecc.) tramite Twilio
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {string} messageBody - Testo del messaggio
   * @param {string} mediaUrl - URL del media da allegare
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Risultato dell'invio
   */
  async sendMediaMessage(phoneNumber, messageBody, mediaUrl, restaurantId) {
    try {
      console.log('===== INVIO MESSAGGIO CON MEDIA =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Message Body:', messageBody);
      console.log('Media URL:', mediaUrl);
      
      if (!phoneNumber || !messageBody || !mediaUrl) {
        throw new Error('Numero di telefono, testo del messaggio e URL media obbligatori');
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
      const whatsappNumber = botConfig.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;

      if (!twilioSid || !twilioToken || !messagingServiceSid || !whatsappNumber) {
        throw new Error('Credenziali Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);
      
      // Formatta il numero di destinazione per WhatsApp
      const toNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
      const fromNumber = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`;

      // Prepara i dati del messaggio con media
      const messageData = {
        body: messageBody,
        from: fromNumber,
        to: toNumber,
        messagingServiceSid: messagingServiceSid,
        mediaUrl: [mediaUrl]
      };

      console.log('Dati messaggio con media:', JSON.stringify(messageData));

      // Invia il messaggio
      const message = await twilioClient.messages.create(messageData);

      console.log(`Messaggio con media inviato con SID: ${message.sid}`);
      
      return {
        success: true,
        messageId: message.sid,
        sentAt: new Date()
      };
    } catch (error) {
      console.error('Errore nell\'invio del messaggio con media:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Pianifica un messaggio normale per invio futuro
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {string} messageBody - Testo del messaggio
   * @param {string} restaurantId - ID del ristorante
   * @param {Date} scheduledTime - Data e ora programmata per l'invio
   * @param {string} mediaUrl - URL del media (opzionale)
   * @returns {Promise<Object>} - Risultato della programmazione
   */
  async scheduleNormalMessage(phoneNumber, messageBody, restaurantId, scheduledTime, mediaUrl = null) {
    try {
      console.log('===== PROGRAMMAZIONE MESSAGGIO NORMALE =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Message Body:', messageBody);
      console.log('Media URL:', mediaUrl);
      console.log('Scheduled Time:', scheduledTime);
      
      if (!phoneNumber || !messageBody || !scheduledTime) {
        throw new Error('Numero di telefono, testo del messaggio e orario programmato sono obbligatori');
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

      // Prepara i dati del messaggio programmato
      const messageData = {
        body: messageBody,
        to: toNumber,
        messagingServiceSid: messagingServiceSid,
        scheduleType: "fixed",
        sendAt: scheduledTime.toISOString()
      };

      // Aggiungi media se presente
      if (mediaUrl) {
        messageData.mediaUrl = [mediaUrl];
      }

      console.log('Dati messaggio normale programmato:', JSON.stringify(messageData));

      // Pianifica il messaggio
      const message = await twilioClient.messages.create(messageData);

      console.log(`Messaggio normale programmato con SID: ${message.sid} per il: ${scheduledTime}`);
      
      return {
        success: true,
        messageId: message.sid,
        scheduledTime: scheduledTime,
        status: message.status
      };
    } catch (error) {
      console.error('Errore nella programmazione del messaggio normale:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Converte un template in un messaggio testuale normale
   * @param {Object} template - Template WhatsApp da convertire
   * @param {string} customerName - Nome del cliente per sostituire le variabili
   * @param {Object} restaurant - Dati del ristorante 
   * @returns {Object} - Dati del messaggio convertito
   */
  convertTemplateToMessage(template, customerName = 'Cliente', restaurant = null) {
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

  /**
   * Invia un messaggio basato su un template (versione compatibile che sostituisce sendTemplateMessage)
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {Object} template - Template da utilizzare (oggetto completo del template)
   * @param {Object} variables - Variabili da sostituire (es. {1: "Nome Cliente"})
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Risultato dell'invio
   */
  async sendMessageFromTemplate(phoneNumber, template, variables, restaurantId) {
    try {
      console.log('===== INVIO MESSAGGIO DA TEMPLATE =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Template Type:', template.type);
      console.log('Variables:', JSON.stringify(variables));

      // Ottieni i dati del ristorante se necessario
      const restaurant = await Restaurant.findById(restaurantId);
      
      // Estrai il nome del cliente dalle variabili
      const customerName = variables && variables['1'] ? variables['1'] : 'Cliente';

      // Converti il template in messaggio
      const messageData = this.convertTemplateToMessage(template, customerName, restaurant);

      // Invia il messaggio appropriato
      let result;
      if (messageData.mediaUrl) {
        // Messaggio con media (PDF)
        result = await this.sendMediaMessage(
          phoneNumber,
          messageData.messageBody,
          messageData.mediaUrl,
          restaurantId
        );
      } else {
        // Messaggio normale
        result = await this.sendNormalMessage(
          phoneNumber,
          messageData.messageBody,
          restaurantId
        );
      }

      return result;
    } catch (error) {
      console.error('Errore nell\'invio del messaggio da template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Pianifica un messaggio basato su un template per invio futuro
   * @param {string} phoneNumber - Numero di telefono di destinazione
   * @param {Object} template - Template da utilizzare
   * @param {Object} variables - Variabili da sostituire
   * @param {string} restaurantId - ID del ristorante
   * @param {Date} scheduledTime - Data e ora programmata per l'invio
   * @returns {Promise<Object>} - Risultato della programmazione
   */
  async scheduleMessageFromTemplate(phoneNumber, template, variables, restaurantId, scheduledTime) {
    try {
      console.log('===== PROGRAMMAZIONE MESSAGGIO DA TEMPLATE =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Template Type:', template.type);
      console.log('Variables:', JSON.stringify(variables));
      console.log('Scheduled Time:', scheduledTime);

      // Ottieni i dati del ristorante se necessario
      const restaurant = await Restaurant.findById(restaurantId);
      
      // Estrai il nome del cliente dalle variabili
      const customerName = variables && variables['1'] ? variables['1'] : 'Cliente';

      // Converti il template in messaggio
      const messageData = this.convertTemplateToMessage(template, customerName, restaurant);

      // Pianifica il messaggio
      const result = await this.scheduleNormalMessage(
        phoneNumber,
        messageData.messageBody,
        restaurantId,
        scheduledTime,
        messageData.mediaUrl
      );

      return result;
    } catch (error) {
      console.error('Errore nella programmazione del messaggio da template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new TwilioService(); 