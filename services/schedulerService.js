const cron = require('node-cron');
const { User, Restaurant, Analytics, WhatsAppCampaign } = require('../models');
const emailService = require('./emailService');
const campaignSuggestionService = require('./campaignSuggestionService');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Inizializza tutti i job schedulati
   */
  init() {
    if (this.isInitialized) {
      console.log('⚠️ Scheduler già inizializzato');
      return;
    }

    console.log('🚀 Inizializzazione Scheduler Service...');

    // Job giornaliero - ogni giorno alle 8:00
    this.scheduleDailyReports();
    
    // Job settimanale - ogni lunedì alle 9:00
    this.scheduleWeeklyReports();
    
    // Job suggerimenti AI - ogni mercoledì alle 10:00
    this.scheduleCampaignSuggestions();

    this.isInitialized = true;
    console.log('✅ Scheduler Service inizializzato con successo');
  }

  /**
   * Schedula i report giornalieri
   */
  scheduleDailyReports() {
    // Ogni giorno alle 8:00 (timezone server)
    const dailyJob = cron.schedule('0 8 * * *', async () => {
      console.log('📊 Avvio invio report giornalieri...');
      await this.sendDailyReports();
    }, {
      scheduled: false,
      timezone: 'Europe/Rome'
    });

    this.jobs.set('daily_reports', dailyJob);
    dailyJob.start();
    console.log('✅ Job report giornalieri schedulato (8:00 ogni giorno)');
  }

  /**
   * Schedula i report settimanali
   */
  scheduleWeeklyReports() {
    // Ogni lunedì alle 9:00
    const weeklyJob = cron.schedule('0 9 * * 1', async () => {
      console.log('📈 Avvio invio report settimanali...');
      await this.sendWeeklyReports();
    }, {
      scheduled: false,
      timezone: 'Europe/Rome'
    });

    this.jobs.set('weekly_reports', weeklyJob);
    weeklyJob.start();
    console.log('✅ Job report settimanali schedulato (9:00 ogni lunedì)');
  }

  /**
   * Schedula la generazione di suggerimenti campagne
   */
  scheduleCampaignSuggestions() {
    // Ogni mercoledì alle 10:00
    const suggestionsJob = cron.schedule('0 10 * * 3', async () => {
      console.log('💡 Avvio generazione suggerimenti campagne...');
      await this.generateCampaignSuggestions();
    }, {
      scheduled: false,
      timezone: 'Europe/Rome'
    });

    this.jobs.set('campaign_suggestions', suggestionsJob);
    suggestionsJob.start();
    console.log('✅ Job suggerimenti campagne schedulato (10:00 ogni mercoledì)');
  }

  /**
   * Invia tutti i report giornalieri
   */
  async sendDailyReports() {
    try {
      // Trova tutti gli utenti attivi con preferenze email abilitate
      const users = await User.find({
        isActive: true,
        'emailPreferences.dailyReports': true,
        restaurant: { $exists: true }
      }).populate('restaurant');

      console.log(`📊 Trovati ${users.length} utenti per report giornalieri`);

      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          if (!user.restaurant) {
            console.log(`⚠️ Utente ${user.email} senza ristorante associato`);
            continue;
          }

          // Calcola le metriche del giorno precedente
          const metrics = await this.calculateDailyMetrics(user.restaurant._id);
          
          // Invia il report
          const result = await emailService.sendDailyReport(user, user.restaurant, metrics);
          
          if (result.success) {
            successCount++;
            console.log(`✅ Report giornaliero inviato a ${user.email}`);
          } else {
            errorCount++;
            console.error(`❌ Errore invio report a ${user.email}:`, result.error);
          }

        } catch (error) {
          errorCount++;
          console.error(`❌ Errore elaborazione utente ${user.email}:`, error);
        }
      }

      console.log(`📊 Report giornalieri completati: ${successCount} successi, ${errorCount} errori`);

    } catch (error) {
      console.error('❌ Errore generale invio report giornalieri:', error);
    }
  }

  /**
   * Invia tutti i report settimanali
   */
  async sendWeeklyReports() {
    try {
      const users = await User.find({
        isActive: true,
        'emailPreferences.weeklyReports': true,
        restaurant: { $exists: true }
      }).populate('restaurant');

      console.log(`📈 Trovati ${users.length} utenti per report settimanali`);

      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          if (!user.restaurant) continue;

          // Calcola le metriche della settimana precedente
          const metrics = await this.calculateWeeklyMetrics(user.restaurant._id);
          
          // Invia il report
          const result = await emailService.sendWeeklyReport(user, user.restaurant, metrics);
          
          if (result.success) {
            successCount++;
            console.log(`✅ Report settimanale inviato a ${user.email}`);
          } else {
            errorCount++;
            console.error(`❌ Errore invio report a ${user.email}:`, result.error);
          }

        } catch (error) {
          errorCount++;
          console.error(`❌ Errore elaborazione utente ${user.email}:`, error);
        }
      }

      console.log(`📈 Report settimanali completati: ${successCount} successi, ${errorCount} errori`);

    } catch (error) {
      console.error('❌ Errore generale invio report settimanali:', error);
    }
  }

  /**
   * Genera e invia suggerimenti campagne per tutti gli utenti
   */
  async generateCampaignSuggestions() {
    try {
      const users = await User.find({
        isActive: true,
        'emailPreferences.campaignSuggestions': true,
        restaurant: { $exists: true },
        subscriptionTier: 'premium' // Solo utenti premium
      }).populate('restaurant');

      console.log(`💡 Trovati ${users.length} utenti premium per suggerimenti campagne`);

      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          if (!user.restaurant) continue;

          // Genera suggerimento AI
          const suggestion = await campaignSuggestionService.generateSuggestion(
            user.restaurant._id,
            user._id,
            user.languagePreference
          );

          if (suggestion) {
            // Invia email con il suggerimento
            const result = await emailService.sendCampaignSuggestion(
              user, 
              user.restaurant, 
              suggestion.suggestion
            );

            if (result.success) {
              // Aggiorna lo status del suggerimento
              await campaignSuggestionService.updateSuggestionStatus(
                suggestion._id, 
                'sent_via_email'
              );
              
              successCount++;
              console.log(`✅ Suggerimento campagna inviato a ${user.email}`);
            } else {
              errorCount++;
              console.error(`❌ Errore invio suggerimento a ${user.email}:`, result.error);
            }
          }

        } catch (error) {
          errorCount++;
          console.error(`❌ Errore elaborazione utente ${user.email}:`, error);
        }
      }

      console.log(`💡 Suggerimenti campagne completati: ${successCount} successi, ${errorCount} errori`);

    } catch (error) {
      console.error('❌ Errore generale generazione suggerimenti:', error);
    }
  }

  /**
   * Calcola le metriche giornaliere per un ristorante
   */
  async calculateDailyMetrics(restaurantId) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Trova le analytics del giorno precedente
      const analytics = await Analytics.findOne({
        restaurant: restaurantId,
        date: {
          $gte: yesterday,
          $lt: today
        }
      });

      // Conta le campagne WhatsApp del giorno precedente
      const campaignsCount = await WhatsAppCampaign.countDocuments({
        restaurant: restaurantId,
        createdAt: {
          $gte: yesterday,
          $lt: today
        }
      });

      return {
        menusSent: analytics?.menusSent || 0,
        reviewRequests: analytics?.reviewRequests || 0,
        reviewsCollected: analytics?.reviewsCollected || 0,
        newReviews: analytics?.newReviews || 0,
        campaignsSent: campaignsCount
      };

    } catch (error) {
      console.error(`❌ Errore calcolo metriche giornaliere per ristorante ${restaurantId}:`, error);
      return {
        menusSent: 0,
        reviewRequests: 0,
        reviewsCollected: 0,
        newReviews: 0,
        campaignsSent: 0
      };
    }
  }

  /**
   * Calcola le metriche settimanali per un ristorante
   */
  async calculateWeeklyMetrics(restaurantId) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    twoWeeksAgo.setHours(0, 0, 0, 0);

    const now = new Date();

    try {
      // Metriche settimana corrente
      const currentWeekAnalytics = await Analytics.aggregate([
        {
          $match: {
            restaurant: restaurantId,
            date: { $gte: oneWeekAgo, $lt: now }
          }
        },
        {
          $group: {
            _id: null,
            menusSent: { $sum: '$menusSent' },
            reviewRequests: { $sum: '$reviewRequests' },
            reviewsCollected: { $sum: '$reviewsCollected' },
            newReviews: { $sum: '$newReviews' }
          }
        }
      ]);

      // Metriche settimana precedente per calcolare la crescita
      const previousWeekAnalytics = await Analytics.aggregate([
        {
          $match: {
            restaurant: restaurantId,
            date: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
          }
        },
        {
          $group: {
            _id: null,
            menusSent: { $sum: '$menusSent' },
            reviewRequests: { $sum: '$reviewRequests' },
            reviewsCollected: { $sum: '$reviewsCollected' },
            newReviews: { $sum: '$newReviews' }
          }
        }
      ]);

      const current = currentWeekAnalytics[0] || { menusSent: 0, reviewRequests: 0, reviewsCollected: 0, newReviews: 0 };
      const previous = previousWeekAnalytics[0] || { menusSent: 0, reviewRequests: 0, reviewsCollected: 0, newReviews: 0 };

      // Calcola le percentuali di crescita
      const calculateGrowth = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      return {
        menusSent: current.menusSent,
        reviewRequests: current.reviewRequests,
        reviewsCollected: current.reviewsCollected,
        newReviews: current.newReviews,
        menusGrowth: calculateGrowth(current.menusSent, previous.menusSent),
        requestsGrowth: calculateGrowth(current.reviewRequests, previous.reviewRequests),
        reviewsGrowth: calculateGrowth(current.reviewsCollected, previous.reviewsCollected)
      };

    } catch (error) {
      console.error(`❌ Errore calcolo metriche settimanali per ristorante ${restaurantId}:`, error);
      return {
        menusSent: 0,
        reviewRequests: 0,
        reviewsCollected: 0,
        newReviews: 0,
        menusGrowth: 0,
        requestsGrowth: 0,
        reviewsGrowth: 0
      };
    }
  }

  /**
   * Ferma tutti i job
   */
  stopAll() {
    console.log('🛑 Fermando tutti i job schedulati...');
    
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`✅ Job ${name} fermato`);
    }
    
    this.jobs.clear();
    this.isInitialized = false;
    console.log('✅ Tutti i job fermati');
  }

  /**
   * Riavvia tutti i job
   */
  restart() {
    this.stopAll();
    this.init();
  }

  /**
   * Ottieni lo status di tutti i job
   */
  getStatus() {
    const status = {};
    
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    }
    
    return {
      initialized: this.isInitialized,
      totalJobs: this.jobs.size,
      jobs: status
    };
  }

  /**
   * Esegui manualmente un tipo di job (per testing)
   */
  async runManually(jobType) {
    console.log(`🔧 Esecuzione manuale job: ${jobType}`);
    
    switch (jobType) {
      case 'daily':
        await this.sendDailyReports();
        break;
      case 'weekly':
        await this.sendWeeklyReports();
        break;
      case 'suggestions':
        await this.generateCampaignSuggestions();
        break;
      default:
        throw new Error(`Tipo di job non riconosciuto: ${jobType}`);
    }
  }
}

module.exports = new SchedulerService(); 