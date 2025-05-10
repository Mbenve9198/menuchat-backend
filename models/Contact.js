const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

// Schema per tracciare le interazioni del cliente
const InteractionDateSchema = new Schema({
  date: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Schema principale per i contatti dei clienti
const ContactSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  // Nome del cliente (visibile su WhatsApp)
  name: {
    type: String,
    required: [true, 'Nome del cliente è obbligatorio'],
    trim: true,
    index: true
  },
  // Numero di telefono del cliente
  phoneNumber: {
    type: String,
    required: [true, 'Numero di telefono è obbligatorio'],
    index: true
  },
  // Hash del numero di telefono per privacy e ricerche
  phoneHash: {
    type: String,
    required: [true, 'Hash del numero di telefono è obbligatorio'],
    index: true
  },
  // Consenso marketing
  optIn: {
    type: Boolean,
    default: false,
    index: true
  },
  // Data in cui il cliente ha dato il consenso
  optInDate: {
    type: Date,
    default: null
  },
  // Tracciamento per opt-out
  optOut: {
    type: Boolean,
    default: false,
    index: true
  },
  // Data in cui il cliente ha revocato il consenso
  optOutDate: {
    type: Date,
    default: null
  },
  // Se è stata inviata una richiesta di recensione
  reviewLinkSent: {
    type: Boolean,
    default: false
  },
  // Data in cui è stata inviata l'ultima richiesta di recensione
  lastReviewLinkSentAt: {
    type: Date,
    default: null
  },
  // Conteggio delle interazioni in giorni diversi
  interactionDates: [InteractionDateSchema],
  // Conteggio totale delle interazioni
  interactionCount: {
    type: Number,
    default: 0
  },
  // Lingua preferita del cliente
  language: {
    type: String,
    enum: ['it', 'en', 'es', 'fr', 'de'],
    default: 'it'
  },
  // Metadati aggiuntivi e note
  notes: {
    type: String,
    default: ''
  },
  // Tag per segmentazione
  tags: [String],
  // Flag per contatti di test
  isTest: {
    type: Boolean,
    default: false
  },
  // Data di creazione del contatto
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Data dell'ultima interazione
  lastInteractionAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Indicizzazione composta per query comuni
ContactSchema.index({ restaurant: 1, optIn: 1 });
ContactSchema.index({ restaurant: 1, lastInteractionAt: -1 });
ContactSchema.index({ restaurant: 1, reviewLinkSent: 1 });

// Metodo statico per hashare il numero di telefono (per privacy)
ContactSchema.statics.hashPhoneNumber = function(phoneNumber) {
  // Rimuove caratteri non numerici e normalizza
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  
  // Crea un hash SHA-256 del numero di telefono
  return crypto
    .createHash('sha256')
    .update(normalizedPhone)
    .digest('hex');
};

// Metodo per aggiungere una nuova interazione
ContactSchema.methods.addInteraction = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalizza alla data odierna senza ora
  
  // Controlla se esiste già un'interazione per oggi
  const existingInteractionToday = this.interactionDates.find(interaction => {
    const interactionDate = new Date(interaction.date);
    interactionDate.setHours(0, 0, 0, 0);
    return interactionDate.getTime() === today.getTime();
  });
  
  // Se non c'è un'interazione per oggi, aggiungila
  if (!existingInteractionToday) {
    this.interactionDates.push({ date: new Date() });
  }
  
  // Incrementa il contatore di interazioni
  this.interactionCount += 1;
  
  // Aggiorna la data dell'ultima interazione
  this.lastInteractionAt = new Date();
  
  return this;
};

// Metodo per verificare se il cliente è attivo (ha interagito negli ultimi X giorni)
ContactSchema.methods.isActive = function(days = 90) {
  const daysInMilliseconds = days * 24 * 60 * 60 * 1000;
  return (Date.now() - this.lastInteractionAt) <= daysInMilliseconds;
};

module.exports = mongoose.model('Contact', ContactSchema); 