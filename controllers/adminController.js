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
    // Ottieni tutti gli utenti con i loro ristoranti
    const users = await User.find({})
      .select('name email createdAt')
      .lean();

    const userStats = [];

    for (const user of users) {
      // Trova il ristorante dell'utente
      const restaurant = await Restaurant.findOne({ user: user._id })
        .select('name')
        .lean();

      if (!restaurant) continue;

      // Ottieni o crea il tracking per questo utente
      let tracking = await MessageTracking.findOne({
        restaurant: restaurant._id,
        user: user._id,
        period: 'total'
      });

      if (!tracking) {
        // Se non esiste, calcoliamo le statistiche dai dati esistenti
        tracking = await calculateUserStats(user._id, restaurant._id);
      }

      userStats.push({
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
      });
    }

    // Ordina per costo totale decrescente
    userStats.sort((a, b) => b.totalStats.totalCost - a.totalStats.totalCost);

    res.status(200).json({
      success: true,
      data: {
        users: userStats,
        summary: {
          totalUsers: userStats.length,
          totalCost: userStats.reduce((sum, user) => sum + user.totalStats.totalCost, 0),
          totalMessages: userStats.reduce((sum, user) => sum + user.totalStats.totalMessages, 0),
          totalConversations: userStats.reduce((sum, user) => sum + user.totalStats.totalConversations, 0)
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle statistiche utenti:', error);
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

    // Aggiorna le statistiche (usando prezzi service per semplicità)
    const serviceCost = 0.00; // Service conversations sono gratuite
    const messageCost = 0.005;

    tracking.messageStats.menuMessages = {
      conversations: menuInteractions,
      messages: menuInteractions,
      cost: menuInteractions * (serviceCost + messageCost)
    };

    tracking.messageStats.reviewMessages = {
      conversations: reviewInteractions,
      messages: reviewInteractions,
      cost: reviewInteractions * (serviceCost + messageCost)
    };

    tracking.messageStats.campaignMessages = {
      conversations: campaignMessages,
      messages: campaignMessages,
      cost: campaignMessages * (0.0691 + messageCost) // Marketing conversation
    };

    tracking.messageStats.inboundMessages = {
      conversations: inboundMessages,
      messages: inboundMessages,
      cost: inboundMessages * (serviceCost + messageCost)
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

module.exports = {
  adminLogin,
  getUsersStats,
  refreshAllStats,
  getUserDetails
}; 