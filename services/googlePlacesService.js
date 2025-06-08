const Restaurant = require('../models/Restaurant');
const DailyReviewSnapshot = require('../models/DailyReviewSnapshot');
const axios = require('axios');

class GooglePlacesService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api/place';
  }

  /**
   * Utility per eseguire operazioni con retry automatico
   * @param {Function} operation - Funzione da eseguire
   * @param {number} maxRetries - Numero massimo di tentativi
   * @param {string} operationName - Nome dell'operazione per logging
   * @returns {Promise<any>} Risultato dell'operazione
   */
  async executeWithRetry(operation, maxRetries = 3, operationName = 'operazione') {
    let attempt = 0;
    let lastError;

    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        attempt++;
        lastError = error;
        
        // Se è un VersionError e abbiamo ancora tentativi, riprova
        if (error.name === 'VersionError' && attempt < maxRetries) {
          console.warn(`⚠️ VersionError durante ${operationName}, tentativo ${attempt}/${maxRetries}. Riprovo...`);
          
          // Backoff esponenziale
          const delay = Math.pow(2, attempt) * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          continue;
        }
        
        // Per altri errori, esci immediatamente
        break;
      }
    }
    
    // Se arriviamo qui, tutti i tentativi sono falliti
    console.error(`❌ ${operationName} fallita dopo ${maxRetries} tentativi:`, {
      error: lastError.name,
      message: lastError.message,
      version: lastError.version,
      modifiedPaths: lastError.modifiedPaths
    });
    
    throw lastError;
  }

  /**
   * Ottiene i dettagli di un posto da Google Places API
   */
  async getPlaceDetails(placeId) {
    try {
      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          key: this.apiKey,
          fields: 'rating,user_ratings_total,reviews'
        }
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      return response.data.result;
    } catch (error) {
      console.error('Error fetching place details:', error);
      throw error;
    }
  }

  /**
   * Crea uno snapshot giornaliero delle recensioni
   */
  async createDailySnapshot(restaurant, syncType = 'daily_auto') {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Controlla se esiste già uno snapshot per oggi
      const existingSnapshot = await DailyReviewSnapshot.findOne({
        restaurant: restaurant._id,
        date: today
      });

      if (existingSnapshot && syncType === 'daily_auto') {
        console.log(`Snapshot già esistente per ${restaurant.name} - ${today.toDateString()}`);
        return existingSnapshot;
      }

      // Ottieni l'ultimo snapshot per calcolare la differenza
      const lastSnapshot = await DailyReviewSnapshot.getLatestSnapshot(restaurant._id);
      
      const currentReviews = restaurant.googleRating?.reviewCount || 0;
      const currentRating = restaurant.googleRating?.rating || 0;
      
      // Calcola le nuove recensioni
      let newReviewsToday = 0;
      if (lastSnapshot) {
        newReviewsToday = Math.max(0, currentReviews - lastSnapshot.googleReviewSnapshot.totalReviews);
      } else {
        // Primo snapshot - usa initialReviewCount come baseline
        const initialCount = restaurant.googleRating?.initialReviewCount || 0;
        newReviewsToday = Math.max(0, currentReviews - initialCount);
      }

      // Crea o aggiorna lo snapshot
      const snapshotData = {
        restaurant: restaurant._id,
        date: today,
        googleReviewSnapshot: {
          totalReviews: currentReviews,
          averageRating: currentRating,
          newReviewsToday: newReviewsToday,
          syncedAt: new Date()
        },
        syncType: syncType,
        isInitialSnapshot: !lastSnapshot
      };

      let snapshot;
      if (existingSnapshot) {
        // Aggiorna snapshot esistente (per sync manuali)
        Object.assign(existingSnapshot, snapshotData);
        snapshot = await existingSnapshot.save();
        console.log(`📊 Aggiornato snapshot per ${restaurant.name}: ${newReviewsToday} nuove recensioni`);
      } else {
        // Crea nuovo snapshot
        snapshot = new DailyReviewSnapshot(snapshotData);
        await snapshot.save();
        console.log(`📊 Creato snapshot per ${restaurant.name}: ${newReviewsToday} nuove recensioni`);
      }

      return snapshot;
    } catch (error) {
      console.error(`Errore creazione snapshot per ${restaurant.name}:`, error);
      throw error;
    }
  }

  /**
   * Sincronizza le recensioni per un singolo ristorante con gestione della concorrenza
   */
  async syncRestaurantReviews(restaurant, syncType = 'daily_auto') {
    if (!restaurant.googlePlaceId) {
      throw new Error('Restaurant has no Google Place ID');
    }

    // Usa la utility per gestire i retry automaticamente
    return await this.executeWithRetry(async () => {
      // Ricarica il ristorante dal database per avere la versione più recente
      const freshRestaurant = await Restaurant.findById(restaurant._id);
      if (!freshRestaurant) {
        throw new Error('Ristorante non trovato durante il reload');
      }

      // Ottieni i nuovi dati da Google Places
      const placeDetails = await this.getPlaceDetails(freshRestaurant.googlePlaceId);
      
      // Usa findByIdAndUpdate per operazione atomica
      const updateData = {
        'googleRating.rating': placeDetails.rating || 0,
        'googleRating.reviewCount': placeDetails.user_ratings_total || 0,
        'googleRating.lastUpdated': new Date()
      };

      // Preserva l'initialReviewCount esistente se presente
      if (!freshRestaurant.googleRating?.initialReviewCount) {
        updateData['googleRating.initialReviewCount'] = placeDetails.user_ratings_total || 0;
      }

      // Aggiorna le recensioni se disponibili
      if (placeDetails.reviews) {
        updateData.reviews = placeDetails.reviews.map(review => ({
          authorName: review.author_name,
          rating: review.rating,
          text: review.text,
          time: new Date(review.time * 1000)
        }));
      }

      // Operazione atomica per evitare problemi di concorrenza
      const updatedRestaurant = await Restaurant.findByIdAndUpdate(
        freshRestaurant._id,
        updateData,
        { 
          new: true, 
          runValidators: true,
          overwrite: false
        }
      );

      if (!updatedRestaurant) {
        throw new Error('Ristorante non trovato durante l\'aggiornamento');
      }
      
      // Crea snapshot giornaliero
      await this.createDailySnapshot(updatedRestaurant, syncType);
      
      console.log(`✅ Aggiornate recensioni per ${updatedRestaurant.name}`);

      return updatedRestaurant;
    }, 3, `sync recensioni per ${restaurant.name}`);
  }

  /**
   * Aggiorna le recensioni per tutti i ristoranti
   */
  async updateAllRestaurantsReviews() {
    try {
      // Trova tutti i ristoranti con googlePlaceId
      const restaurants = await Restaurant.find({
        googlePlaceId: { $exists: true, $ne: null },
        isActive: true
      });

      console.log(`🔄 Aggiornamento recensioni per ${restaurants.length} ristoranti`);

      let successCount = 0;
      let errorCount = 0;

      for (const restaurant of restaurants) {
        try {
          await this.syncRestaurantReviews(restaurant, 'daily_auto');
          successCount++;
          // Attendi un po' per non superare i limiti di rate dell'API
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Errore aggiornamento recensioni per ${restaurant.name}:`, error);
          errorCount++;
          continue;
        }
      }

      console.log(`✅ Aggiornamento recensioni completato: ${successCount} successi, ${errorCount} errori`);
      return { successCount, errorCount };
    } catch (error) {
      console.error('❌ Errore in updateAllRestaurantsReviews:', error);
      throw error;
    }
  }

  /**
   * Calcola le recensioni raccolte in un periodo per un ristorante
   */
  async getReviewsCollectedInPeriod(restaurantId, startDate, endDate) {
    try {
      return await DailyReviewSnapshot.calculateReviewsCollectedInPeriod(restaurantId, startDate, endDate);
    } catch (error) {
      console.error('Errore calcolo recensioni periodo:', error);
      return 0;
    }
  }

  /**
   * Ottiene le statistiche giornaliere delle recensioni per un ristorante
   */
  async getDailyReviewStats(restaurantId, date = null) {
    try {
      const targetDate = date || new Date();
      targetDate.setHours(0, 0, 0, 0);

      const snapshot = await DailyReviewSnapshot.findOne({
        restaurant: restaurantId,
        date: targetDate
      });

      if (!snapshot) {
        return {
          date: targetDate,
          newReviews: 0,
          totalReviews: 0,
          averageRating: 0
        };
      }

      return {
        date: targetDate,
        newReviews: snapshot.googleReviewSnapshot.newReviewsToday,
        totalReviews: snapshot.googleReviewSnapshot.totalReviews,
        averageRating: snapshot.googleReviewSnapshot.averageRating
      };
    } catch (error) {
      console.error('Errore recupero statistiche giornaliere:', error);
      return {
        date: date || new Date(),
        newReviews: 0,
        totalReviews: 0,
        averageRating: 0
      };
    }
  }
}

module.exports = new GooglePlacesService(); 