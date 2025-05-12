// backend/controllers/restaurantController.js
const Restaurant = require('../models/Restaurant');

/**
 * Controller per gestire le operazioni relative ai ristoranti
 */
class RestaurantController {
  constructor() {
    // Binding dei metodi per mantenere il contesto
    this.getRestaurantById = this.getRestaurantById.bind(this);
  }

  /**
   * Ottiene i dettagli di un ristorante specifico per ID
   * @route GET /api/restaurants/:id
   * @access Public
   */
  async getRestaurantById(req, res) {
    try {
      const { id } = req.params;
      
      console.log(`Richiesta dettagli ristorante ID: ${id}`);
      
      const restaurant = await Restaurant.findById(id);
      if (!restaurant) {
        console.log(`Ristorante non trovato con ID: ${id}`);
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }
      
      // Calcola giorni attivi
      const createdDate = restaurant.createdAt;
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - createdDate.getTime());
      const daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`Ristorante trovato: ${restaurant.name}, attivo da ${daysActive} giorni`);
      
      // Restituisci i dati del ristorante con i giorni attivi
      return res.json({
        success: true,
        restaurant: {
          ...restaurant.toObject(),
          daysActive
        }
      });
    } catch (error) {
      console.error('Errore nel recupero del ristorante:', error);
      return res.status(500).json({
        success: false,
        error: 'Errore nel recupero delle informazioni del ristorante'
      });
    }
  }
}

module.exports = new RestaurantController();