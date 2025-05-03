const BotConfiguration = require('../models/BotConfiguration');

/**
 * Service per la gestione delle configurazioni del bot
 */
class BotConfigurationService {
  /**
   * Crea una nuova configurazione per il bot
   * @param {Object} configData - Dati di configurazione del bot
   * @param {string} restaurantId - ID del ristorante a cui associare il bot
   * @returns {Promise<Object>} - Configurazione del bot creata
   */
  async createBotConfiguration(configData, restaurantId) {
    try {
      // Uso di default se mancano dei dati
      const welcomeMsg = configData.welcomeMessage || 'Benvenuto nel nostro ristorante! Come posso aiutarti?';
      const reviewMsg = configData.reviewTemplate || 'Ti è piaciuta la tua esperienza? Ci farebbe piacere ricevere una tua recensione!';
      const triggerWord = configData.triggerWord || 'menu';
      
      // Converti minuti in ore, con un default di 2 ore se non specificato
      // e limitando a 72 ore (valore massimo consentito dal modello)
      let reviewTimerHours = 2; // Default 2 ore
      if (configData.reviewTimer) {
        // Assumiamo che reviewTimer sia in minuti nel frontend
        reviewTimerHours = Math.min(Math.max(Math.round(configData.reviewTimer / 60), 1), 72);
      }

      // Preparazione dei dati per il modello di BotConfiguration
      const botConfigInfo = {
        restaurant: restaurantId,
        triggerWord: triggerWord,
        welcomeMessage: {
          it: welcomeMsg,
          en: welcomeMsg, // Per ora usiamo lo stesso messaggio per tutte le lingue
          es: welcomeMsg
        },
        reviewRequestMessage: {
          it: reviewMsg,
          en: reviewMsg, // Per ora usiamo lo stesso messaggio per tutte le lingue
          es: reviewMsg
        },
        hoursDelayBeforeReviewRequest: reviewTimerHours, // Ora in ore
        whatsappNumberType: 'system', // Default
        active: true
      };

      // Crea una nuova configurazione bot
      const botConfiguration = new BotConfiguration(botConfigInfo);

      // Salva la configurazione
      await botConfiguration.save();
      
      return botConfiguration;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trova la configurazione del bot per un ristorante
   * @param {string} restaurantId - ID del ristorante
   * @returns {Promise<Object>} - Configurazione trovata
   */
  async findByRestaurant(restaurantId) {
    try {
      return await BotConfiguration.findOne({ restaurant: restaurantId, active: true });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trova una configurazione bot per ID
   * @param {string} id - ID della configurazione
   * @returns {Promise<Object>} - Configurazione trovata
   */
  async findById(id) {
    try {
      return await BotConfiguration.findById(id);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trova una configurazione bot per parola trigger
   * @param {string} triggerWord - Parola trigger da cercare
   * @returns {Promise<Object>} - Configurazione trovata
   */
  async findByTriggerWord(triggerWord) {
    try {
      return await BotConfiguration.findOne({ 
        triggerWord: { $regex: new RegExp(`^${triggerWord}$`, 'i') },
        active: true 
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Aggiorna la configurazione del bot
   * @param {string} id - ID della configurazione
   * @param {Object} configData - Dati aggiornati della configurazione
   * @returns {Promise<Object>} - Configurazione aggiornata
   */
  async updateConfiguration(id, configData) {
    try {
      const botConfig = await BotConfiguration.findById(id);
      
      if (!botConfig) {
        throw new Error('Configurazione bot non trovata');
      }

      // Aggiorna i campi forniti
      if (configData.triggerWord) botConfig.triggerWord = configData.triggerWord;
      
      if (configData.welcomeMessage) {
        botConfig.welcomeMessage.it = configData.welcomeMessage;
        // Aggiorna anche le altre lingue se necessario
        if (!botConfig.welcomeMessage.en) botConfig.welcomeMessage.en = configData.welcomeMessage;
        if (!botConfig.welcomeMessage.es) botConfig.welcomeMessage.es = configData.welcomeMessage;
      }
      
      if (configData.reviewTemplate) {
        botConfig.reviewRequestMessage.it = configData.reviewTemplate;
        // Aggiorna anche le altre lingue se necessario
        if (!botConfig.reviewRequestMessage.en) botConfig.reviewRequestMessage.en = configData.reviewTemplate;
        if (!botConfig.reviewRequestMessage.es) botConfig.reviewRequestMessage.es = configData.reviewTemplate;
      }
      
      if (configData.reviewTimer) {
        // Converti minuti in ore
        const reviewTimerHours = Math.min(Math.max(Math.round(configData.reviewTimer / 60), 1), 72);
        botConfig.hoursDelayBeforeReviewRequest = reviewTimerHours;
      }
      
      if (configData.active !== undefined) botConfig.active = configData.active;

      // Salva le modifiche
      await botConfig.save();
      
      return botConfig;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Disattiva un bot
   * @param {string} id - ID della configurazione
   * @param {string} reason - Motivo della disattivazione
   * @returns {Promise<Object>} - Configurazione aggiornata
   */
  async deactivateBot(id, reason = '') {
    try {
      const botConfig = await BotConfiguration.findById(id);
      
      if (!botConfig) {
        throw new Error('Configurazione bot non trovata');
      }

      botConfig.active = false;
      botConfig.deactivationReason = reason || 'Disattivato manualmente';

      await botConfig.save();
      
      return botConfig;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new BotConfigurationService(); 