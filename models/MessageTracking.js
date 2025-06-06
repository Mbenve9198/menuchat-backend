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

// Metodo per aggiornare le statistiche
MessageTrackingSchema.methods.addMessage = function(type, conversationType = 'service') {
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
  
  // Incrementa contatori
  this.messageStats[type].messages += 1;
  this.messageStats[type].conversations += 1; // Assumiamo 1 conversazione per messaggio per semplicità
  
  // Calcola costo
  const conversationCost = conversationPrices[conversationType] || 0;
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

module.exports = mongoose.model('MessageTracking', MessageTrackingSchema); 