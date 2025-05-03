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
}

module.exports = new TwilioService(); 