const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const CustomerInteraction = require('../models/CustomerInteraction');
const Restaurant = require('../models/Restaurant');
const mongoose = require('mongoose');

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
      case '7days':
        return new Date(now.setDate(now.getDate() - 7));
      case '30days':
        return new Date(now.setMonth(now.getMonth() - 1));
      case 'custom':
        // Per custom, dovremmo ricevere startDate e endDate come parametri
        return null; // Verrà gestito separatamente
      default:
        return new Date(0); // Unix epoch per "all"
    }
  }

  /**
   * Ottiene le statistiche per un ristorante
   */
  async getStats(req, res) {
    try {
      const { restaurantId, period = '7days', startDate: startDateStr, endDate: endDateStr } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante mancante'
        });
      }

      // Gestisci date personalizzate o utilizza la funzione standard
      let startDate, endDate;
      if (period === 'custom' && startDateStr && endDateStr) {
        startDate = new Date(startDateStr);
        endDate = new Date(endDateStr);
        // Assicurati che endDate includa l'intero giorno
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = this.getStartDate(period);
        endDate = new Date(); // Ora corrente
      }

      // Calcola l'inizio della settimana corrente (per il weekly goal)
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Domenica

      // Trova il ristorante
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      // Ottimizzazione: Usa aggregation pipeline per ridurre le query
      const statsAggregation = await CustomerInteraction.aggregate([
        {
          $match: {
            restaurant: new mongoose.Types.ObjectId(restaurantId)
          }
        },
        {
          $facet: {
            // Menu inviati nel periodo corrente
            currentMenus: [
              {
                $match: {
                  lastTemplateId: { $exists: true, $ne: null },
                  createdAt: { $gte: startDate, $lte: endDate }
                }
              },
              { $count: "count" }
            ],
            // Richieste recensioni nel periodo corrente
            currentReviews: [
              {
                $match: {
                  $or: [
                    { 'reviewData.requested': true },
                    { scheduledReviewMessageId: { $exists: true, $ne: null } }
                  ],
                  $and: [
                    { $or: [
                      { 'reviewData.requestedAt': { $gte: startDate, $lte: endDate } },
                      { reviewScheduledFor: { $gte: startDate, $lte: endDate } }
                    ]}
                  ]
                }
              },
              { $count: "count" }
            ],
            // Menu inviati nel periodo precedente
            previousMenus: [
              {
                $match: {
                  lastTemplateId: { $exists: true, $ne: null },
                  createdAt: { $gte: startDate.getTime() - (endDate.getTime() - startDate.getTime()), $lt: startDate.getTime() }
                }
              },
              { $count: "count" }
            ],
            // Richieste recensioni settimana corrente
            weeklyReviews: [
              {
                $match: {
                  $or: [
                    { 'reviewData.requested': true },
                    { scheduledReviewMessageId: { $exists: true, $ne: null } }
                  ],
                  $and: [
                    { $or: [
                      { 'reviewData.requestedAt': { $gte: startOfWeek, $lte: endDate } },
                      { reviewScheduledFor: { $gte: startOfWeek, $lte: endDate } }
                    ]}
                  ]
                }
              },
              { $count: "count" }
            ]
          }
        }
      ]);

      const stats = statsAggregation[0];
      const menuInteractions = stats.currentMenus[0]?.count || 0;
      const reviewRequests = stats.currentReviews[0]?.count || 0;
      const previousMenuInteractions = stats.previousMenus[0]?.count || 0;
      const lastWeekReviewRequests = stats.weeklyReviews[0]?.count || 0;

      // 3. RECENSIONI RACCOLTE: Calcola recensioni nel periodo selezionato
      const initialReviewCount = restaurant.googleRating?.initialReviewCount || 0;
      const currentReviewCount = restaurant.googleRating?.reviewCount || 0;
      const totalReviewsCollected = Math.max(0, currentReviewCount - initialReviewCount);

      // Filtra recensioni per il periodo selezionato se abbiamo i dati dettagliati
      let reviewsCollected = 0;
      if (restaurant.reviews && restaurant.reviews.length > 0) {
        reviewsCollected = restaurant.reviews.filter(review => 
          new Date(review.time) >= startDate && new Date(review.time) <= endDate
        ).length;
      } else {
        // Fallback se non abbiamo i dati dettagliati
        reviewsCollected = totalReviewsCollected;
      }

      // 4. OBIETTIVO SETTIMANALE: Sistema di gamification migliorato
      const weeklyGoal = Math.max(Math.ceil(lastWeekReviewRequests * 0.1), 1);

      // Recensioni effettivamente raccolte questa settimana
      const weeklyReviewsCollected = restaurant.reviews
        ? restaurant.reviews.filter(review => new Date(review.time) >= startOfWeek).length
        : 0;

      // Calcola la percentuale di progresso
      const weeklyGoalProgress = weeklyGoal > 0 
        ? Math.min(Math.round((weeklyReviewsCollected / weeklyGoal) * 100), 100) 
        : 0;

      // Sistema di livelli basato sul numero totale di recensioni raccolte
      const totalReviewsEver = Math.max(0, currentReviewCount - initialReviewCount);
      const level = Math.floor(totalReviewsEver / 10) + 1;
      const reviewsToNextLevel = (level * 10) - totalReviewsEver;
      
      // Calcola streak settimanali (settimane consecutive con obiettivo raggiunto)
      const weeklyStreak = await this.calculateWeeklyStreak(restaurantId, restaurant);
      
      // Aggiorna i dati di gamification nel ristorante
      await this.updateGamificationData(restaurant, {
        level,
        totalExperience: totalReviewsEver * 10, // 10 XP per recensione
        weeklyStreak,
        weeklyGoalProgress,
        weeklyGoal,
        weeklyReviewsCollected
      });

      // Sistema di badge/achievement
      const achievements = await this.calculateAchievements(restaurantId, {
        totalReviews: totalReviewsEver,
        weeklyStreak,
        level,
        weeklyGoalProgress
      });

      // Calcola i giorni rimanenti nella settimana
      const now = new Date();
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      const daysLeft = Math.ceil((endOfWeek - now) / (1000 * 60 * 60 * 24));

      // Calcola le tendenze rispetto al periodo precedente (per indicatori di crescita)
      const previousPeriodDuration = endDate.getTime() - startDate.getTime();
      const previousPeriodStart = new Date(startDate.getTime() - previousPeriodDuration);

      // Funzione per calcolare la variazione percentuale
      const calculateTrend = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      return res.json({
        success: true,
        menusSent: menuInteractions,
        reviewRequests: reviewRequests,
        reviewsCollected: reviewsCollected,
        totalReviewsCollected: totalReviewsCollected,
        initialReviewCount: initialReviewCount,
        currentReviewCount: currentReviewCount,
        weeklyGoal: {
          target: weeklyGoal,
          progress: weeklyGoalProgress,
          current: weeklyReviewsCollected,
          daysLeft: daysLeft
        },
        trends: {
          menusSent: calculateTrend(menuInteractions, previousMenuInteractions),
          reviewRequests: calculateTrend(reviewRequests, lastWeekReviewRequests),
          reviewsCollected: calculateTrend(reviewsCollected, totalReviewsCollected)
        },
        level: level,
        reviewsToNextLevel: reviewsToNextLevel,
        weeklyStreak: weeklyStreak,
        achievements
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
      const { restaurantId, period = '7days' } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante mancante'
        });
      }

      // Determina la data di inizio in base al periodo
      const startDate = this.getStartDate(period);

      // Trova le interazioni recenti nel periodo selezionato
      const interactions = await CustomerInteraction.find({
        restaurant: restaurantId,
        createdAt: { $gte: startDate }
      })
      .sort('-createdAt')
      .limit(10);

      // Trasforma le interazioni in attività
      const activities = interactions.map(interaction => {
        const customerName = interaction.customerName || 'Cliente';
        
        // Determina il tipo di attività
        let type, emoji, message, details, time;
        
        // Se è un invio menu
        if (interaction.lastTemplateId && !interaction.lastTemplateId.includes('review')) {
          type = 'menu_view';
          emoji = '📋';
          message = `Menu inviato a ${customerName}`;
          details = `Il cliente ha ricevuto il menu.`;
          time = interaction.createdAt;
        } 
        // Se è una recensione programmata
        else if (interaction.scheduledReviewMessageId) {
          type = 'review_request';
          emoji = '⭐';
          message = `Richiesta recensione a ${customerName}`;
          details = `Programmata per ${new Date(interaction.reviewScheduledFor).toLocaleString()}`;
          time = interaction.reviewScheduledFor;
        }
        // Se è una recensione già inviata
        else if (interaction.reviewData && interaction.reviewData.requested) {
          type = 'review_request';
          emoji = '⭐';
          message = `Richiesta recensione inviata a ${customerName}`;
          details = 'Richiesta di recensione inviata al cliente';
          time = interaction.reviewData.requestedAt;
        }
        // Altrimenti è una generica interazione
        else {
          type = 'interaction';
          emoji = '📝';
          message = `Interazione con ${customerName}`;
          details = 'Dettagli non disponibili';
          time = interaction.createdAt;
        }

        // Formatta il timestamp relativo
        const relativeTime = this.getRelativeTime(time);

        return {
          id: interaction._id,
          type,
          emoji,
          message,
          details,
          time: relativeTime,
          expanded: false,
          customerName
        };
      });

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

  /**
   * Formatta un timestamp in formato relativo
   */
  getRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHour = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHour / 24);

    if (diffSec < 60) {
      return 'just now';
    } else if (diffMin < 60) {
      return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    } else if (diffHour < 24) {
      return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    } else if (diffDay < 7) {
      return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    } else {
      // Formatta data come "MMM DD, YYYY"
      return time.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: time.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  async calculateAchievements(restaurantId, data) {
    const { totalReviews, weeklyStreak, level, weeklyGoalProgress } = data;
    const achievements = [];

    // Achievement per recensioni totali
    const reviewMilestones = [5, 10, 25, 50, 100, 250, 500];
    reviewMilestones.forEach(milestone => {
      if (totalReviews >= milestone) {
        achievements.push({
          id: `reviews_${milestone}`,
          name: `${milestone} Recensioni`,
          description: `Hai raccolto ${milestone} recensioni!`,
          category: 'reviews',
          icon: '⭐',
          rarity: milestone >= 100 ? 'legendary' : milestone >= 50 ? 'epic' : 'common'
        });
      }
    });

    // Achievement per streak
    if (weeklyStreak >= 3) {
      achievements.push({
        id: 'streak_3',
        name: 'Costanza',
        description: '3 settimane consecutive di obiettivi raggiunti',
        category: 'streak',
        icon: '🔥',
        rarity: 'rare'
      });
    }

    if (weeklyStreak >= 10) {
      achievements.push({
        id: 'streak_10',
        name: 'Inarrestabile',
        description: '10 settimane consecutive di obiettivi raggiunti',
        category: 'streak',
        icon: '🚀',
        rarity: 'legendary'
      });
    }

    // Achievement per livello
    if (level >= 5) {
      achievements.push({
        id: 'level_5',
        name: 'Esperto',
        description: 'Hai raggiunto il livello 5',
        category: 'level',
        icon: '🏆',
        rarity: 'epic'
      });
    }

    // Achievement per performance perfetta
    if (weeklyGoalProgress === 100) {
      achievements.push({
        id: 'perfect_week',
        name: 'Settimana Perfetta',
        description: 'Obiettivo settimanale completato al 100%',
        category: 'special',
        icon: '💎',
        rarity: 'rare'
      });
    }

    return achievements;
  }

  async calculateWeeklyStreak(restaurantId, restaurant) {
    try {
      // Calcola le settimane consecutive in cui l'obiettivo è stato raggiunto
      const gamification = restaurant.gamification || {};
      const weeklyGoalHistory = gamification.weeklyGoalHistory || [];
      
      // Ordina per data più recente
      const sortedHistory = weeklyGoalHistory
        .sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
      
      let streak = 0;
      for (const week of sortedHistory) {
        if (week.completed) {
          streak++;
        } else {
          break; // Interrompe al primo obiettivo non raggiunto
        }
      }
      
      return streak;
    } catch (error) {
      console.error('Error calculating weekly streak:', error);
      return 0;
    }
  }

  async updateGamificationData(restaurant, data) {
    try {
      const { level, totalExperience, weeklyStreak, weeklyGoalProgress, weeklyGoal, weeklyReviewsCollected } = data;
      
      // Inizializza gamification se non esiste
      if (!restaurant.gamification) {
        restaurant.gamification = {
          level: 1,
          totalExperience: 0,
          weeklyStreak: 0,
          longestStreak: 0,
          achievements: [],
          weeklyGoalHistory: []
        };
      }
      
      // Aggiorna i dati
      restaurant.gamification.level = level;
      restaurant.gamification.totalExperience = totalExperience;
      restaurant.gamification.weeklyStreak = weeklyStreak;
      
      // Aggiorna il record di streak più lungo
      if (weeklyStreak > restaurant.gamification.longestStreak) {
        restaurant.gamification.longestStreak = weeklyStreak;
      }
      
      // Calcola l'inizio della settimana corrente
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      
      // Verifica se esiste già un record per questa settimana
      const existingWeekIndex = restaurant.gamification.weeklyGoalHistory.findIndex(
        week => new Date(week.weekStart).getTime() === startOfWeek.getTime()
      );
      
      const weekData = {
        weekStart: startOfWeek,
        target: weeklyGoal,
        achieved: weeklyReviewsCollected,
        completed: weeklyGoalProgress >= 100
      };
      
      if (existingWeekIndex >= 0) {
        // Aggiorna il record esistente
        restaurant.gamification.weeklyGoalHistory[existingWeekIndex] = weekData;
      } else {
        // Aggiungi nuovo record
        restaurant.gamification.weeklyGoalHistory.push(weekData);
      }
      
      // Mantieni solo le ultime 12 settimane per performance
      if (restaurant.gamification.weeklyGoalHistory.length > 12) {
        restaurant.gamification.weeklyGoalHistory = restaurant.gamification.weeklyGoalHistory
          .sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart))
          .slice(0, 12);
      }
      
      // Aggiorna la data dell'ultimo obiettivo completato
      if (weeklyGoalProgress >= 100) {
        restaurant.gamification.lastWeeklyGoalCompleted = new Date();
      }
      
      // Salva le modifiche
      await restaurant.save();
      
    } catch (error) {
      console.error('Error updating gamification data:', error);
    }
  }
}

module.exports = new StatsController(); 