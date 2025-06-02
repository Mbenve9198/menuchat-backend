const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CampaignSuggestionSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Utente è obbligatorio'],
    index: true
  },
  // Dati del suggerimento generato da AI
  suggestion: {
    title: {
      type: String,
      required: [true, 'Titolo del suggerimento è obbligatorio']
    },
    description: {
      type: String,
      required: [true, 'Descrizione del suggerimento è obbligatoria']
    },
    campaignType: {
      type: String,
      enum: ['promo', 'event', 'update', 'feedback'],
      required: [true, 'Tipo di campagna è obbligatorio']
    },
    targetAudience: {
      type: String,
      required: [true, 'Target audience è obbligatorio']
    },
    messageTemplate: {
      type: String,
      required: [true, 'Template del messaggio è obbligatorio']
    },
    timing: {
      type: String,
      required: [true, 'Timing suggerito è obbligatorio']
    },
    expectedResults: {
      type: String,
      required: [true, 'Risultati attesi sono obbligatori']
    },
    stepByStepInstructions: [{
      step: {
        type: Number,
        required: true
      },
      title: {
        type: String,
        required: true
      },
      description: {
        type: String,
        required: true
      },
      actionRequired: {
        type: String,
        required: true
      }
    }]
  },
  // Contesto utilizzato per generare il suggerimento
  context: {
    restaurantInfo: {
      type: Schema.Types.Mixed
    },
    recentCampaigns: [{
      type: Schema.Types.ObjectId,
      ref: 'WhatsAppCampaign'
    }],
    previousSuggestions: [{
      type: Schema.Types.ObjectId,
      ref: 'CampaignSuggestion'
    }],
    performanceMetrics: {
      type: Schema.Types.Mixed
    }
  },
  // Status del suggerimento
  status: {
    type: String,
    enum: ['generated', 'sent_via_email', 'viewed', 'implemented', 'dismissed'],
    default: 'generated',
    index: true
  },
  // Lingua del suggerimento
  language: {
    type: String,
    enum: ['italiano', 'english', 'español'],
    required: [true, 'Lingua è obbligatoria']
  },
  // Tracking delle azioni
  viewedAt: Date,
  implementedAt: Date,
  dismissedAt: Date,
  // Se è stato implementato, riferimento alla campagna creata
  implementedCampaign: {
    type: Schema.Types.ObjectId,
    ref: 'WhatsAppCampaign'
  }
}, {
  timestamps: true
});

// Indici per ottimizzare le query
CampaignSuggestionSchema.index({ restaurant: 1, status: 1, createdAt: -1 });
CampaignSuggestionSchema.index({ user: 1, status: 1, createdAt: -1 });
CampaignSuggestionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CampaignSuggestion', CampaignSuggestionSchema); 