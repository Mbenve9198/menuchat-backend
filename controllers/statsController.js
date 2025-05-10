const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const CustomerInteraction = require('../models/CustomerInteraction');
const Restaurant = require('../models/Restaurant');

/**
 * Controller per gestire le statistiche e le attività della dashboard
 */
class StatsController {
  constructor() {
    // Binding dei metodi per mantenere il contesto
    this.getStats = this.getStats.bind(this);
    this.getActivities = this.getActivities.bind(this);
    this.getStartDate = this.getStartDate.bind(this);
  }

  /**
   * Calcola la data di inizio in base al periodo selezionato
   */
  getStartDate(period) {
    const now = new Date();
    switch (period) {
      case '7d':
        return new Date(now.setDate(now.getDate() - 7));
      case '1m':
        return new Date(now.setMonth(now.getMonth() - 1));
      case '1y':
        return new Date(now.setFullYear(now.getFullYear() - 1));
      case 'all':
      default:
        return new Date(0); // Unix epoch
    }
  }

  /**
   * Ottiene le statistiche per un ristorante
   */
  async getStats(req, res) {
    try {
      const { restaurantId, period = 'all' } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante mancante'
        });
      }

      const startDate = this.getStartDate(period);

      // Trova tutti i template del ristorante nel periodo selezionato
      const templates = await WhatsAppTemplate.find({
        restaurant: restaurantId,
        isActive: true,
        createdAt: { $gte: startDate }
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
      const totalReviewsCollected = Math.max(0, currentReviewCount - initialReviewCount);

      // Se il periodo non è "all", filtra le recensioni per il periodo selezionato
      let reviewsCollected = totalReviewsCollected;
      if (period !== 'all' && restaurant.reviews) {
        const recentReviews = restaurant.reviews.filter(review => 
          new Date(review.time) >= startDate
        );
        reviewsCollected = recentReviews.length;
      }

      // Calcola il progresso settimanale delle recensioni
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

      const weeklyReviews = restaurant.reviews?.filter(review => 
        new Date(review.time) >= startOfWeek
      ).length || 0;

      // Calcola le tendenze rispetto al periodo precedente
      const previousStartDate = new Date(startDate);
      const periodDuration = new Date() - startDate;
      previousStartDate.setTime(previousStartDate.getTime() - periodDuration);

      const previousTemplates = await WhatsAppTemplate.find({
        restaurant: restaurantId,
        isActive: true,
        createdAt: { $gte: previousStartDate, $lt: startDate }
      });

      const previousMenuTemplates = previousTemplates.filter(t => t.type === 'MEDIA' || t.type === 'CALL_TO_ACTION');
      const previousReviewTemplates = previousTemplates.filter(t => t.type === 'REVIEW');

      // Per le recensioni, confronta con il periodo precedente
      let previousReviewsCollected = 0;
      if (period !== 'all' && restaurant.reviews) {
        previousReviewsCollected = restaurant.reviews.filter(review => 
          new Date(review.time) >= previousStartDate && new Date(review.time) < startDate
        ).length;
      }

      // Calcola le variazioni percentuali
      const calculateTrend = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      return res.json({
        success: true,
        menusSent: menuTemplates.length,
        reviewRequests: reviewTemplates.length,
        reviewsCollected,
        totalReviewsCollected,
        weeklyGoalProgress: weeklyReviews,
        trends: {
          menusSent: calculateTrend(menuTemplates.length, previousMenuTemplates.length),
          reviewRequests: calculateTrend(reviewTemplates.length, previousReviewTemplates.length),
          reviewsCollected: calculateTrend(reviewsCollected, previousReviewsCollected)
        }
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      return res.status(500).json({
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
      const { restaurantId, period = 'all' } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante mancante'
        });
      }

      const startDate = this.getStartDate(period);

      // Trova le interazioni recenti nel periodo selezionato
      const interactions = await CustomerInteraction.find({
        restaurant: restaurantId,
        'events.timestamp': { $gte: startDate }
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