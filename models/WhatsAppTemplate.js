const mongoose = require('mongoose');

const whatsAppTemplateSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  type: {
    type: String,
    enum: ['MEDIA', 'CALL_TO_ACTION'],
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
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  twilioTemplateId: {
    type: String,
    sparse: true // Permette null/undefined ma deve essere unico se presente
  },
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
  },
  lastSubmissionDate: Date,
  rejectionReason: String
});

// Middleware per aggiornare updatedAt
whatsAppTemplateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indici
whatsAppTemplateSchema.index({ restaurant: 1, type: 1, isActive: 1 });
whatsAppTemplateSchema.index({ twilioTemplateId: 1 }, { sparse: true });

const WhatsAppTemplate = mongoose.model('WhatsAppTemplate', whatsAppTemplateSchema);

module.exports = WhatsAppTemplate; 