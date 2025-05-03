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
      // Estrai informazioni dall'indirizzo se è una stringa
      let addressComponents = {
        street: '',
        streetNumber: '',
        city: '',
        province: '',
        postalCode: '',
        country: 'Italia'
      };
      
      // Se abbiamo l'indirizzo come stringa, proviamo a estrarre le componenti
      if (restaurantData.address && typeof restaurantData.address === 'string') {
        const addressString = restaurantData.address;
        
        // Estrai il CAP se presente
        const postalCodeMatch = addressString.match(/(\d{5})/);
        if (postalCodeMatch) {
          addressComponents.postalCode = postalCodeMatch[0];
        }
        
        // Cerca la sigla della provincia (2 lettere maiuscole)
        const provinceMatch = addressString.match(/\b([A-Z]{2})\b/);
        if (provinceMatch) {
          addressComponents.province = provinceMatch[0];
        } else {
          // Se non trova la sigla, usiamo un valore predefinito
          addressComponents.province = 'FI'; // Default a Firenze
        }
        
        // Estrai la città (assumiamo che sia prima del CAP o della sigla provincia)
        let cityMatch = addressString.match(/,\s*([^,]+)(?=,\s*\d{5})/);
        if (cityMatch) {
          addressComponents.city = cityMatch[1].trim();
        } else {
          // Tentiamo un altro pattern
          cityMatch = addressString.match(/,\s*([^,]+)(?=\s+[A-Z]{2})/);
          if (cityMatch) {
            addressComponents.city = cityMatch[1].trim();
          } else {
            // Default o uso nome città dal nome ristorante
            addressComponents.city = 'Firenze'; // Default
          }
        }
        
        // Per la via, prendiamo la prima parte dell'indirizzo
        const streetParts = addressString.split(',')[0].trim().split(' ');
        if (streetParts.length > 1) {
          // L'ultimo elemento potrebbe essere il numero civico
          const lastPart = streetParts.pop();
          if (/^\d+[a-zA-Z]?$/.test(lastPart)) {
            // Se sembra un numero civico
            addressComponents.streetNumber = lastPart;
            addressComponents.street = streetParts.join(' ');
          } else {
            // Altrimenti tutto è il nome della via
            streetParts.push(lastPart);
            addressComponents.street = streetParts.join(' ');
            addressComponents.streetNumber = 'SN'; // Senza numero
          }
        } else if (streetParts.length === 1) {
          addressComponents.street = streetParts[0];
          addressComponents.streetNumber = 'SN'; // Senza numero
        }
      }
      
      // Usa i componenti estratti o quelli forniti direttamente
      const addressInfo = {
        street: restaurantData.street || addressComponents.street,
        streetNumber: restaurantData.streetNumber || addressComponents.streetNumber,
        city: restaurantData.city || addressComponents.city,
        province: restaurantData.province || addressComponents.province,
        postalCode: restaurantData.postalCode || addressComponents.postalCode,
        country: restaurantData.country || addressComponents.country,
        latitude: restaurantData.location?.lat,
        longitude: restaurantData.location?.lng
      };
      
      // Genera un numero di telefono predefinito se non fornito
      const phoneNumber = restaurantData.phone || '+39 055 123456'; // Numero fittizio per Firenze
      
      // Prepara i dati per il modello di Restaurant
      const restaurantInfo = {
        user: userId,
        name: restaurantData.restaurantName,
        address: addressInfo,
        googlePlaceId: restaurantData.restaurantId,
        googleMapsUrl: restaurantData.googleMapsUrl,
        customReviewLink: restaurantData.reviewLink,
        contact: {
          phone: phoneNumber,
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