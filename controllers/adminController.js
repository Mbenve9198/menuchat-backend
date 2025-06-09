const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MessageTracking = require('../models/MessageTracking');
const CustomerInteraction = require('../models/CustomerInteraction');
const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Credenziali admin hardcoded
const ADMIN_EMAIL = 'admin@menuchat.com';
const ADMIN_PASSWORD = 'Itpennywise9194!';

/**
 * @desc    Login admin
 * @route   POST /api/admin/login
 * @access  Public
 */
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verifica credenziali
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide'
      });
    }

    // Genera token JWT
    const token = jwt.sign(
      { 
        isAdmin: true,
        email: ADMIN_EMAIL
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      token,
      message: 'Login admin effettuato con successo'
    });
  } catch (error) {
    console.error('Errore nel login admin:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

/**
 * @desc    Ottiene statistiche di tutti gli utenti
 * @route   GET /api/admin/users-stats
 * @access  Private (Admin only)
 */
const getUsersStats = async (req, res) => {
  try {
    console.log('🔍 Inizio recupero statistiche utenti...');
    
    // Ottieni tutti gli utenti con i loro ristoranti
    const users = await User.find({})
      .select('name email createdAt')
      .lean();

    console.log(`📊 Trovati ${users.length} utenti nel database`);

    const userStats = [];

    for (const user of users) {
      console.log(`👤 Elaborando utente: ${user.name} (${user.email})`);
      
      // Trova il ristorante dell'utente
      const restaurant = await Restaurant.findOne({ user: user._id })
        .select('name')
        .lean();

      if (!restaurant) {
        console.log(`⚠️  Nessun ristorante trovato per l'utente ${user.name}`);
        continue;
      }

      console.log(`🏪 Ristorante trovato: ${restaurant.name}`);

      // Ottieni o crea il tracking per questo utente
      let tracking = await MessageTracking.findOne({
        restaurant: restaurant._id,
        user: user._id,
        period: 'total'
      });

      if (!tracking) {
        console.log(`📈 Calcolando statistiche per ${user.name}...`);
        // Se non esiste, calcoliamo le statistiche dai dati esistenti
        tracking = await calculateUserStats(user._id, restaurant._id);
      }

      const userStat = {
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        restaurantName: restaurant.name,
        restaurantId: restaurant._id,
        createdAt: user.createdAt,
        messageStats: tracking ? tracking.messageStats : {
          menuMessages: { conversations: 0, messages: 0, cost: 0 },
          reviewMessages: { conversations: 0, messages: 0, cost: 0 },
          campaignMessages: { conversations: 0, messages: 0, cost: 0 },
          inboundMessages: { conversations: 0, messages: 0, cost: 0 }
        },
        totalStats: tracking ? tracking.totalStats : {
          totalConversations: 0,
          totalMessages: 0,
          totalCost: 0
        }
      };

      console.log(`💰 Statistiche per ${user.name}:`, {
        totalMessages: userStat.totalStats.totalMessages,
        totalCost: userStat.totalStats.totalCost
      });

      userStats.push(userStat);
    }

    // Ordina per costo totale decrescente
    userStats.sort((a, b) => b.totalStats.totalCost - a.totalStats.totalCost);

    const summary = {
      totalUsers: userStats.length,
      totalCost: userStats.reduce((sum, user) => sum + user.totalStats.totalCost, 0),
      totalMessages: userStats.reduce((sum, user) => sum + user.totalStats.totalMessages, 0),
      totalConversations: userStats.reduce((sum, user) => sum + user.totalStats.totalConversations, 0)
    };

    console.log('📋 Riepilogo finale:', summary);

    res.status(200).json({
      success: true,
      data: {
        users: userStats,
        summary: summary
      }
    });
  } catch (error) {
    console.error('❌ Errore nel recupero delle statistiche utenti:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero delle statistiche',
      error: error.message
    });
  }
};

/**
 * @desc    Calcola le statistiche per un utente dai dati esistenti
 */
const calculateUserStats = async (userId, restaurantId) => {
  try {
    // Conta le interazioni dei clienti (messaggi di menu/benvenuto)
    const menuInteractions = await CustomerInteraction.countDocuments({
      restaurant: restaurantId,
      lastMessageSent: { $exists: true, $ne: null }
    });

    // Conta le recensioni inviate
    const reviewInteractions = await CustomerInteraction.countDocuments({
      restaurant: restaurantId,
      'reviewData.requested': true
    });

    // Conta le campagne inviate
    const campaigns = await WhatsAppCampaign.find({
      restaurant: restaurantId,
      status: 'completed'
    }).lean();

    let campaignMessages = 0;
    campaigns.forEach(campaign => {
      if (campaign.stats && campaign.stats.sent) {
        campaignMessages += campaign.stats.sent;
      }
    });

    // Conta i messaggi inbound (trigger ricevuti)
    const inboundMessages = await CustomerInteraction.countDocuments({
      restaurant: restaurantId,
      lastMessageReceived: { $exists: true, $ne: null }
    });

    // Crea o aggiorna il tracking
    let tracking = await MessageTracking.findOne({
      restaurant: restaurantId,
      user: userId,
      period: 'total'
    });

    if (!tracking) {
      tracking = new MessageTracking({
        restaurant: restaurantId,
        user: userId,
        period: 'total'
      });
    }

    // Calcola i costi usando i tipi di conversazione corretti
    const conversationPrices = {
      utility: 0.03,
      authentication: 0.0378,
      marketing: 0.0691,
      service: 0.00
    };
    const messageCost = 0.005;

    // Menu messages: ora sono marketing (template MEDIA/CALL_TO_ACTION)
    const menuConversationType = MessageTracking.getConversationTypeFromTemplate(null, 'menuMessages');
    tracking.messageStats.menuMessages = {
      conversations: menuInteractions,
      messages: menuInteractions,
      cost: menuInteractions * (conversationPrices[menuConversationType] + messageCost)
    };

    // Review messages: ora sono utility (template REVIEW)
    const reviewConversationType = MessageTracking.getConversationTypeFromTemplate('REVIEW', 'reviewMessages');
    tracking.messageStats.reviewMessages = {
      conversations: reviewInteractions,
      messages: reviewInteractions,
      cost: reviewInteractions * (conversationPrices[reviewConversationType] + messageCost)
    };

    // Campaign messages: sempre marketing
    const campaignConversationType = MessageTracking.getConversationTypeFromTemplate(null, 'campaignMessages');
    tracking.messageStats.campaignMessages = {
      conversations: campaignMessages,
      messages: campaignMessages,
      cost: campaignMessages * (conversationPrices[campaignConversationType] + messageCost)
    };

    // Inbound messages: sempre service
    const inboundConversationType = MessageTracking.getConversationTypeFromTemplate(null, 'inboundMessages');
    tracking.messageStats.inboundMessages = {
      conversations: inboundMessages,
      messages: inboundMessages,
      cost: inboundMessages * (conversationPrices[inboundConversationType] + messageCost)
    };

    // Calcola totali
    tracking.totalStats.totalConversations = menuInteractions + reviewInteractions + campaignMessages + inboundMessages;
    tracking.totalStats.totalMessages = tracking.totalStats.totalConversations;
    tracking.totalStats.totalCost = 
      tracking.messageStats.menuMessages.cost +
      tracking.messageStats.reviewMessages.cost +
      tracking.messageStats.campaignMessages.cost +
      tracking.messageStats.inboundMessages.cost;

    await tracking.save();
    return tracking;
  } catch (error) {
    console.error('Errore nel calcolo delle statistiche utente:', error);
    return null;
  }
};

/**
 * @desc    Aggiorna le statistiche per tutti gli utenti
 * @route   POST /api/admin/refresh-stats
 * @access  Private (Admin only)
 */
const refreshAllStats = async (req, res) => {
  try {
    const users = await User.find({}).lean();
    let updatedCount = 0;

    for (const user of users) {
      const restaurant = await Restaurant.findOne({ user: user._id }).lean();
      if (restaurant) {
        await calculateUserStats(user._id, restaurant._id);
        updatedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Statistiche aggiornate per ${updatedCount} utenti`
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento delle statistiche:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'aggiornamento delle statistiche',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene dettagli di un singolo utente
 * @route   GET /api/admin/user/:userId
 * @access  Private (Admin only)
 */
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('name email createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    const restaurant = await Restaurant.findOne({ user: userId })
      .select('name description createdAt')
      .lean();

    const tracking = await MessageTracking.findOne({
      user: userId,
      period: 'total'
    });

    // Ottieni le ultime interazioni
    const recentInteractions = await CustomerInteraction.find({
      restaurant: restaurant._id
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('customerName lastMessageReceived lastMessageSent createdAt')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        user,
        restaurant,
        tracking,
        recentInteractions
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dettagli utente:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero dei dettagli utente',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene statistiche dettagliate sui template utilizzati
 * @route   GET /api/admin/template-stats
 * @access  Private (Admin only)
 */
const getTemplateStats = async (req, res) => {
  try {
    const WhatsAppTemplate = require('../models/WhatsAppTemplate');
    
    // Ottieni tutti i template attivi
    const templates = await WhatsAppTemplate.find({ isActive: true })
      .populate('restaurant', 'name user')
      .lean();

    const templateStats = [];

    for (const template of templates) {
      if (!template.restaurant) continue;

      // Conta l'utilizzo del template nelle interazioni
      let usageCount = 0;
      let estimatedCost = 0;

      // Conta utilizzi nei messaggi di menu/benvenuto
      if (template.type === 'MEDIA' || template.type === 'CALL_TO_ACTION') {
        usageCount += await CustomerInteraction.countDocuments({
          restaurant: template.restaurant._id,
          lastTemplateId: template.twilioTemplateId
        });
      }

      // Conta utilizzi nelle recensioni
      if (template.type === 'REVIEW') {
        usageCount += await CustomerInteraction.countDocuments({
          restaurant: template.restaurant._id,
          'reviewData.templateId': template.twilioTemplateId
        });
      }

      // Calcola il costo stimato
      const conversationType = MessageTracking.getConversationTypeFromTemplate(template.type);
      const conversationPrices = {
        utility: 0.03,
        authentication: 0.0378,
        marketing: 0.0691,
        service: 0.00
      };
      const messageCost = 0.005;
      estimatedCost = usageCount * (conversationPrices[conversationType] + messageCost);

      templateStats.push({
        templateId: template._id,
        templateName: template.name,
        templateType: template.type,
        conversationType,
        restaurantName: template.restaurant.name,
        userId: template.restaurant.user,
        language: template.language,
        status: template.status,
        usageCount,
        estimatedCost,
        costPerMessage: conversationPrices[conversationType] + messageCost
      });
    }

    // Ordina per utilizzo decrescente
    templateStats.sort((a, b) => b.usageCount - a.usageCount);

    res.status(200).json({
      success: true,
      data: {
        templates: templateStats,
        summary: {
          totalTemplates: templateStats.length,
          totalUsage: templateStats.reduce((sum, t) => sum + t.usageCount, 0),
          totalEstimatedCost: templateStats.reduce((sum, t) => sum + t.estimatedCost, 0),
          byType: {
            MEDIA: templateStats.filter(t => t.templateType === 'MEDIA').length,
            CALL_TO_ACTION: templateStats.filter(t => t.templateType === 'CALL_TO_ACTION').length,
            REVIEW: templateStats.filter(t => t.templateType === 'REVIEW').length
          },
          byConversationType: {
            utility: templateStats.filter(t => t.conversationType === 'utility').reduce((sum, t) => sum + t.estimatedCost, 0),
            service: templateStats.filter(t => t.conversationType === 'service').reduce((sum, t) => sum + t.estimatedCost, 0),
            marketing: templateStats.filter(t => t.conversationType === 'marketing').reduce((sum, t) => sum + t.estimatedCost, 0)
          }
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero statistiche template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero delle statistiche template',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene statistiche mensili per tutti gli utenti
 * @route   GET /api/admin/monthly-stats
 * @access  Private (Admin only)
 */
const getMonthlyStats = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    // Se non specificati, usa il mese corrente
    const currentDate = new Date();
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;

    const monthlyStats = await MessageTracking.getAllUsersMonthlyStats(targetYear, targetMonth);

    // Calcola il summary per il mese
    const summary = {
      year: targetYear,
      month: targetMonth,
      monthName: new Date(targetYear, targetMonth - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      totalUsers: monthlyStats.length,
      totalCost: monthlyStats.reduce((sum, user) => sum + user.totalStats.totalCost, 0),
      totalMessages: monthlyStats.reduce((sum, user) => sum + user.totalStats.totalMessages, 0),
      totalConversations: monthlyStats.reduce((sum, user) => sum + user.totalStats.totalConversations, 0)
    };

    res.status(200).json({
      success: true,
      data: {
        users: monthlyStats,
        summary
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle statistiche mensili:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero delle statistiche mensili',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene trend mensili per un periodo
 * @route   GET /api/admin/monthly-trends
 * @access  Private (Admin only)
 */
const getMonthlyTrends = async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const monthsCount = parseInt(months);
    
    const trends = [];
    const currentDate = new Date();
    
    for (let i = monthsCount - 1; i >= 0; i--) {
      const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;
      
      const monthlyStats = await MessageTracking.getAllUsersMonthlyStats(year, month);
      
      trends.push({
        year,
        month,
        monthName: targetDate.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }),
        totalUsers: monthlyStats.length,
        totalCost: monthlyStats.reduce((sum, user) => sum + user.totalStats.totalCost, 0),
        totalMessages: monthlyStats.reduce((sum, user) => sum + user.totalStats.totalMessages, 0),
        totalConversations: monthlyStats.reduce((sum, user) => sum + user.totalStats.totalConversations, 0),
        costBreakdown: {
          menu: monthlyStats.reduce((sum, user) => sum + user.messageStats.menuMessages.cost, 0),
          reviews: monthlyStats.reduce((sum, user) => sum + user.messageStats.reviewMessages.cost, 0),
          campaigns: monthlyStats.reduce((sum, user) => sum + user.messageStats.campaignMessages.cost, 0),
          inbound: monthlyStats.reduce((sum, user) => sum + user.messageStats.inboundMessages.cost, 0)
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        trends,
        summary: {
          totalMonths: trends.length,
          averageMonthlyCost: trends.reduce((sum, t) => sum + t.totalCost, 0) / trends.length,
          averageMonthlyMessages: trends.reduce((sum, t) => sum + t.totalMessages, 0) / trends.length,
          peakMonth: trends.reduce((max, current) => current.totalCost > max.totalCost ? current : max, trends[0] || {}),
          growth: trends.length > 1 ? {
            costGrowth: ((trends[trends.length - 1]?.totalCost || 0) - (trends[0]?.totalCost || 0)) / Math.max(trends[0]?.totalCost || 1, 1) * 100,
            messageGrowth: ((trends[trends.length - 1]?.totalMessages || 0) - (trends[0]?.totalMessages || 0)) / Math.max(trends[0]?.totalMessages || 1, 1) * 100
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei trend mensili:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero dei trend mensili',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene statistiche mensili per un singolo utente
 * @route   GET /api/admin/user/:userId/monthly-stats
 * @access  Private (Admin only)
 */
const getUserMonthlyStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { months = 12 } = req.query;
    
    const monthlyStats = await MessageTracking.getMonthlyStatsForUser(userId, parseInt(months));
    
    if (!monthlyStats.length) {
      return res.status(404).json({
        success: false,
        message: 'Nessuna statistica trovata per questo utente'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId,
        monthlyStats,
        summary: {
          totalMonths: monthlyStats.length,
          totalCost: monthlyStats.reduce((sum, m) => sum + m.totalStats.totalCost, 0),
          totalMessages: monthlyStats.reduce((sum, m) => sum + m.totalStats.totalMessages, 0),
          averageMonthlyCost: monthlyStats.reduce((sum, m) => sum + m.totalStats.totalCost, 0) / monthlyStats.length,
          peakMonth: monthlyStats.reduce((max, current) => current.totalStats.totalCost > max.totalStats.totalCost ? current : max, monthlyStats[0])
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle statistiche mensili utente:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero delle statistiche mensili utente',
      error: error.message
    });
  }
};

module.exports = {
  adminLogin,
  getUsersStats,
  refreshAllStats,
  getUserDetails,
  getTemplateStats,
  getMonthlyStats,
  getMonthlyTrends,
  getUserMonthlyStats
}; 