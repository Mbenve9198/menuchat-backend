const Restaurant = require('../models/Restaurant');
const axios = require('axios');

class GooglePlacesService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api/place';
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
   * Aggiorna le recensioni per tutti i ristoranti
   */
  async updateAllRestaurantsReviews() {
    try {
      // Trova tutti i ristoranti con googlePlaceId
      const restaurants = await Restaurant.find({
        googlePlaceId: { $exists: true, $ne: null },
        isActive: true
      });

      console.log(`Updating reviews for ${restaurants.length} restaurants`);

      for (const restaurant of restaurants) {
        try {
          // Se è la prima volta che aggiorniamo le recensioni, salva il conteggio iniziale
          if (typeof restaurant.initialReviewCount === 'undefined') {
            const placeDetails = await this.getPlaceDetails(restaurant.googlePlaceId);
            restaurant.initialReviewCount = placeDetails.user_ratings_total || 0;
            await restaurant.save();
            console.log(`Set initial review count for ${restaurant.name}: ${restaurant.initialReviewCount}`);
            continue;
          }

          // Ottieni i nuovi dati da Google Places
          const placeDetails = await this.getPlaceDetails(restaurant.googlePlaceId);
          
          // Aggiorna i dati del ristorante
          restaurant.googleRating = {
            rating: placeDetails.rating || 0,
            reviewCount: placeDetails.user_ratings_total || 0,
            lastUpdated: new Date()
          };

          // Aggiorna le recensioni se disponibili
          if (placeDetails.reviews) {
            restaurant.reviews = placeDetails.reviews.map(review => ({
              authorName: review.author_name,
              rating: review.rating,
              text: review.text,
              time: new Date(review.time * 1000)
            }));
          }

          await restaurant.save();
          console.log(`Updated reviews for ${restaurant.name}`);

          // Attendi un po' per non superare i limiti di rate dell'API
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error updating reviews for restaurant ${restaurant.name}:`, error);
          continue;
        }
      }

      console.log('Finished updating all restaurants reviews');
    } catch (error) {
      console.error('Error in updateAllRestaurantsReviews:', error);
      throw error;
    }
  }
}

module.exports = new GooglePlacesService(); 