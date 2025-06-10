const ScheduledMessage = require('../models/ScheduledMessage');
const WhatsAppContact = require('../models/WhatsAppContact');
const crypto = require('crypto');
const Restaurant = require('../models/Restaurant');

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
   * @param {Object} messageData - Dati del messaggio da programmare
   * @returns {Promise<Object>} - Risultato della programmazione
   */
  async scheduleReviewMessage(messageData) {
    try {
      console.log('📅 Programmazione messaggio di recensione:', {
        restaurantId: messageData.restaurantId,
        phoneNumber: messageData.phoneNumber,
        scheduledTime: messageData.scheduledTime
      });

      // Controlla se abbiamo un template object (nuovo sistema)
      if (messageData.template && typeof messageData.template === 'object') {
        const template = messageData.template;
        const restaurant = await Restaurant.findById(messageData.restaurantId);
        
        // LOG DETTAGLIATO: Template ricevuto
        console.log(`⭐ PROCESSAMENTO TEMPLATE RECENSIONE (NUOVO SISTEMA):`);
        console.log(`   - Template Nome: ${template.name}`);
        console.log(`   - Template ID: ${template._id}`);
        console.log(`   - Template Lingua: ${template.language}`);
        console.log(`   - Template Tipo: ${template.type}`);
        console.log(`   - Ristorante: ${restaurant?.name || 'N/A'}`);
        console.log(`   - Cliente: ${messageData.customerName || 'Cliente'}`);
        console.log(`   - Template Body originale: "${template.components?.body?.text || 'N/A'}"`);
        
        // Converti il template in messaggio normale
        const twilioService = require('./twilioService');
        const convertedMessage = twilioService.convertTemplateToMessage(
          template, 
          messageData.customerName || 'Cliente', 
          restaurant
        );

        // LOG DETTAGLIATO: Messaggio convertito
        console.log(`   - Messaggio convertito:`);
        console.log(`     "${convertedMessage.messageBody}"`);
        if (convertedMessage.mediaUrl) {
          console.log(`   - Media URL: ${convertedMessage.mediaUrl}`);
        }
        console.log(`   - Tipo messaggio: ${convertedMessage.messageType}`);

        // Programma usando il nuovo sistema
        const scheduledMessage = await ScheduledMessage.scheduleReviewMessage({
          restaurantId: messageData.restaurantId,
          interactionId: messageData.interactionId,
          phoneNumber: messageData.phoneNumber,
          customerName: messageData.customerName,
          template: template._id || template,
          messageBody: convertedMessage.messageBody,
          mediaUrl: convertedMessage.mediaUrl,
          scheduledFor: messageData.scheduledTime
        });

        console.log(`✅ Messaggio di recensione programmato localmente (ID: ${scheduledMessage._id})`);
        console.log(`⭐ RIEPILOGO PROGRAMMAZIONE:`);
        console.log(`   - Scheduled Message ID: ${scheduledMessage._id}`);
        console.log(`   - Ristorante: ${restaurant?.name}`);
        console.log(`   - Template: ${template.name} (${template.language})`);
        console.log(`   - Telefono: ${messageData.phoneNumber}`);
        console.log(`   - Programmato per: ${messageData.scheduledTime}`);
        
        return {
          success: true,
          messageId: scheduledMessage._id,
          scheduledTime: messageData.scheduledTime,
          method: 'local_new_system'
        };
      }
      // Fallback al vecchio sistema se non abbiamo template object
      else if (messageData.templateId) {
        console.log(`⭐ PROCESSAMENTO TEMPLATE RECENSIONE (SISTEMA LEGACY):`);
        console.log(`   - Template ID: ${messageData.templateId}`);
        console.log(`   - Variabili: ${JSON.stringify(messageData.templateVariables)}`);
        
        const scheduledMessage = await ScheduledMessage.scheduleReviewMessage({
          restaurantId: messageData.restaurantId,
          interactionId: messageData.interactionId,
          phoneNumber: messageData.phoneNumber,
          customerName: messageData.customerName,
          templateId: messageData.templateId,
          templateVariables: messageData.templateVariables,
          scheduledFor: messageData.scheduledTime
        });

        console.log(`✅ Messaggio di recensione programmato (legacy system, ID: ${scheduledMessage._id})`);

        return {
          success: true,
          messageId: scheduledMessage._id,
          scheduledTime: messageData.scheduledTime,
          method: 'local_legacy_system'
        };
      } else {
        throw new Error('Nessun template o templateId fornito per il messaggio di recensione');
      }

    } catch (error) {
      console.error('❌ Errore nella programmazione del messaggio di recensione:', error);
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