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
      const { restaurantId, botConfigId } = config;

      // Verifica che i parametri siano validi
      if (!restaurantId || !botConfigId) {
        throw new Error('Parametri mancanti nella configurazione Twilio');
      }

      // Utilizza le credenziali dalle variabili d'ambiente
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
      
      if (!twilioSid || !twilioToken || !messagingServiceSid || !whatsappNumber) {
        throw new Error('Variabili d\'ambiente Twilio non configurate correttamente');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(twilioSid, twilioToken);

      // Verifica che il messaging service esista
      try {
        const messagingService = await twilioClient.messaging.v1.services(messagingServiceSid).fetch();
        console.log('Messaging Service verificato:', messagingService.friendlyName);
      } catch (error) {
        console.error('Errore nel recupero del Messaging Service:', error);
        throw new Error('Impossibile verificare il Messaging Service Twilio');
      }

      // Associa il ristorante e la configurazione del bot all'integrazione Twilio
      // In un ambiente di produzione, le credenziali dovrebbero essere crittografate
      // e memorizzate in un sistema di gestione delle credenziali sicuro
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
      // Verifica che le variabili d'ambiente siano configurate
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (!twilioSid || !twilioToken || !messagingServiceSid) {
        return {
          active: false,
          error: 'Variabili d\'ambiente Twilio non configurate'
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

      // Verifica che le variabili d'ambiente siano configurate
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

      if (!twilioSid || !twilioToken || !messagingServiceSid || !whatsappNumber) {
        throw new Error('Variabili d\'ambiente Twilio non configurate correttamente');
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

      // Verifica che le variabili d'ambiente siano configurate
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

      if (!twilioSid || !twilioToken || !whatsappNumber) {
        throw new Error('Variabili d\'ambiente Twilio non configurate correttamente');
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
   * Programma l'invio di un messaggio WhatsApp
   * @param {string} phoneNumber - Numero di telefono del destinatario
   * @param {string} templateId - ID del template WhatsApp
   * @param {Object} variables - Variabili da sostituire nel template
   * @param {Date} scheduleDate - Data e ora di invio programmato
   * @returns {Promise<Object>} - Risultato della programmazione
   */
  async scheduleMessage(phoneNumber, templateId, variables, scheduleDate) {
    try {
      // Verifica che la data sia valida (almeno 5 minuti nel futuro e non oltre 35 giorni)
      const now = new Date();
      const minDate = new Date(now.getTime() + 5 * 60 * 1000);
      const maxDate = new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000);

      if (scheduleDate < minDate || scheduleDate > maxDate) {
        throw new Error('Data di invio non valida. Deve essere tra 5 minuti e 35 giorni nel futuro.');
      }

      // Inizializza il client Twilio
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      // Formatta il numero per WhatsApp
      const toNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
      
      // Crea il messaggio programmato
      const message = await twilioClient.messages.create({
        contentSid: templateId,
        to: toNumber,
        messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
        scheduleType: "fixed",
        sendAt: scheduleDate.toISOString(),
        contentVariables: JSON.stringify(variables)
      });

      return {
        success: true,
        messageId: message.sid,
        scheduledFor: scheduleDate
      };
    } catch (error) {
      console.error('Errore nella programmazione del messaggio:', error);
      throw error;
    }
  }

  /**
   * Controlla lo stato di approvazione di un template WhatsApp
   * @param {string} contentSid - ID del template Twilio
   * @returns {Promise<Object>} - Stato del template
   */
  async checkTemplateApprovalStatus(contentSid) {
    try {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      // Recupera lo stato di approvazione del template
      const response = await twilioClient.content.v1
        .contents(contentSid)
        .approvalRequests
        .list();

      // Prendi l'ultima richiesta di approvazione
      const latestApproval = response[0];

      if (!latestApproval) {
        return {
          success: true,
          status: 'PENDING',
          message: 'Template in attesa di invio per approvazione'
        };
      }

      // Mappa gli stati di Twilio ai nostri stati
      const statusMap = {
        'approved': 'APPROVED',
        'rejected': 'REJECTED',
        'pending': 'PENDING',
        'received': 'PENDING'
      };

      return {
        success: true,
        status: statusMap[latestApproval.status] || 'PENDING',
        rejectionReason: latestApproval.rejection_reason || null,
        whatsappCategory: latestApproval.category
      };
    } catch (error) {
      console.error('Errore nel controllo dello stato del template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new TwilioService(); 