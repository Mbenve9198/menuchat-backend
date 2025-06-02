const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const emailService = require('../services/emailService');
const campaignSuggestionService = require('../services/campaignSuggestionService');
const { User, Restaurant, WhatsAppCampaign, Analytics } = require('../models');

/**
 * POST /api/email-test/daily-report
 * Testa l'invio di un report giornaliero
 */
router.post('/daily-report', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('restaurants');
    
    if (!user || !user.restaurants || user.restaurants.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Utente non ha ristoranti associati'
      });
    }

    const restaurant = user.restaurants[0]; // Usa il primo ristorante per il test

    // Genera dati di test per il report giornaliero
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const testData = {
      date: yesterday,
      menusSent: Math.floor(Math.random() * 50) + 10,
      reviewRequests: Math.floor(Math.random() * 20) + 5,
      newReviews: Math.floor(Math.random() * 10) + 1,
      averageRating: (Math.random() * 2 + 3).toFixed(1), // Rating tra 3.0 e 5.0
      totalCustomers: Math.floor(Math.random() * 100) + 20
    };

    // Invia email di test
    const result = await emailService.sendDailyReport(user, restaurant, testData);

    res.json({
      success: true,
      message: 'Email di test inviata con successo',
      data: {
        emailId: result.emailId,
        testData: testData
      }
    });

  } catch (error) {
    console.error('Errore invio email test giornaliera:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'invio dell\'email di test'
    });
  }
});

/**
 * POST /api/email-test/weekly-report
 * Testa l'invio di un report settimanale
 */
router.post('/weekly-report', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('restaurants');
    
    if (!user || !user.restaurants || user.restaurants.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Utente non ha ristoranti associati'
      });
    }

    const restaurant = user.restaurants[0];

    // Genera dati di test per il report settimanale
    const testData = {
      weekStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      weekEnd: new Date(),
      totalMenusSent: Math.floor(Math.random() * 300) + 100,
      totalReviewRequests: Math.floor(Math.random() * 100) + 30,
      totalNewReviews: Math.floor(Math.random() * 50) + 10,
      averageRating: (Math.random() * 2 + 3).toFixed(1),
      totalCustomers: Math.floor(Math.random() * 500) + 150,
      bestDay: ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'][Math.floor(Math.random() * 7)],
      growthPercentage: (Math.random() * 30 - 10).toFixed(1) // Crescita tra -10% e +20%
    };

    const result = await emailService.sendWeeklyReport(user, restaurant, testData);

    res.json({
      success: true,
      message: 'Email settimanale di test inviata con successo',
      data: {
        emailId: result.emailId,
        testData: testData
      }
    });

  } catch (error) {
    console.error('Errore invio email test settimanale:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'invio dell\'email di test'
    });
  }
});

/**
 * POST /api/email-test/campaign-suggestion
 * Testa l'invio di suggerimenti campagne AI
 */
router.post('/campaign-suggestion', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('restaurants');
    
    if (!user || !user.restaurants || user.restaurants.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Utente non ha ristoranti associati'
      });
    }

    const restaurant = user.restaurants[0];

    // Genera un suggerimento AI di test
    const suggestion = await campaignSuggestionService.generateSuggestion(restaurant._id, user.languagePreference || 'italiano');

    if (!suggestion) {
      return res.status(500).json({
        success: false,
        error: 'Errore nella generazione del suggerimento AI'
      });
    }

    const result = await emailService.sendCampaignSuggestion(user, restaurant, suggestion);

    res.json({
      success: true,
      message: 'Email suggerimento campagna inviata con successo',
      data: {
        emailId: result.emailId,
        suggestion: {
          title: suggestion.title,
          description: suggestion.description,
          campaignType: suggestion.campaignType
        }
      }
    });

  } catch (error) {
    console.error('Errore invio email test suggerimento:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'invio dell\'email di test'
    });
  }
});

/**
 * GET /api/email-test/preview/:type
 * Anteprima HTML dell'email senza inviarla
 */
router.get('/preview/:type', protect, async (req, res) => {
  try {
    const { type } = req.params;
    const user = await User.findById(req.user.id).populate('restaurants');
    
    if (!user || !user.restaurants || user.restaurants.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Utente non ha ristoranti associati'
      });
    }

    const restaurant = user.restaurants[0];
    let html = '';

    switch (type) {
      case 'daily':
        const dailyData = {
          date: new Date(),
          menusSent: 25,
          reviewRequests: 8,
          newReviews: 3,
          averageRating: '4.2',
          totalCustomers: 45
        };
        html = emailService.generateDailyReportHTML(user, restaurant, dailyData);
        break;

      case 'weekly':
        const weeklyData = {
          weekStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          weekEnd: new Date(),
          totalMenusSent: 180,
          totalReviewRequests: 55,
          totalNewReviews: 22,
          averageRating: '4.3',
          totalCustomers: 320,
          bestDay: 'Sabato',
          growthPercentage: '+12.5'
        };
        html = emailService.generateWeeklyReportHTML(user, restaurant, weeklyData);
        break;

      case 'suggestion':
        const suggestionData = {
          title: 'Campagna Aperitivo Serale',
          description: 'Promuovi i tuoi aperitivi con un messaggio accattivante per attirare clienti nelle ore serali',
          campaignType: 'promotional',
          targetAudience: 'Clienti che ordinano di sera',
          instructions: [
            'Crea un messaggio che evidenzi la varietà dei tuoi aperitivi',
            'Includi foto appetitose dei tuoi drink signature',
            'Aggiungi un\'offerta speciale per il primo drink',
            'Invia il messaggio tra le 17:00 e le 19:00'
          ]
        };
        html = emailService.generateCampaignSuggestionHTML(user, restaurant, suggestionData);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Tipo di email non valido. Usa: daily, weekly, suggestion'
        });
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Errore generazione anteprima:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella generazione dell\'anteprima'
    });
  }
});

/**
 * GET /api/email-test/status
 * Controlla lo status delle email inviate
 */
router.get('/status', protect, async (req, res) => {
  try {
    const { EmailReport } = require('../models');
    
    const recentEmails = await EmailReport.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('type status createdAt resendId language');

    res.json({
      success: true,
      data: recentEmails
    });

  } catch (error) {
    console.error('Errore recupero status email:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dello status'
    });
  }
});

module.exports = router; 