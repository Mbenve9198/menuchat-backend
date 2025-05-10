const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  template: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsAppTemplate',
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  scheduledFor: {
    type: Date,
    required: true
  },
  twilioMessageId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'sent', 'failed', 'cancelled'],
    default: 'scheduled'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema); 