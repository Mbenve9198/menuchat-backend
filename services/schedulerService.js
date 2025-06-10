const cron = require('node-cron');
const { User, Restaurant, Analytics } = require('../models');
const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const ScheduledMessage = require('../models/ScheduledMessage');
const emailService = require('./emailService');
const campaignSuggestionService = require('./campaignSuggestionService');
const CustomerInteraction = require('../models/CustomerInteraction');
const DailyReviewSnapshot = require('../models/DailyReviewSnapshot');
const googlePlacesService = require('./googlePlacesService');
const twilioService = require('./twilioService');

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

    // Job per messaggi programmati - ogni minuto
    this.scheduleMessageProcessor();
    
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
   * Schedula il processore dei messaggi programmati
   */
  scheduleMessageProcessor() {
    // Ogni minuto controlla i messaggi da inviare
    const messageJob = cron.schedule('* * * * *', async () => {
      await this.processScheduledMessages();
    }, {
      scheduled: false,
      timezone: 'Europe/Rome'
    });

    this.jobs.set('scheduled_messages', messageJob);
    messageJob.start();
    console.log('✅ Job messaggi programmati schedulato (ogni minuto)');
  }

  /**
   * Processa i messaggi programmati pronti per l'invio
   */
  async processScheduledMessages() {
    try {
      // Trova tutti i messaggi pronti per l'invio
      const messagesToSend = await ScheduledMessage.findMessagesToSend();
      
      if (messagesToSend.length === 0) {
        return; // Nessun messaggio da inviare
      }

      console.log(`📤 Trovati ${messagesToSend.length} messaggi programmati da inviare`);

      for (const message of messagesToSend) {
        try {
          // Verifica che il messaggio non sia già stato processato
          if (message.status !== 'pending') {
            continue;
          }

          console.log(`📤 Invio messaggio programmato: ${message.messageType} a ${message.phoneNumber}`);

          // Ottieni il template completo dal templateId
          const WhatsAppTemplate = require('../models/WhatsAppTemplate');
          const template = await WhatsAppTemplate.findOne({ 
            twilioTemplateId: message.templateId 
          });

          if (!template) {
            console.error(`❌ Template non trovato per ID: ${message.templateId}`);
            await message.markAsFailed(`Template non trovato: ${message.templateId}`);
            continue;
          }

          // Invia il messaggio tramite il nuovo metodo (senza scheduling, dato che è già schedulato localmente)
          const result = await twilioService.sendMessageFromTemplate(
            message.phoneNumber,
            template,
            message.templateVariables,
            message.restaurant._id
          );

          if (result.success) {
            // Marca come inviato
            await message.markAsSent(result.messageId);
            console.log(`✅ Messaggio inviato con successo: ${result.messageId}`);

            // Aggiorna l'interazione del cliente se presente
            if (message.customerInteraction) {
              await CustomerInteraction.findByIdAndUpdate(
                message.customerInteraction,
                {
                  lastMessageSent: `Messaggio inviato: ${message.messageType}`,
                  lastTemplateId: message.templateId
                }
              );
            }
          } else {
            // Marca come fallito
            await message.markAsFailed(result.error);
            console.error(`❌ Errore invio messaggio: ${result.error}`);

            // Se ha raggiunto il massimo numero di tentativi, non ritentare
            if (message.retryCount >= message.maxRetries) {
              console.error(`❌ Messaggio ${message._id} ha raggiunto il massimo numero di tentativi`);
            }
          }

        } catch (error) {
          console.error(`❌ Errore processamento messaggio ${message._id}:`, error);
          
          // Marca come fallito
          try {
            await message.markAsFailed(error.message);
          } catch (updateError) {
            console.error(`❌ Errore aggiornamento stato messaggio:`, updateError);
          }
        }
      }

    } catch (error) {
      console.error('❌ Errore generale processamento messaggi programmati:', error);
    }
  }

  /**
   * Schedula i report giornalieri
   */
  scheduleDailyReports() {
    // Ogni giorno alle 8:00 - Prima aggiorna gli snapshot, poi invia i report
    const dailyJob = cron.schedule('0 8 * * *', async () => {
      console.log('📊 Avvio aggiornamento snapshot e invio report giornalieri...');
      await this.sendDailyReports();
    }, {
      scheduled: false,
      timezone: 'Europe/Rome'
    });

    this.jobs.set('daily_reports', dailyJob);
    dailyJob.start();
    console.log('✅ Job report giornalieri schedulato (8:00 ogni giorno - include aggiornamento snapshot)');
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
      console.log('📊 Avvio processo report giornalieri...');
      
      // STEP 1: Prima aggiorniamo tutti gli snapshot delle recensioni
      console.log('🔄 Aggiornamento snapshot recensioni da Google Places...');
      try {
        await googlePlacesService.updateAllRestaurantsReviews();
        console.log('✅ Snapshot recensioni aggiornati con successo');
      } catch (error) {
        console.error('❌ Errore aggiornamento snapshot recensioni:', error);
        // Continuiamo comunque con l'invio dei report anche se il sync fallisce
      }

      // STEP 2: Trova tutti gli utenti attivi con preferenze email abilitate
      const users = await User.find({
        isActive: true,
        'emailPreferences.dailyReports': true,
        restaurant: { $exists: true }
      }).populate('restaurant');

      console.log(`📊 Trovati ${users.length} utenti per report giornalieri`);

      let successCount = 0;
      let errorCount = 0;

      // STEP 3: Invia i report con dati freschissimi
      for (const user of users) {
        try {
          if (!user.restaurant) {
            console.log(`⚠️ Utente ${user.email} senza ristorante associato`);
            continue;
          }

          // Calcola le metriche del giorno precedente (ora con snapshot aggiornati)
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
      // 1. MENU INVIATI: Conta le interazioni menu del giorno precedente
      const menuInteractions = await CustomerInteraction.countDocuments({
        restaurant: restaurantId,
        interactionType: 'menu_viewed',
        createdAt: {
          $gte: yesterday,
          $lt: today
        }
      });

      // 2. RICHIESTE RECENSIONI: Conta le richieste del giorno precedente
      const reviewRequests = await CustomerInteraction.countDocuments({
        restaurant: restaurantId,
        'reviewData.requested': true,
        'reviewData.requestedAt': {
          $gte: yesterday,
          $lt: today
        }
      });

      // 3. RECENSIONI RACCOLTE: Usa il nuovo sistema di snapshot
      const reviewsCollected = await googlePlacesService.getReviewsCollectedInPeriod(
        restaurantId, 
        yesterday, 
        yesterday // Solo il giorno precedente
      );

      // 4. CAMPAGNE INVIATE: Conta le campagne del giorno precedente
      const campaignsCount = await WhatsAppCampaign.countDocuments({
        restaurant: restaurantId,
        createdAt: {
          $gte: yesterday,
          $lt: today
        }
      });

      console.log(`📊 Metriche giornaliere per ristorante ${restaurantId}:`);
      console.log(`   - Menu inviati: ${menuInteractions}`);
      console.log(`   - Richieste recensioni: ${reviewRequests}`);
      console.log(`   - Recensioni raccolte: ${reviewsCollected}`);
      console.log(`   - Campagne inviate: ${campaignsCount}`);

      return {
        menusSent: menuInteractions,
        reviewRequests: reviewRequests,
        reviewsCollected: reviewsCollected,
        newReviews: reviewsCollected, // Alias per compatibilità
        campaignsSent: campaignsCount,
        date: yesterday
      };

    } catch (error) {
      console.error(`❌ Errore calcolo metriche giornaliere per ristorante ${restaurantId}:`, error);
      return {
        menusSent: 0,
        reviewRequests: 0,
        reviewsCollected: 0,
        newReviews: 0,
        campaignsSent: 0,
        date: yesterday
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