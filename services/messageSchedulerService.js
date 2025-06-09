const ScheduledMessage = require('../models/ScheduledMessage');
const WhatsAppContact = require('../models/WhatsAppContact');
const crypto = require('crypto');

/**
 * Genera un token sicuro per l'unsubscribe
 * @param {String} contactId - ID del contatto
 * @param {String} phoneNumber - Numero di telefono del contatto
 * @returns {String} - Token crittografato
 */
const generateUnsubscribeToken = (contactId, phoneNumber) => {
  const secret = `${contactId}-${phoneNumber}-${process.env.JWT_SECRET || 'menuchat-secret-key'}`;
  return crypto
    .createHash('sha256')
    .update(secret)
    .digest('hex');
};

/**
 * Service per la gestione della programmazione dei messaggi
 */
class MessageSchedulerService {
  
  /**
   * Programma un messaggio di recensione
   * @param {Object} data - Dati per la programmazione
   * @returns {Promise<Object>} - Risultato della programmazione
   */
  async scheduleReviewMessage(data) {
    try {
      const {
        restaurantId,
        interactionId,
        phoneNumber,
        templateId,
        customerName = 'Cliente',
        scheduledTime,
        language = 'it'
      } = data;

      console.log('===== PROGRAMMAZIONE MESSAGGIO RECENSIONE (LOCALE) =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Template ID:', templateId);
      console.log('Scheduled Time:', scheduledTime);

      // Verifica che la data di invio sia nel futuro (almeno 1 minuto dopo)
      const minScheduleTime = new Date(Date.now() + 1 * 60 * 1000); // 1 minuto nel futuro
      let finalScheduledTime = new Date(scheduledTime);
      
      if (finalScheduledTime < minScheduleTime) {
        finalScheduledTime = minScheduleTime;
      }

      // Ottieni o crea il contatto WhatsApp per le variabili del template
      let contact;
      try {
        const normalizedPhone = phoneNumber.replace('whatsapp:', '');
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
            name: customerName,
            language: language
          });
          await contact.save();
        }
      } catch (error) {
        console.error('Errore nel recupero/creazione del contatto:', error);
      }

      // Prepara le variabili del template
      const templateVariables = {};
      
      // Variabile 1: Nome del cliente
      if (contact && contact.name && contact.name !== 'Cliente') {
        templateVariables["1"] = contact.name;
      } else {
        templateVariables["1"] = customerName;
      }
      
      // Variabile 2: URL di unsubscribe (solo se abbiamo il contatto)
      if (contact) {
        const contactId = contact._id.toString();
        const unsubscribeToken = generateUnsubscribeToken(contactId, contact.phoneNumber);
        const unsubscribePath = `api/campaign/unsubscribe/${contactId}/${unsubscribeToken}`;
        templateVariables["2"] = unsubscribePath;
      }

      // Crea il messaggio programmato
      const scheduledMessage = await ScheduledMessage.scheduleReviewMessage({
        restaurantId,
        interactionId,
        phoneNumber,
        customerName: templateVariables["1"],
        templateId,
        templateVariables,
        scheduledFor: finalScheduledTime
      });

      console.log(`✅ Messaggio recensione programmato localmente: ${scheduledMessage._id}`);
      console.log(`Variabili utilizzate: ${JSON.stringify(templateVariables)}`);

      return {
        success: true,
        messageId: scheduledMessage._id.toString(),
        scheduledTime: finalScheduledTime,
        status: 'scheduled'
      };

    } catch (error) {
      console.error('Errore nella programmazione del messaggio recensione:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Programma un messaggio di campagna
   * @param {Object} data - Dati per la programmazione
   * @returns {Promise<Object>} - Risultato della programmazione
   */
  async scheduleCampaignMessage(data) {
    try {
      const {
        restaurantId,
        campaignId,
        phoneNumber,
        templateId,
        customerName = 'Cliente',
        scheduledTime,
        templateVariables = {}
      } = data;

      console.log('===== PROGRAMMAZIONE MESSAGGIO CAMPAGNA (LOCALE) =====');
      console.log('Phone Number:', phoneNumber);
      console.log('Template ID:', templateId);
      console.log('Scheduled Time:', scheduledTime);

      // Verifica che la data di invio sia nel futuro (almeno 1 minuto dopo)
      const minScheduleTime = new Date(Date.now() + 1 * 60 * 1000);
      let finalScheduledTime = new Date(scheduledTime);
      
      if (finalScheduledTime < minScheduleTime) {
        finalScheduledTime = minScheduleTime;
      }

      // Crea il messaggio programmato
      const scheduledMessage = await ScheduledMessage.scheduleCampaignMessage({
        restaurantId,
        campaignId,
        phoneNumber,
        customerName,
        templateId,
        templateVariables,
        scheduledFor: finalScheduledTime
      });

      console.log(`✅ Messaggio campagna programmato localmente: ${scheduledMessage._id}`);

      return {
        success: true,
        messageId: scheduledMessage._id.toString(),
        scheduledTime: finalScheduledTime,
        status: 'scheduled'
      };

    } catch (error) {
      console.error('Errore nella programmazione del messaggio campagna:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cancella un messaggio programmato
   * @param {string} messageId - ID del messaggio da cancellare
   * @returns {Promise<Object>} - Risultato della cancellazione
   */
  async cancelScheduledMessage(messageId) {
    try {
      const message = await ScheduledMessage.findById(messageId);
      
      if (!message) {
        throw new Error('Messaggio programmato non trovato');
      }

      if (message.status !== 'pending') {
        throw new Error('Il messaggio non può essere cancellato (già inviato o fallito)');
      }

      await message.cancel();
      
      console.log(`✅ Messaggio programmato cancellato: ${messageId}`);

      return {
        success: true,
        messageId: messageId,
        status: 'cancelled'
      };

    } catch (error) {
      console.error('Errore nella cancellazione del messaggio programmato:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Ottieni lo stato di un messaggio programmato
   * @param {string} messageId - ID del messaggio
   * @returns {Promise<Object>} - Stato del messaggio
   */
  async getMessageStatus(messageId) {
    try {
      const message = await ScheduledMessage.findById(messageId);
      
      if (!message) {
        throw new Error('Messaggio programmato non trovato');
      }

      return {
        success: true,
        data: {
          id: message._id,
          status: message.status,
          scheduledFor: message.scheduledFor,
          sentAt: message.sentAt,
          errorMessage: message.errorMessage,
          retryCount: message.retryCount
        }
      };

    } catch (error) {
      console.error('Errore nel recupero stato messaggio:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Ottieni statistiche sui messaggi programmati per un ristorante
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Statistiche
   */
  async getRestaurantMessageStats(restaurantId) {
    try {
      const stats = await ScheduledMessage.aggregate([
        { $match: { restaurant: restaurantId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const result = {
        pending: 0,
        sent: 0,
        failed: 0,
        cancelled: 0
      };

      stats.forEach(stat => {
        result[stat._id] = stat.count;
      });

      return {
        success: true,
        data: result
      };

    } catch (error) {
      console.error('Errore nel recupero statistiche messaggi:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new MessageSchedulerService(); 