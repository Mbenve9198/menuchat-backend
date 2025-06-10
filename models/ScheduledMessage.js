const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema per i messaggi programmati
 */
const ScheduledMessageSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  customerInteraction: {
    type: Schema.Types.ObjectId,
    ref: 'CustomerInteraction',
    required: false
  },
  campaign: {
    type: Schema.Types.ObjectId,
    ref: 'WhatsAppCampaign',
    required: false
  },
  // Dati del destinatario
  phoneNumber: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    default: 'Cliente'
  },
  // Dati del messaggio - NUOVO SISTEMA (messaggi normali)
  messageType: {
    type: String,
    enum: ['review', 'campaign', 'followup', 'menu'],
    required: true
  },
  // Riferimento al template del database (nuovo sistema)
  template: {
    type: Schema.Types.ObjectId,
    ref: 'WhatsAppTemplate',
    required: false // Opzionale per retrocompatibilità
  },
  // Corpo del messaggio già processato (nuovo sistema)
  messageBody: {
    type: String,
    required: false // Sarà richiesto dopo la migrazione
  },
  // URL del media se presente (nuovo sistema)
  mediaUrl: {
    type: String,
    required: false
  },
  // VECCHIO SISTEMA (template WhatsApp) - mantenuto per retrocompatibilità
  templateId: {
    type: String,
    required: false // Non più obbligatorio dopo la migrazione
  },
  templateVariables: {
    type: Object,
    default: {}
  },
  // Programmazione
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  // Stato
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  // Risultato invio
  sentAt: Date,
  twilioMessageId: String,
  errorMessage: String,
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  }
}, {
  timestamps: true
});

// Indici per performance
ScheduledMessageSchema.index({ status: 1, scheduledFor: 1 });
ScheduledMessageSchema.index({ restaurant: 1, status: 1 });

// Metodo per marcare come inviato
ScheduledMessageSchema.methods.markAsSent = function(twilioMessageId) {
  this.status = 'sent';
  this.sentAt = new Date();
  this.twilioMessageId = twilioMessageId;
  return this.save();
};

// Metodo per marcare come fallito
ScheduledMessageSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.retryCount += 1;
  return this.save();
};

// Metodo per cancellare
ScheduledMessageSchema.methods.cancel = function() {
  this.status = 'cancelled';
  return this.save();
};

// Metodo per verificare se usa il nuovo sistema
ScheduledMessageSchema.methods.usesNewSystem = function() {
  return this.template && this.messageBody;
};

// Metodo per verificare se usa il vecchio sistema
ScheduledMessageSchema.methods.usesLegacySystem = function() {
  return this.templateId && !this.template;
};

// Metodo statico per trovare messaggi da inviare
ScheduledMessageSchema.statics.findMessagesToSend = function() {
  return this.find({
    status: 'pending',
    scheduledFor: { $lte: new Date() }
  }).populate('restaurant').populate('template');
};

// Metodo statico per programmare un messaggio di recensione (NUOVO SISTEMA)
ScheduledMessageSchema.statics.scheduleReviewMessage = function(data) {
  const messageData = {
    restaurant: data.restaurantId,
    customerInteraction: data.interactionId,
    phoneNumber: data.phoneNumber,
    customerName: data.customerName,
    messageType: 'review',
    scheduledFor: data.scheduledFor
  };

  // Nuovo sistema: usa template object e messageBody
  if (data.template && data.messageBody) {
    messageData.template = data.template._id || data.template;
    messageData.messageBody = data.messageBody;
    if (data.mediaUrl) {
      messageData.mediaUrl = data.mediaUrl;
    }
  }
  // Vecchio sistema: usa templateId (retrocompatibilità)
  else if (data.templateId) {
    messageData.templateId = data.templateId;
    messageData.templateVariables = data.templateVariables || {};
  }

  return this.create(messageData);
};

// Metodo statico per programmare un messaggio di campagna (NUOVO SISTEMA)
ScheduledMessageSchema.statics.scheduleCampaignMessage = function(data) {
  const messageData = {
    restaurant: data.restaurantId,
    campaign: data.campaignId,
    phoneNumber: data.phoneNumber,
    customerName: data.customerName,
    messageType: 'campaign',
    scheduledFor: data.scheduledFor
  };

  // Nuovo sistema: usa template object e messageBody
  if (data.template && data.messageBody) {
    messageData.template = data.template._id || data.template;
    messageData.messageBody = data.messageBody;
    if (data.mediaUrl) {
      messageData.mediaUrl = data.mediaUrl;
    }
  }
  // Vecchio sistema: usa templateId (retrocompatibilità)
  else if (data.templateId) {
    messageData.templateId = data.templateId;
    messageData.templateVariables = data.templateVariables || {};
  }

  return this.create(messageData);
};

module.exports = mongoose.model('ScheduledMessage', ScheduledMessageSchema); 