const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

// Schema per il tracking degli eventi con timestamp
const InteractionEventSchema = new Schema({
  type: {
    type: String,
    enum: ['menu_viewed', 'info_requested', 'order_intent', 'review_requested', 'review_completed', 'other'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  details: Schema.Types.Mixed // Per memorizzare dettagli aggiuntivi sull'evento
}, { _id: false });

// Schema principale per le interazioni dei clienti
const CustomerInteractionSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true // Indicizzazione per trovare interazioni per ristorante
  },
  // Numero di telefono del cliente (hashed per privacy)
  customerPhoneHash: {
    type: String,
    required: [true, 'Hash del numero di telefono del cliente è obbligatorio'],
    index: true // Indicizzazione per trovare interazioni per telefono cliente
  },
  firstInteractionAt: {
    type: Date,
    default: Date.now,
    index: true // Indicizzazione per ordinare per prima interazione
  },
  // Log degli eventi principali di interazione
  events: [InteractionEventSchema],
  // Stato dell'interazione
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active',
    index: true // Indicizzazione per trovare interazioni per stato
  },
  // Referenze alla history delle conversazioni (opzionale)
  conversationHistory: [{
    type: Schema.Types.ObjectId,
    ref: 'ConversationMessage'
  }],
  // Metadata per tracciare l'origine del cliente
  source: {
    type: String,
    enum: ['qr_scan', 'direct_message', 'referral', 'other'],
    default: 'qr_scan'
  },
  sourceDetails: String,
  // Per tracciare le azioni di menu e recensioni
  menuItems: [{
    itemId: Schema.Types.ObjectId, // Riferimento all'elemento del menu
    viewCount: { type: Number, default: 1 },
    lastViewed: Date
  }],
  reviewData: {
    requested: { type: Boolean, default: false },
    requestedAt: Date,
    completed: { type: Boolean, default: false },
    completedAt: Date,
    platform: {
      type: String,
      enum: ['google', 'tripadvisor', 'facebook', 'custom', 'other']
    },
    rating: { type: Number, min: 1, max: 5 }
  },
  // Per le interazioni di lunga durata
  lastActive: {
    type: Date,
    default: Date.now,
    index: true // Indicizzazione per trovare interazioni recenti
  },
  // Per identificare interazioni con lo stesso cliente
  deviceInfo: {
    userAgent: String,
    ipHash: String
  }
}, {
  timestamps: true // Aggiunge automaticamente i campi createdAt e updatedAt
});

// Indicizzazione composta per query comuni
CustomerInteractionSchema.index({ restaurant: 1, status: 1 });
CustomerInteractionSchema.index({ restaurant: 1, lastActive: -1 });
CustomerInteractionSchema.index({ restaurant: 1, 'reviewData.completed': 1 });
CustomerInteractionSchema.index({ restaurant: 1, 'reviewData.requestedAt': 1 }, { sparse: true });

// Metodo statico per hashare il numero di telefono (per privacy)
CustomerInteractionSchema.statics.hashPhoneNumber = function(phoneNumber) {
  // Rimuove caratteri non numerici e normalizza
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  
  // Crea un hash SHA-256 del numero di telefono
  return crypto
    .createHash('sha256')
    .update(normalizedPhone)
    .digest('hex');
};

// Metodo per aggiungere un nuovo evento all'interazione
CustomerInteractionSchema.methods.addEvent = function(eventType, details = {}) {
  this.events.push({
    type: eventType,
    timestamp: new Date(),
    details
  });
  
  this.lastActive = new Date();
  
  // Aggiorna campi specifici in base al tipo di evento
  switch(eventType) {
    case 'menu_viewed':
      // Implementazione per menu_viewed
      break;
    case 'review_requested':
      this.reviewData.requested = true;
      this.reviewData.requestedAt = new Date();
      break;
    case 'review_completed':
      this.reviewData.completed = true;
      this.reviewData.completedAt = new Date();
      if (details.rating) this.reviewData.rating = details.rating;
      if (details.platform) this.reviewData.platform = details.platform;
      this.status = 'completed';
      break;
  }
  
  return this;
};

// Metodo per verificare se è il momento di inviare una richiesta di recensione
CustomerInteractionSchema.methods.shouldSendReviewRequest = function(botConfig) {
  // Se la recensione è già stata richiesta, non inviare di nuovo
  if (this.reviewData.requested) return false;
  
  // Se l'interazione è troppo recente (in base alla configurazione), attendere
  const hoursDelay = botConfig.hoursDelayBeforeReviewRequest || 2;
  const delayMs = hoursDelay * 60 * 60 * 1000;
  
  // Se il primo contatto è più vecchio del ritardo configurato
  return (Date.now() - this.firstInteractionAt) > delayMs;
};

module.exports = mongoose.model('CustomerInteraction', CustomerInteractionSchema); 