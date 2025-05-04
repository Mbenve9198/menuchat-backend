const Menu = require('../models/Menu');

/**
 * Servizio per la gestione dei menu
 */
class MenuService {
  /**
   * Crea un nuovo menu per un ristorante in una specifica lingua
   * @param {Object} menuData - Dati del menu
   * @param {String} restaurantId - ID del ristorante
   * @returns {Promise<Menu>} Menu creato
   */
  async createMenu(menuData, restaurantId) {
    try {
      // Verifica se esiste già un menu per questa lingua
      const existingMenu = await this.findMenuByRestaurantAndLanguage(
        restaurantId, 
        menuData.language.code
      );

      // Se esiste, aggiorniamo anziché creare
      if (existingMenu) {
        return this.updateMenu(existingMenu._id, menuData);
      }

      // Preparare i dati per il menu
      const menuObject = {
        restaurant: restaurantId,
        language: {
          code: menuData.language.code,
          name: menuData.language.name,
          phonePrefix: menuData.language.phonePrefix || []
        },
        name: menuData.name || 'Standard Menu',
        description: menuData.description || '',
        menuUrl: menuData.menuUrl || '',
        menuPdfUrl: menuData.menuPdfUrl || '',
        menuPdfName: menuData.menuPdfName || '',
        cloudinaryPublicId: menuData.cloudinaryPublicId || '',
        isDefault: menuData.isDefault || false,
        isActive: true
      };

      // Se è il primo menu per questo ristorante, impostalo come default
      const menuCount = await Menu.countDocuments({ restaurant: restaurantId });
      if (menuCount === 0) {
        menuObject.isDefault = true;
      }

      console.log('Creating menu with data:', menuObject);
      
      // Crea il menu nel database
      const menu = await Menu.create(menuObject);
      
      return menu;
    } catch (error) {
      console.error('Error creating menu:', error);
      throw error;
    }
  }

  /**
   * Crea o aggiorna menu per un ristorante da un array di dati
   * @param {Array} menuDataArray - Array di dati dei menu
   * @param {String} restaurantId - ID del ristorante
   * @returns {Promise<Array<Menu>>} Array di menu creati/aggiornati
   */
  async createOrUpdateMenusFromArray(menuDataArray, restaurantId) {
    try {
      const menuPromises = menuDataArray.map(menuData => 
        this.createMenu(menuData, restaurantId)
      );
      
      return await Promise.all(menuPromises);
    } catch (error) {
      console.error('Error creating menus from array:', error);
      throw error;
    }
  }

  /**
   * Trova un menu per ID
   * @param {String} id - ID del menu
   * @returns {Promise<Menu>} Menu trovato
   */
  async findMenuById(id) {
    return await Menu.findById(id);
  }

  /**
   * Trova menu per ristorante
   * @param {String} restaurantId - ID del ristorante
   * @param {Boolean} activeOnly - Recupera solo i menu attivi
   * @returns {Promise<Array<Menu>>} Array di menu
   */
  async findMenusByRestaurant(restaurantId, activeOnly = true) {
    const query = { restaurant: restaurantId };
    
    if (activeOnly) {
      query.isActive = true;
    }
    
    return await Menu.find(query);
  }

  /**
   * Trova un menu per ristorante e lingua
   * @param {String} restaurantId - ID del ristorante
   * @param {String} languageCode - Codice della lingua
   * @returns {Promise<Menu>} Menu trovato
   */
  async findMenuByRestaurantAndLanguage(restaurantId, languageCode) {
    return await Menu.findOne({ 
      restaurant: restaurantId,
      'language.code': languageCode,
      isActive: true
    });
  }

  /**
   * Trova il menu di default per un ristorante
   * @param {String} restaurantId - ID del ristorante
   * @returns {Promise<Menu>} Menu di default
   */
  async findDefaultMenu(restaurantId) {
    return await Menu.findOne({ 
      restaurant: restaurantId,
      isDefault: true,
      isActive: true
    });
  }

  /**
   * Aggiorna un menu
   * @param {String} id - ID del menu
   * @param {Object} updateData - Dati da aggiornare
   * @returns {Promise<Menu>} Menu aggiornato
   */
  async updateMenu(id, updateData) {
    const menu = await Menu.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    if (!menu) {
      throw new Error('Menu non trovato');
    }

    return menu;
  }

  /**
   * Aggiorna il PDF di un menu
   * @param {String} id - ID del menu
   * @param {Object} pdfData - Dati PDF
   * @returns {Promise<Menu>} Menu aggiornato
   */
  async updateMenuPdf(id, pdfData) {
    const updateData = {
      menuPdfUrl: pdfData.menuPdfUrl,
      menuPdfName: pdfData.menuPdfName,
      cloudinaryPublicId: pdfData.cloudinaryPublicId
    };
    
    // Aggiorna solo i campi forniti
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );
    
    return this.updateMenu(id, updateData);
  }

  /**
   * Imposta un menu come default
   * @param {String} id - ID del menu
   * @param {String} restaurantId - ID del ristorante
   * @returns {Promise<Menu>} Menu impostato come default
   */
  async setMenuAsDefault(id, restaurantId) {
    // Prima rimuovi lo stato di default da tutti i menu del ristorante
    await Menu.updateMany(
      { restaurant: restaurantId },
      { isDefault: false }
    );
    
    // Poi imposta questo menu come default
    return this.updateMenu(id, { isDefault: true });
  }

  /**
   * Elimina un menu (disattivazione)
   * @param {String} id - ID del menu
   * @returns {Promise<Boolean>} True se eliminato con successo
   */
  async deleteMenu(id) {
    // Invece di eliminare, imposta isActive = false
    const menu = await Menu.findByIdAndUpdate(id, { isActive: false }, { new: true });
    return !!menu;
  }
}

module.exports = new MenuService(); 