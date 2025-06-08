const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema per tracciare i messaggi inviati e i costi
const MessageTrackingSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Contatori per tipo di messaggio
  messageStats: {
    // Messaggi di menu/benvenuto
    menuMessages: {
      conversations: { type: Number, default: 0 },
      messages: { type: Number, default: 0 },
      cost: { type: Number, default: 0 }
    },
    // Messaggi di recensione
    reviewMessages: {
      conversations: { type: Number, default: 0 },
      messages: { type: Number, default: 0 },
      cost: { type: Number, default: 0 }
    },
    // Messaggi di campagne marketing
    campaignMessages: {
      conversations: { type: Number, default: 0 },
      messages: { type: Number, default: 0 },
      cost: { type: Number, default: 0 }
    },
    // Messaggi inbound ricevuti per trigger
    inboundMessages: {
      conversations: { type: Number, default: 0 },
      messages: { type: Number, default: 0 },
      cost: { type: Number, default: 0 }
    }
  },
  // Totali
  totalStats: {
    totalConversations: { type: Number, default: 0 },
    totalMessages: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 }
  },
  // Periodo di riferimento
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'total'],
    default: 'total'
  },
  periodStart: Date,
  periodEnd: Date,
  // Ultima volta che è stato aggiornato
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indici per performance
MessageTrackingSchema.index({ restaurant: 1, period: 1 });
MessageTrackingSchema.index({ user: 1, period: 1 });
MessageTrackingSchema.index({ lastUpdated: -1 });

// Metodo statico per mappare tipi di template a tipi di conversazione Twilio
MessageTrackingSchema.statics.getConversationTypeFromTemplate = function(templateType, messageType) {
  // Mappa i tipi di template ai tipi di conversazione Twilio
  const templateToConversationMap = {
    'MEDIA': 'utility',        // Template media (menu, benvenuto) -> utility
    'CALL_TO_ACTION': 'utility', // Template con bottoni -> utility  
    'REVIEW': 'service',       // Template recensioni -> service
    'MARKETING': 'marketing'   // Template campagne -> marketing
  };
  
  // Mappa i tipi di messaggio ai tipi di conversazione
  const messageToConversationMap = {
    'menuMessages': 'utility',
    'reviewMessages': 'service', 
    'campaignMessages': 'marketing',
    'inboundMessages': 'service'
  };
  
  // Se abbiamo il tipo di template, usalo
  if (templateType && templateToConversationMap[templateType]) {
    return templateToConversationMap[templateType];
  }
  
  // Altrimenti usa il tipo di messaggio
  if (messageType && messageToConversationMap[messageType]) {
    return messageToConversationMap[messageType];
  }
  
  // Default
  return 'service';
};

// Metodo per aggiornare le statistiche
MessageTrackingSchema.methods.addMessage = function(type, conversationType = null, templateType = null) {
  // Prezzi per tipo di conversazione Twilio
  const conversationPrices = {
    utility: 0.03,
    authentication: 0.0378,
    marketing: 0.0691,
    service: 0.00
  };
  
  const messageCost = 0.005; // Costo per messaggio
  
  if (!this.messageStats[type]) {
    console.error(`Tipo di messaggio non valido: ${type}`);
    return this;
  }
  
  // Determina il tipo di conversazione corretto
  let finalConversationType = conversationType;
  if (!finalConversationType) {
    finalConversationType = this.constructor.getConversationTypeFromTemplate(templateType, type);
  }
  
  console.log(`📊 Tracking messaggio: tipo=${type}, templateType=${templateType}, conversationType=${finalConversationType}`);
  
  // Incrementa contatori
  this.messageStats[type].messages += 1;
  this.messageStats[type].conversations += 1; // Assumiamo 1 conversazione per messaggio per semplicità
  
  // Calcola costo
  const conversationCost = conversationPrices[finalConversationType] || 0;
  this.messageStats[type].cost += conversationCost + messageCost;
  
  // Aggiorna totali
  this.totalStats.totalMessages += 1;
  this.totalStats.totalConversations += 1;
  this.totalStats.totalCost += conversationCost + messageCost;
  
  this.lastUpdated = new Date();
  
  return this;
};

// Metodo statico per ottenere o creare tracking per un ristorante
MessageTrackingSchema.statics.getOrCreateTracking = async function(restaurantId, userId, period = 'total') {
  let tracking = await this.findOne({
    restaurant: restaurantId,
    user: userId,
    period: period
  });
  
  if (!tracking) {
    tracking = new this({
      restaurant: restaurantId,
      user: userId,
      period: period,
      periodStart: period === 'total' ? null : new Date(),
      periodEnd: period === 'total' ? null : new Date()
    });
    await tracking.save();
  }
  
  return tracking;
};

// Metodo statico per ottenere tracking mensile
MessageTrackingSchema.statics.getOrCreateMonthlyTracking = async function(restaurantId, userId, year, month) {
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const startDate = new Date(year, month - 1, 1); // month è 0-indexed in Date
  const endDate = new Date(year, month, 0, 23, 59, 59, 999); // ultimo giorno del mese
  
  let tracking = await this.findOne({
    restaurant: restaurantId,
    user: userId,
    period: 'monthly',
    periodStart: {
      $gte: startDate,
      $lt: new Date(startDate.getTime() + 24 * 60 * 60 * 1000) // stesso giorno
    }
  });
  
  if (!tracking) {
    tracking = new this({
      restaurant: restaurantId,
      user: userId,
      period: 'monthly',
      periodStart: startDate,
      periodEnd: endDate
    });
    await tracking.save();
  }
  
  return tracking;
};

// Metodo statico per ottenere statistiche mensili per un utente
MessageTrackingSchema.statics.getMonthlyStatsForUser = async function(userId, months = 12) {
  const Restaurant = require('./Restaurant');
  
  // Trova il ristorante dell'utente
  const restaurant = await Restaurant.findOne({ user: userId });
  if (!restaurant) return [];
  
  const monthlyStats = [];
  const currentDate = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    
    const tracking = await this.getOrCreateMonthlyTracking(restaurant._id, userId, year, month);
    
    monthlyStats.push({
      year,
      month,
      monthName: targetDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      periodStart: tracking.periodStart,
      periodEnd: tracking.periodEnd,
      messageStats: tracking.messageStats,
      totalStats: tracking.totalStats
    });
  }
  
  return monthlyStats;
};

// Metodo statico per ottenere statistiche mensili per tutti gli utenti
MessageTrackingSchema.statics.getAllUsersMonthlyStats = async function(year, month) {
  const User = require('./User');
  const Restaurant = require('./Restaurant');
  
  const users = await User.find({}).select('name email').lean();
  const monthlyStats = [];
  
  for (const user of users) {
    const restaurant = await Restaurant.findOne({ user: user._id }).select('name').lean();
    if (!restaurant) continue;
    
    const tracking = await this.getOrCreateMonthlyTracking(restaurant._id, user._id, year, month);
    
    monthlyStats.push({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      restaurantName: restaurant.name,
      restaurantId: restaurant._id,
      year,
      month,
      monthName: new Date(year, month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      messageStats: tracking.messageStats,
      totalStats: tracking.totalStats
    });
  }
  
  return monthlyStats.sort((a, b) => b.totalStats.totalCost - a.totalStats.totalCost);
};

module.exports = mongoose.model('MessageTracking', MessageTrackingSchema); 