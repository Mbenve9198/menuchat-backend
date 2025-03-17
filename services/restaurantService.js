const Restaurant = require('../models/Restaurant');

/**
 * Service per la gestione dei ristoranti
 */
class RestaurantService {
  /**
   * Crea un nuovo ristorante
   * @param {Object} restaurantData - Dati del ristorante
   * @param {string} userId - ID dell'utente proprietario
   * @returns {Promise<Object>} - Ristorante creato
   */
  async createRestaurant(restaurantData, userId) {
    try {
      // Prepara i dati per il modello di Restaurant
      const restaurantInfo = {
        user: userId,
        name: restaurantData.restaurantName,
        address: {
          street: restaurantData.street || '',
          streetNumber: restaurantData.streetNumber || '',
          city: restaurantData.city || '',
          province: restaurantData.province || '',
          postalCode: restaurantData.postalCode || '',
          country: restaurantData.country || 'Italia',
          latitude: restaurantData.location?.lat,
          longitude: restaurantData.location?.lng
        },
        googlePlaceId: restaurantData.restaurantId,
        googleMapsUrl: restaurantData.googleMapsUrl,
        customReviewLink: restaurantData.reviewLink,
        contact: {
          phone: restaurantData.phone || '',
          email: restaurantData.email || '',
          website: restaurantData.menuUrl || '',
          socialMedia: {
            facebook: restaurantData.facebook || '',
            instagram: restaurantData.instagram || '',
            twitter: restaurantData.twitter || ''
          }
        },
        description: restaurantData.welcomeMessage || `${restaurantData.restaurantName} ti dà il benvenuto!`,
        cuisineType: restaurantData.cuisineType ? [restaurantData.cuisineType] : [],
        features: []
      };

      // Crea un nuovo ristorante
      const restaurant = new Restaurant(restaurantInfo);

      // Salva il ristorante
      await restaurant.save();
      
      return restaurant;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trova un ristorante per ID
   * @param {string} id - ID del ristorante
   * @returns {Promise<Object>} - Ristorante trovato
   */
  async findRestaurantById(id) {
    try {
      return await Restaurant.findById(id);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trova ristoranti per utente
   * @param {string} userId - ID dell'utente
   * @returns {Promise<Array>} - Lista di ristoranti
   */
  async findRestaurantsByUser(userId) {
    try {
      return await Restaurant.find({ user: userId });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Aggiorna un ristorante
   * @param {string} id - ID del ristorante
   * @param {Object} restaurantData - Dati aggiornati del ristorante
   * @returns {Promise<Object>} - Ristorante aggiornato
   */
  async updateRestaurant(id, restaurantData) {
    try {
      const restaurant = await Restaurant.findById(id);
      
      if (!restaurant) {
        throw new Error('Ristorante non trovato');
      }

      // Aggiorna i campi se forniti
      if (restaurantData.restaurantName) restaurant.name = restaurantData.restaurantName;
      
      if (restaurantData.street || restaurantData.city || restaurantData.location) {
        if (restaurantData.street) restaurant.address.street = restaurantData.street;
        if (restaurantData.streetNumber) restaurant.address.streetNumber = restaurantData.streetNumber;
        if (restaurantData.city) restaurant.address.city = restaurantData.city;
        if (restaurantData.province) restaurant.address.province = restaurantData.province;
        if (restaurantData.postalCode) restaurant.address.postalCode = restaurantData.postalCode;
        if (restaurantData.country) restaurant.address.country = restaurantData.country;
        if (restaurantData.location?.lat) restaurant.address.latitude = restaurantData.location.lat;
        if (restaurantData.location?.lng) restaurant.address.longitude = restaurantData.location.lng;
      }
      
      if (restaurantData.restaurantId) restaurant.googlePlaceId = restaurantData.restaurantId;
      if (restaurantData.googleMapsUrl) restaurant.googleMapsUrl = restaurantData.googleMapsUrl;
      if (restaurantData.reviewLink) restaurant.customReviewLink = restaurantData.reviewLink;
      
      if (restaurantData.phone || restaurantData.email || restaurantData.menuUrl) {
        if (restaurantData.phone) restaurant.contact.phone = restaurantData.phone;
        if (restaurantData.email) restaurant.contact.email = restaurantData.email;
        if (restaurantData.menuUrl) restaurant.contact.website = restaurantData.menuUrl;
        if (restaurantData.facebook) restaurant.contact.socialMedia.facebook = restaurantData.facebook;
        if (restaurantData.instagram) restaurant.contact.socialMedia.instagram = restaurantData.instagram;
        if (restaurantData.twitter) restaurant.contact.socialMedia.twitter = restaurantData.twitter;
      }
      
      if (restaurantData.welcomeMessage) restaurant.description = restaurantData.welcomeMessage;
      if (restaurantData.cuisineType) restaurant.cuisineType = [restaurantData.cuisineType];
      if (restaurantData.isActive !== undefined) restaurant.isActive = restaurantData.isActive;

      // Salva le modifiche
      await restaurant.save();
      
      return restaurant;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Elimina un ristorante
   * @param {string} id - ID del ristorante
   * @returns {Promise<boolean>} - true se eliminato con successo
   */
  async deleteRestaurant(id) {
    try {
      const result = await Restaurant.findByIdAndDelete(id);
      return !!result;
    } catch (error) {
      throw error;
    }
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