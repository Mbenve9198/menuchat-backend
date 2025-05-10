const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const CustomerInteraction = require('../models/CustomerInteraction');
const Restaurant = require('../models/Restaurant');

/**
 * Controller per gestire le statistiche e le attività della dashboard
 */
class StatsController {
  /**
   * Ottiene le statistiche per un ristorante
   */
  async getStats(req, res) {
    try {
      const { restaurantId } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante mancante'
        });
      }

      // Trova tutti i template del ristorante
      const templates = await WhatsAppTemplate.find({
        restaurant: restaurantId,
        isActive: true
      });

      // Calcola il numero di menu e review template inviati
      const menuTemplates = templates.filter(t => t.type === 'MEDIA' || t.type === 'CALL_TO_ACTION');
      const reviewTemplates = templates.filter(t => t.type === 'REVIEW');

      // Trova il ristorante per ottenere i dati delle recensioni
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      // Calcola le recensioni raccolte
      const initialReviewCount = restaurant.initialReviewCount || 0;
      const currentReviewCount = restaurant.googleRating?.reviewCount || 0;
      const reviewsCollected = Math.max(0, currentReviewCount - initialReviewCount);

      // Calcola il progresso settimanale delle recensioni
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

      const weeklyReviews = await CustomerInteraction.countDocuments({
        restaurant: restaurantId,
        'events.type': 'review_completed',
        'events.timestamp': { $gte: startOfWeek }
      });

      res.json({
        success: true,
        menusSent: menuTemplates.length,
        reviewRequests: reviewTemplates.length,
        reviewsCollected,
        weeklyGoalProgress: weeklyReviews
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: 'Errore nel recupero delle statistiche'
      });
    }
  }

  /**
   * Ottiene le attività recenti per un ristorante
   */
  async getActivities(req, res) {
    try {
      const { restaurantId } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante mancante'
        });
      }

      // Trova le interazioni recenti
      const interactions = await CustomerInteraction.find({
        restaurant: restaurantId
      })
      .sort('-lastActive')
      .limit(10);

      // Trasforma le interazioni in attività
      const activities = interactions.map(interaction => {
        // Prendi l'ultimo evento
        const lastEvent = interaction.events[interaction.events.length - 1];
        if (!lastEvent) return null;

        let activity = {
          _id: interaction._id,
          type: lastEvent.type,
          createdAt: lastEvent.timestamp,
          expanded: false
        };

        switch (lastEvent.type) {
          case 'menu_viewed':
            activity.emoji = '📋';
            activity.message = 'Menu visualizzato da un cliente';
            activity.details = `Il cliente ha visualizzato il menu per ${lastEvent.details?.duration || 0} secondi`;
            break;
          case 'review_requested':
            activity.emoji = '⭐';
            activity.message = 'Richiesta recensione inviata';
            activity.details = 'Richiesta di recensione inviata al cliente dopo l\'ordine';
            break;
          case 'review_completed':
            activity.emoji = '🏆';
            activity.message = 'Nuova recensione ricevuta!';
            activity.details = lastEvent.details?.reviewText || 'Recensione senza testo';
            break;
          case 'info_requested':
            activity.emoji = '✏️';
            activity.message = 'Informazioni richieste';
            activity.details = 'Un cliente ha richiesto informazioni';
            break;
          default:
            activity.emoji = '📝';
            activity.message = 'Nuova interazione';
            activity.details = 'Dettagli non disponibili';
        }

        return activity;
      }).filter(Boolean); // Rimuovi eventuali null

      res.json({
        success: true,
        activities
      });
    } catch (error) {
      console.error('Error getting activities:', error);
      res.status(500).json({
        success: false,
        error: 'Errore nel recupero delle attività'
      });
    }
  }
}

module.exports = new StatsController(); 