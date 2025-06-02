const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EmailReportSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Utente è obbligatorio'],
    index: true
  },
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'campaign_suggestion'],
    required: [true, 'Tipo di email è obbligatorio'],
    index: true
  },
  subject: {
    type: String,
    required: [true, 'Oggetto email è obbligatorio']
  },
  content: {
    type: String,
    required: [true, 'Contenuto email è obbligatorio']
  },
  language: {
    type: String,
    enum: ['italiano', 'english', 'español'],
    required: [true, 'Lingua è obbligatoria']
  },
  // Dati del report
  reportData: {
    // Per report giornalieri/settimanali
    period: {
      startDate: Date,
      endDate: Date
    },
    metrics: {
      menusSent: { type: Number, default: 0 },
      reviewRequests: { type: Number, default: 0 },
      reviewsCollected: { type: Number, default: 0 },
      newReviews: { type: Number, default: 0 }
    },
    // Per suggerimenti campagne
    campaignSuggestion: {
      type: Schema.Types.Mixed
    }
  },
  // Status dell'invio
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
    index: true
  },
  sentAt: Date,
  failureReason: String,
  // ID Resend per tracking
  resendId: String
}, {
  timestamps: true
});

// Indici per ottimizzare le query
EmailReportSchema.index({ user: 1, type: 1, createdAt: -1 });
EmailReportSchema.index({ restaurant: 1, type: 1, createdAt: -1 });
EmailReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EmailReport', EmailReportSchema); 