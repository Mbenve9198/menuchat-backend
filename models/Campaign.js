const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema per i destinatari della campagna
const RecipientSchema = new Schema({
  contact: {
    type: Schema.Types.ObjectId, 
    ref: 'Contact',
    required: true
  },
  sent: {
    type: Boolean,
    default: false
  },
  sentAt: {
    type: Date,
    default: null
  },
  error: {
    type: String,
    default: null
  }
}, { _id: false });

// Schema principale per le campagne marketing
const CampaignSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Nome campagna è obbligatorio'],
    trim: true
  },
  // Status della campagna
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'pending_approval', 'approved', 'sending', 'completed', 'failed', 'cancelled'],
    default: 'draft',
    index: true
  },
  // Data di invio programmata
  scheduledFor: {
    type: Date,
    required: [true, 'Data di invio è obbligatoria'],
    index: true
  },
  // Conteggio dei destinatari
  recipientsCount: {
    type: Number,
    default: 0
  },
  // Dettaglio dei destinatari
  recipients: [RecipientSchema],
  // Conteggio dei messaggi inviati con successo
  sentCount: {
    type: Number,
    default: 0
  },
  // Parametri di filtro usati
  filters: {
    countries: [String],
    optIn: {
      type: Boolean,
      default: true
    },
    minInteractions: {
      type: Number,
      default: 0
    },
    tags: [String],
    language: String
  },
  // Contenuto del messaggio
  content: {
    type: {
      type: String,
      enum: ['text', 'media', 'url'],
      default: 'text'
    },
    text: {
      type: String,
      required: [true, 'Testo del messaggio è obbligatorio']
    },
    mediaUrl: String,
    mediaType: {
      type: String,
      enum: ['image', 'video', 'document', null],
      default: null
    },
    ctaType: {
      type: String,
      enum: ['url', 'phone', 'none'],
      default: 'none'
    },
    ctaText: String,
    ctaValue: String
  },
  // Template Twilio
  twilioTemplateId: {
    type: String,
    default: null
  },
  twilioTemplateName: {
    type: String,
    default: null
  },
  twilioTemplateStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', null],
    default: null,
    index: true
  },
  // Errori
  error: {
    type: String,
    default: null
  },
  // Statistiche
  stats: {
    deliveryRate: {
      type: Number,
      default: 0
    },
    errorRate: {
      type: Number,
      default: 0
    }
  },
  // Flag per cancellazione logica
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Flag per test
  isTest: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true // Aggiunge automaticamente i campi createdAt e updatedAt
});

// Indicizzazione composta per query comuni
CampaignSchema.index({ restaurant: 1, status: 1 });
CampaignSchema.index({ restaurant: 1, createdAt: -1 });
CampaignSchema.index({ scheduledFor: 1, status: 1 });

module.exports = mongoose.model('Campaign', CampaignSchema); 