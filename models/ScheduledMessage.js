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
  // Dati del messaggio
  messageType: {
    type: String,
    enum: ['review', 'campaign', 'followup'],
    required: true
  },
  templateId: {
    type: String,
    required: true
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

// Metodo statico per trovare messaggi da inviare
ScheduledMessageSchema.statics.findMessagesToSend = function() {
  return this.find({
    status: 'pending',
    scheduledFor: { $lte: new Date() }
  }).populate('restaurant');
};

// Metodo statico per programmare un messaggio di recensione
ScheduledMessageSchema.statics.scheduleReviewMessage = function(data) {
  return this.create({
    restaurant: data.restaurantId,
    customerInteraction: data.interactionId,
    phoneNumber: data.phoneNumber,
    customerName: data.customerName,
    messageType: 'review',
    templateId: data.templateId,
    templateVariables: data.templateVariables,
    scheduledFor: data.scheduledFor
  });
};

// Metodo statico per programmare un messaggio di campagna
ScheduledMessageSchema.statics.scheduleCampaignMessage = function(data) {
  return this.create({
    restaurant: data.restaurantId,
    campaign: data.campaignId,
    phoneNumber: data.phoneNumber,
    customerName: data.customerName,
    messageType: 'campaign',
    templateId: data.templateId,
    templateVariables: data.templateVariables,
    scheduledFor: data.scheduledFor
  });
};

module.exports = mongoose.model('ScheduledMessage', ScheduledMessageSchema); 