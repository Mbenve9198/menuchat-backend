const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema per le campagne WhatsApp
 * Questo modello serve per creare e gestire campagne di messaggistica WhatsApp
 * inviate a gruppi di contatti in momenti specifici
 */
const WhatsAppCampaignSchema = new Schema({
  // Riferimento al ristorante
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  // Nome della campagna
  name: {
    type: String,
    required: [true, 'Nome della campagna è obbligatorio'],
    trim: true
  },
  // Descrizione 
  description: {
    type: String,
    trim: true
  },
  // Template WhatsApp utilizzato per la campagna
  template: {
    type: Schema.Types.ObjectId,
    ref: 'CampaignTemplate',
    required: [true, 'Template della campagna è obbligatorio']
  },
  // Orario programmato per l'invio
  scheduledDate: {
    type: Date,
    required: [true, 'Data e ora di invio è obbligatoria'],
    index: true
  },
  // Stato della campagna
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'completed', 'cancelled', 'failed'],
    default: 'draft',
    index: true
  },
  // Contatti selezionati per la campagna
  targetAudience: {
    // Metodo di selezione del pubblico
    selectionMethod: {
      type: String,
      enum: ['all', 'tags', 'manual', 'filter'],
      default: 'all'
    },
    // Tag utilizzati per il filtro (se selectionMethod è 'tags')
    tags: [String],
    // ID dei contatti selezionati manualmente (se selectionMethod è 'manual')
    manualContacts: [{
      type: Schema.Types.ObjectId,
      ref: 'WhatsAppContact'
    }],
    // Filtri personalizzati (se selectionMethod è 'filter')
    customFilters: {
      type: Schema.Types.Mixed
    },
    // Flag per includere solo contatti con consenso marketing
    onlyWithConsent: {
      type: Boolean,
      default: true
    },
    // Numero totale di contatti target nella campagna
    totalContacts: {
      type: Number,
      default: 0
    }
  },
  // Parametri dinamici per il template
  templateParameters: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // Statistiche della campagna
  statistics: {
    sentCount: {
      type: Number,
      default: 0
    },
    deliveredCount: {
      type: Number,
      default: 0
    },
    readCount: {
      type: Number,
      default: 0
    },
    failedCount: {
      type: Number,
      default: 0
    },
    completedAt: Date,
    lastUpdateAt: {
      type: Date,
      default: Date.now
    }
  },
  // Log di errori durante l'invio
  errorLogs: [{
    contactId: Schema.Types.ObjectId,
    error: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // In caso di campagna periodica
  isRecurring: {
    type: Boolean,
    default: false
  },
  // Configurazione per campagne ricorrenti
  recurringConfig: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'custom'],
      default: 'weekly'
    },
    interval: {
      type: Number,
      default: 1, // es: 1 = ogni settimana, 2 = ogni due settimane
      min: 1
    },
    daysOfWeek: [{ // 0 = domenica, 1 = lunedì, ecc.
      type: Number,
      min: 0,
      max: 6
    }],
    endDate: Date,
    maxOccurrences: Number
  },
  // Flag per determinare se la campagna è parte di un flusso automatico (es. abbandono carrello)
  isAutomated: {
    type: Boolean,
    default: false
  },
  // ID Twilio del messaggio programmato (se non è una campagna di massa)
  twilioScheduledMessageId: String
}, {
  timestamps: true
});

// Creazione di indici composti
WhatsAppCampaignSchema.index({ restaurant: 1, status: 1 });
WhatsAppCampaignSchema.index({ restaurant: 1, scheduledDate: 1 });
WhatsAppCampaignSchema.index({ status: 1, scheduledDate: 1 });

// Metodo per calcolare lo stato complessivo di invio
WhatsAppCampaignSchema.methods.calculateCompletionStatus = function() {
  const stats = this.statistics;
  const total = this.targetAudience.totalContacts;
  
  if (total === 0) return 0;
  
  const sent = stats.sentCount + stats.deliveredCount + stats.readCount + stats.failedCount;
  return (sent / total) * 100;
};

// Metodo per annullare una campagna
WhatsAppCampaignSchema.methods.cancel = async function() {
  if (['draft', 'scheduled'].includes(this.status)) {
    this.status = 'cancelled';
    await this.save();
    return true;
  }
  return false;
};

// Metodo per clonare una campagna
WhatsAppCampaignSchema.methods.clone = async function(newName) {
  const campaignData = this.toObject();
  
  // Rimuovi campi che non devono essere clonati
  delete campaignData._id;
  delete campaignData.createdAt;
  delete campaignData.updatedAt;
  delete campaignData.status;
  delete campaignData.statistics;
  delete campaignData.errorLogs;
  delete campaignData.twilioScheduledMessageId;
  
  // Imposta nuovo nome e status
  campaignData.name = newName || `${this.name} (Copia)`;
  campaignData.status = 'draft';
  campaignData.statistics = {
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    failedCount: 0
  };
  
  // Crea nuova campagna
  const newCampaign = new this.constructor(campaignData);
  await newCampaign.save();
  
  return newCampaign;
};

module.exports = mongoose.model('WhatsAppCampaign', WhatsAppCampaignSchema); 