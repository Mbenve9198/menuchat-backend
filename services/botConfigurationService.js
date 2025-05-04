const BotConfiguration = require('../models/BotConfiguration');
const menuService = require('./menuService');

/**
 * Servizio per la gestione delle configurazioni del bot
 */
class BotConfigurationService {
  /**
   * Crea una nuova configurazione del bot
   * @param {Object} formData - Dati del form
   * @param {String} restaurantId - ID del ristorante
   * @returns {Promise<BotConfiguration>} Configurazione del bot creata
   */
  async createBotConfiguration(formData, restaurantId) {
    try {
      // Mappa i dati dal form alla configurazione del bot
      const botConfigData = {
        restaurant: restaurantId,
        triggerWord: formData.triggerWord,
        welcomeMessage: formData.welcomeMessage,
        reviewLink: formData.reviewLink,
        reviewPlatform: formData.reviewPlatform || 'google',
        reviewTimer: formData.reviewTimer || 120,
        reviewMessage: formData.reviewTemplate,
        defaultMenuUrl: formData.menuUrl || '',
        active: true
      };

      console.log("Creating bot configuration with data:", botConfigData);
      
      // Crea la configurazione del bot nel database
      const botConfig = await BotConfiguration.create(botConfigData);
      
      // Se abbiamo dati dei menu in diverse lingue, creiamo i menu
      if (formData.menuLanguages && formData.menuLanguages.length > 0) {
        // Crea i menu usando il servizio menu
        const menus = await menuService.createOrUpdateMenusFromArray(
          formData.menuLanguages,
          restaurantId
        );
        
        // Aggiorna la configurazione del bot con i riferimenti ai menu
        botConfig.menus = menus.map(menu => menu._id);
        await botConfig.save();
      }
      
      return botConfig;
    } catch (error) {
      console.error('Error creating bot configuration:', error);
      throw error;
    }
  }

  /**
   * Trova una configurazione del bot per ID
   * @param {String} id - ID della configurazione del bot
   * @returns {Promise<BotConfiguration>} Configurazione del bot trovata
   */
  async findBotConfigurationById(id) {
    return await BotConfiguration.findById(id)
      .populate('restaurant')
      .populate('menus');
  }

  /**
   * Trova configurazioni del bot per ristorante
   * @param {String} restaurantId - ID del ristorante
   * @returns {Promise<Array<BotConfiguration>>} Array di configurazioni del bot
   */
  async findBotConfigurationsByRestaurant(restaurantId) {
    return await BotConfiguration.find({ restaurant: restaurantId, active: true })
      .populate('menus');
  }

  /**
   * Trova una configurazione del bot per trigger word
   * @param {String} triggerWord - Trigger word
   * @returns {Promise<BotConfiguration>} Configurazione del bot trovata
   */
  async findBotConfigurationByTrigger(triggerWord) {
    return await BotConfiguration.findOne({ 
      triggerWord: { $regex: new RegExp(`^${triggerWord}$`, 'i') }, 
      active: true 
    })
    .populate('restaurant')
    .populate('menus');
  }

  /**
   * Aggiorna una configurazione del bot
   * @param {String} id - ID della configurazione del bot
   * @param {Object} updateData - Dati da aggiornare
   * @returns {Promise<BotConfiguration>} Configurazione del bot aggiornata
   */
  async updateBotConfiguration(id, updateData) {
    // Se ci sono dati dei menu nell'aggiornamento, gestiamoli separatamente
    let menuLanguages;
    if (updateData.menuLanguages) {
      menuLanguages = updateData.menuLanguages;
      delete updateData.menuLanguages;
    }
    
    // Aggiorna la configurazione del bot
    const botConfig = await BotConfiguration.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    if (!botConfig) {
      throw new Error('Configurazione del bot non trovata');
    }

    // Se abbiamo dati dei menu, aggiorniamoli
    if (menuLanguages && menuLanguages.length > 0) {
      // Crea o aggiorna i menu usando il servizio menu
      const menus = await menuService.createOrUpdateMenusFromArray(
        menuLanguages,
        botConfig.restaurant
      );
      
      // Aggiorna i riferimenti ai menu
      botConfig.menus = menus.map(menu => menu._id);
      await botConfig.save();
      
      // Popola i menu per il risultato
      await botConfig.populate('menus');
    }

    return botConfig;
  }

  /**
   * Aggiorna il menu per una specifica lingua
   * @param {String} id - ID della configurazione del bot
   * @param {String} languageCode - Codice della lingua
   * @param {Object} menuData - Dati del menu
   * @returns {Promise<BotConfiguration>} Configurazione del bot aggiornata
   */
  async updateMenuForLanguage(id, languageCode, menuData) {
    // Trova la configurazione del bot
    const botConfig = await BotConfiguration.findById(id);
    
    if (!botConfig) {
      throw new Error('Configurazione del bot non trovata');
    }

    // Crea o aggiorna il menu per la lingua specificata
    const menu = await menuService.createMenu({
      ...menuData,
      language: {
        code: languageCode,
        name: menuData.languageName || languageCode,
        phonePrefix: menuData.phonePrefix || []
      }
    }, botConfig.restaurant);
    
    // Aggiorna l'array dei menu se non contiene già questo menu
    if (!botConfig.menus.includes(menu._id)) {
      botConfig.menus.push(menu._id);
      await botConfig.save();
    }
    
    // Popola i menu per il risultato
    await botConfig.populate('menus');
    
    return botConfig;
  }

  /**
   * Elimina una configurazione del bot (disattivazione)
   * @param {String} id - ID della configurazione del bot
   * @returns {Promise<Boolean>} True se eliminato con successo
   */
  async deleteBotConfiguration(id) {
    // Invece di eliminare, imposta active = false
    const botConfig = await BotConfiguration.findByIdAndUpdate(id, { active: false }, { new: true });
    return !!botConfig;
  }
}

module.exports = new BotConfigurationService(); 