const Restaurant = require('../models/Restaurant');

/**
 * Servizio per la gestione dei ristoranti
 */
class RestaurantService {
  /**
   * Crea un nuovo ristorante con i dati forniti dal setup wizard
   * @param {Object} formData - Dati del form
   * @param {String} userId - ID dell'utente proprietario
   * @returns {Promise<Restaurant>} Ristorante creato
   */
  async createRestaurant(formData, userId) {
    try {
      // Crea un oggetto restaurant mappando tutti i dati dal frontend al modello
      const restaurantData = {
        user: userId,
        name: formData.restaurantName,
        // Address è ora un oggetto con formattedAddress come richiesto dal modello
        address: {
          formattedAddress: formData.address?.formattedAddress || formData.address || "",
          latitude: formData.address?.latitude || formData.location?.lat,
          longitude: formData.address?.longitude || formData.location?.lng,
          // Gli altri campi sono opzionali e possono essere vuoti
        },
        // ID Google Places, URL e foto
        googlePlaceId: formData.googlePlaceId || formData.restaurantId,
        googleMapsUrl: formData.googleMapsUrl,
        mainPhoto: formData.mainPhoto,
        photos: formData.photos || [],
        
        // Rating e recensioni da Google
        googleRating: {
          rating: formData.googleRating?.rating || 0,
          reviewCount: formData.googleRating?.reviewCount || 0,
          initialReviewCount: formData.googleRating?.initialReviewCount || formData.googleRating?.reviewCount || 0,
          lastUpdated: new Date()
        },
        
        // Recensioni dettagliate se disponibili
        reviews: formData.reviews || [],
        
        // Link di recensione e piattaforma
        customReviewLink: formData.reviewLink,
        reviewPlatform: formData.reviewPlatform || "google",
        
        // Informazioni di contatto
        contact: formData.contact || {
          phone: "",
          website: ""
        },
        
        // Orari di apertura
        operatingHours: formData.operatingHours || [],
        
        // Altri dati
        cuisineTypes: formData.cuisineTypes || [],
        priceLevel: formData.priceLevel,
        
        // Descrizione generata automaticamente se non fornita
        description: formData.description || `${formData.restaurantName} offre un'esperienza culinaria unica.`,
        
        // Ristorante attivo per default
        isActive: true
      };

      console.log("Creating restaurant with data:", restaurantData);
      
      // Crea il ristorante nel database
      const restaurant = await Restaurant.create(restaurantData);
      
      return restaurant;
    } catch (error) {
      console.error('Error creating restaurant:', error);
      throw error;
    }
  }

  /**
   * Trova un ristorante per ID
   * @param {String} id - ID del ristorante
   * @returns {Promise<Restaurant>} Ristorante trovato
   */
  async findRestaurantById(id) {
    return await Restaurant.findById(id);
  }

  /**
   * Trova ristoranti per proprietario
   * @param {String} userId - ID dell'utente proprietario
   * @returns {Promise<Array<Restaurant>>} Array di ristoranti
   */
  async findRestaurantsByUser(userId) {
    return await Restaurant.find({ user: userId, isActive: true });
  }

  /**
   * Aggiorna un ristorante
   * @param {String} id - ID del ristorante
   * @param {Object} updateData - Dati da aggiornare
   * @returns {Promise<Restaurant>} Ristorante aggiornato
   */
  async updateRestaurant(id, updateData) {
    const restaurant = await Restaurant.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    if (!restaurant) {
      throw new Error('Ristorante non trovato');
    }

    return restaurant;
  }

  /**
   * Elimina un ristorante (disattivazione)
   * @param {String} id - ID del ristorante
   * @returns {Promise<Boolean>} True se eliminato con successo
   */
  async deleteRestaurant(id) {
    // Invece di eliminare, imposta isActive = false
    const restaurant = await Restaurant.findByIdAndUpdate(id, { isActive: false }, { new: true });
    return !!restaurant;
  }

  /**
   * Cerca ristoranti
   * @param {Object} filters - Filtri di ricerca
   * @returns {Promise<Array>} - Lista di ristoranti
   */
  async searchRestaurants(filters) {
    try {
      const query = {};
      
      if (filters.name) {
        query.name = { $regex: filters.name, $options: 'i' };
      }
      
      if (filters.city) {
        query['address.city'] = { $regex: filters.city, $options: 'i' };
      }
      
      if (filters.province) {
        query['address.province'] = { $regex: filters.province, $options: 'i' };
      }
      
      if (filters.cuisineType) {
        query.cuisineType = { $in: [filters.cuisineType] };
      }
      
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }
      
      return await Restaurant.find(query).limit(filters.limit || 20);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new RestaurantService(); 