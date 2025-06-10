const mongoose = require('mongoose');

const whatsAppTemplateSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  type: {
    type: String,
    enum: ['MEDIA', 'CALL_TO_ACTION', 'REVIEW'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  language: {
    type: String,
    required: true,
    default: 'it'
  },
  variables: [{
    index: Number,
    name: String,
    example: String
  }],
  components: {
    header: {
      type: {
        type: String,
        enum: ['NONE', 'DOCUMENT', 'IMAGE', 'VIDEO'],
        default: 'NONE'
      },
      format: String,
      example: mongoose.Schema.Types.Mixed
    },
    body: {
      text: {
        type: String,
        required: true
      },
      example: mongoose.Schema.Types.Mixed
    },
    buttons: [{
      type: {
        type: String,
        enum: ['URL', 'PHONE', 'QUICK_REPLY']
      },
      text: String,
      url: String,
      phone_number: String
    }]
  },
  version: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware per aggiornare updatedAt
whatsAppTemplateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indici per migliorare le performance
whatsAppTemplateSchema.index({ restaurant: 1, type: 1, language: 1 });
whatsAppTemplateSchema.index({ restaurant: 1, isActive: 1 });

module.exports = mongoose.model('WhatsAppTemplate', whatsAppTemplateSchema); 