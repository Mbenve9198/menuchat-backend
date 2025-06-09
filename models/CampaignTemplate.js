const mongoose = require('mongoose');

/**
 * Schema per i template delle campagne WhatsApp
 * Questo modello archivia i template specifici per le campagne marketing
 */
const campaignTemplateSchema = new mongoose.Schema({
  // Riferimento al ristorante
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  // Tipo di template (CALL_TO_ACTION, MEDIA+CTA, ecc.)
  type: {
    type: String,
    enum: ['MEDIA', 'CALL_TO_ACTION', 'REVIEW'],
    required: true
  },
  // Nome del template
  name: {
    type: String,
    required: true
  },
  // Lingua del template
  language: {
    type: String,
    required: true,
    default: 'it'
  },
  // Stato di approvazione WhatsApp
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  // ID del template in Twilio
  twilioTemplateId: {
    type: String,
    sparse: true // Permette null/undefined ma deve essere unico se presente
  },
  // Categoria WhatsApp (UTILITY, MARKETING, AUTHENTICATION, SERVICE)
  whatsappCategory: {
    type: String,
    enum: ['UTILITY', 'MARKETING', 'AUTHENTICATION', 'SERVICE'],
    default: 'MARKETING'
  },
  // Variabili nel template
  variables: [{
    index: Number,
    name: String,
    example: String
  }],
  // Componenti del template
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
  // Tipo di campagna associata (promo, event, ecc.)
  campaignType: {
    type: String,
    enum: ['promo', 'event', 'update', 'feedback', 'general'],
    required: true
  },
  // Dati per il preview
  preview: {
    // Immagine URL per preview del template
    imageUrl: String,
    // Testo per preview (può includere variabili)
    previewText: String,
    // Testo CTA per preview
    previewCta: String
  },
  // Flag per template personalizzati o predefiniti
  isCustom: {
    type: Boolean,
    default: true
  },
  // Versione del template
  version: {
    type: Number,
    default: 1
  },
  // Flag per template attivo
  isActive: {
    type: Boolean,
    default: true
  },
  // Date di creazione/aggiornamento/sottomissione
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastSubmissionDate: Date,
  // Motivo di rifiuto (se respinto da WhatsApp)
  rejectionReason: String,
  // Statistiche di utilizzo
  usageStatistics: {
    totalUsed: {
      type: Number,
      default: 0
    },
    lastUsed: Date,
    campaignsUsedIn: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsAppCampaign'
    }]
  }
});

// Middleware per aggiornare updatedAt
campaignTemplateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indici per migliorare le query
campaignTemplateSchema.index({ restaurant: 1, type: 1, campaignType: 1 });
campaignTemplateSchema.index({ restaurant: 1, isActive: 1 });
campaignTemplateSchema.index({ twilioTemplateId: 1 }, { sparse: true });

// Metodo per incrementare il contatore di utilizzo
campaignTemplateSchema.methods.incrementUsage = async function(campaignId) {
  this.usageStatistics.totalUsed += 1;
  this.usageStatistics.lastUsed = new Date();
  
  // Aggiungi l'ID della campagna se non è già presente
  if (campaignId && !this.usageStatistics.campaignsUsedIn.includes(campaignId)) {
    this.usageStatistics.campaignsUsedIn.push(campaignId);
  }
  
  await this.save();
  return this;
};

// Metodo per creare una copia del template
campaignTemplateSchema.methods.createCopy = async function(newName = null) {
  const templateData = this.toObject();
  
  // Rimuovi campi che non devono essere copiati
  delete templateData._id;
  delete templateData.createdAt;
  delete templateData.updatedAt;
  delete templateData.usageStatistics;
  delete templateData.twilioTemplateId;
  delete templateData.status;
  delete templateData.lastSubmissionDate;
  delete templateData.rejectionReason;
  
  // Imposta nuovi valori
  templateData.name = newName || `Copia di ${this.name}`;
  templateData.version = this.version + 1;
  templateData.isActive = true;
  
  // Crea nuovo template
  const newTemplate = new this.constructor(templateData);
  await newTemplate.save();
  
  return newTemplate;
};

// Metodo statico per creare template predefiniti per un ristorante
campaignTemplateSchema.statics.createDefaultTemplates = async function(restaurantId, restaurantName = 'Il tuo ristorante') {
  const defaultTemplates = [
    // Template promozionale
    {
      type: 'CALL_TO_ACTION',
      name: `promo_default_${Date.now()}`,
      language: 'it',
      campaignType: 'promo',
      isCustom: false,
      components: {
        body: {
          text: `👋 Ciao {{1}}! ${restaurantName} ha una promozione speciale per te: 20% di sconto sul tuo prossimo ordine con il codice SPECIAL20. Valido fino a domenica!`
        },
        buttons: [{
          type: 'URL',
          text: 'Ordina Ora',
          url: 'https://example.com/menu'
        }]
      },
      whatsappCategory: 'MARKETING'
    },
    // Template eventi
    {
      type: 'MEDIA',
      name: `event_default_${Date.now()}`,
      language: 'it',
      campaignType: 'event',
      isCustom: false,
      components: {
        header: {
          type: 'IMAGE',
          format: 'jpg',
          example: 'https://example.com/event-image.jpg'
        },
        body: {
          text: `🎉 Ciao {{1}}! Ti invitiamo a una serata speciale a ${restaurantName}. Venerdì 15 dicembre dalle 19:00, musica live e menu degustazione. Prenota il tuo posto!`
        },
        buttons: [{
          type: 'PHONE',
          text: 'Prenota Ora',
          phone_number: '+393000000000'
        }]
      },
      whatsappCategory: 'UTILITY'
    },
    // Template aggiornamento menu
    {
      type: 'CALL_TO_ACTION',
      name: `update_default_${Date.now()}`,
      language: 'it',
      campaignType: 'update',
      isCustom: false,
      components: {
        body: {
          text: `🍽️ Ciao {{1}}! ${restaurantName} ha aggiornato il menu con 5 nuovi piatti stagionali! Vieni a provarli e dicci quale preferisci.`
        },
        buttons: [{
          type: 'URL',
          text: 'Vedi Menu',
          url: 'https://example.com/menu'
        }]
      },
      whatsappCategory: 'UTILITY'
    },
    // Template feedback
    {
      type: 'CALL_TO_ACTION',
      name: `feedback_default_${Date.now()}`,
      language: 'it',
      campaignType: 'feedback',
      isCustom: false,
      components: {
        body: {
          text: `👋 Ciao {{1}}! Come è stata la tua esperienza a ${restaurantName}? La tua opinione è importante per noi. Compila il breve sondaggio e ricevi un dessert gratuito alla tua prossima visita!`
        },
        buttons: [{
          type: 'URL',
          text: 'Lascia Feedback',
          url: 'https://example.com/feedback'
        }]
      },
      whatsappCategory: 'UTILITY'
    }
  ];

  const results = [];
  
  for (const template of defaultTemplates) {
    const newTemplate = new this({
      ...template,
      restaurant: restaurantId
    });
    
    await newTemplate.save();
    results.push(newTemplate);
  }
  
  return results;
};

const CampaignTemplate = mongoose.model('CampaignTemplate', campaignTemplateSchema);

module.exports = CampaignTemplate; 