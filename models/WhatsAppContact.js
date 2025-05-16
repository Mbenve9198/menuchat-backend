const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

/**
 * Schema per i contatti WhatsApp
 * Questo modello archivia i contatti dei clienti che hanno interagito con il bot
 * e il loro stato di consenso per ricevere comunicazioni di marketing
 */
const WhatsAppContactSchema = new Schema({
  // Riferimento al ristorante
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  // Nome del cliente (fornito da Twilio o inserito manualmente)
  name: {
    type: String,
    required: [true, 'Nome del contatto è obbligatorio'],
    default: 'Cliente'
  },
  // Numero di telefono del cliente
  phoneNumber: {
    type: String,
    required: [true, 'Numero di telefono è obbligatorio'],
    index: true
  },
  // Hash del numero per privacy e ricerche veloci
  phoneHash: {
    type: String,
    required: true,
    index: true
  },
  // Stato di consenso marketing (opt-in/opt-out)
  marketingConsent: {
    // true = ha dato consenso, false = ha negato consenso (opt-out)
    status: {
      type: Boolean,
      default: true, // Di default si presume il consenso quando interagiscono
      index: true
    },
    // Data dell'ultimo aggiornamento dello stato di consenso
    updatedAt: {
      type: Date,
      default: Date.now
    },
    // Come è stato ottenuto il consenso
    source: {
      type: String,
      enum: ['initial_interaction', 'form_submission', 'api_import', 'manual_import'],
      default: 'initial_interaction'
    }
  },
  // Data della prima interazione
  firstContactDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Data dell'ultima interazione
  lastContactDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Contatore delle interazioni
  interactionCount: {
    type: Number,
    default: 1
  },
  // Tags o segmenti per campagne mirate
  tags: [{
    type: String,
    index: true
  }],
  // Metadati aggiuntivi
  metadata: {
    type: Schema.Types.Mixed
  },
  // Preferenza della lingua
  language: {
    type: String,
    default: 'it',
    enum: ['it', 'en', 'es', 'fr', 'de'],
    index: true
  },
  // Riferimenti alle campagne ricevute
  receivedCampaigns: [{
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'WhatsAppCampaign'
    },
    sentAt: Date,
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent'
    }
  }],
  // Flag per indicare se il contatto è stato importato manualmente
  isImported: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indici composti per queries comuni
WhatsAppContactSchema.index({ restaurant: 1, marketingConsent: 1 });
WhatsAppContactSchema.index({ restaurant: 1, lastContactDate: -1 });
WhatsAppContactSchema.index({ restaurant: 1, tags: 1 });

// Metodo pre-save per generare hash del telefono se non presente
WhatsAppContactSchema.pre('save', function(next) {
  if (!this.phoneHash) {
    // Normalizza il numero di telefono (rimuove whatsapp: e caratteri non numerici)
    const normalizedPhone = this.phoneNumber.replace('whatsapp:', '').replace(/\D/g, '');
    
    // Crea hash del numero
    this.phoneHash = crypto
      .createHash('sha256')
      .update(normalizedPhone)
      .digest('hex');
  }
  next();
});

// Metodo statico per trovare o creare un contatto
WhatsAppContactSchema.statics.findOrCreate = async function(restaurantId, phoneNumber, name = 'Cliente', language = 'it') {
  // Normalizza il numero di telefono
  const normalizedPhone = phoneNumber.replace('whatsapp:', '');
  
  // Genera hash per la ricerca
  const phoneHash = crypto
    .createHash('sha256')
    .update(normalizedPhone.replace(/\D/g, ''))
    .digest('hex');
  
  // Cerca contatto esistente
  let contact = await this.findOne({
    restaurant: restaurantId,
    phoneHash: phoneHash
  });
  
  // Se esiste, aggiorna last contact e interaction count
  if (contact) {
    contact.lastContactDate = new Date();
    contact.interactionCount += 1;
    
    // Aggiorna il nome se è cambiato e il nuovo non è generico
    if (name !== 'Cliente' && contact.name === 'Cliente') {
      contact.name = name;
    }
    
    await contact.save();
    return contact;
  }
  
  // Altrimenti crea nuovo contatto
  contact = new this({
    restaurant: restaurantId,
    phoneNumber: normalizedPhone,
    phoneHash: phoneHash,
    name: name,
    language: language
  });
  
  await contact.save();
  return contact;
};

// Metodo per aggiornare lo stato di opt-out
WhatsAppContactSchema.methods.optOut = async function(source = 'manual_import') {
  this.marketingConsent.status = false;
  this.marketingConsent.updatedAt = new Date();
  this.marketingConsent.source = source;
  await this.save();
  return this;
};

// Metodo per aggiornare lo stato di opt-in
WhatsAppContactSchema.methods.optIn = async function(source = 'user_request') {
  this.marketingConsent.status = true;
  this.marketingConsent.updatedAt = new Date();
  this.marketingConsent.source = source;
  await this.save();
  return this;
};

// Metodo per aggiungere tag
WhatsAppContactSchema.methods.addTag = async function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    await this.save();
  }
  return this;
};

// Metodo per rimuovere tag
WhatsAppContactSchema.methods.removeTag = async function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  await this.save();
  return this;
};

module.exports = mongoose.model('WhatsAppContact', WhatsAppContactSchema); 