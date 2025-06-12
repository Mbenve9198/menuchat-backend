const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema per i messaggi salvati per ristorante
 * Ogni ristorante ha messaggi di menu e recensione in diverse lingue
 * che vengono riutilizzati per ogni cliente (sostituendo solo le variabili)
 */
const RestaurantMessageSchema = new Schema({
  // Riferimento al ristorante
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  
  // Tipo di messaggio
  messageType: {
    type: String,
    enum: ['menu', 'review'],
    required: [true, 'Tipo di messaggio è obbligatorio'],
    index: true
  },
  
  // Lingua del messaggio
  language: {
    type: String,
    required: [true, 'Lingua è obbligatoria'],
    enum: ['it', 'en', 'es', 'fr', 'de'],
    default: 'it',
    index: true
  },
  
  // Contenuto del messaggio (con variabili da sostituire)
  messageBody: {
    type: String,
    required: [true, 'Corpo del messaggio è obbligatorio']
    // Esempio: "Ciao {{1}}! Grazie per aver scelto {restaurantName}! 🍽️ Ecco il nostro menu:"
  },
  
  // URL del media (solo per messaggi menu di tipo PDF)
  mediaUrl: {
    type: String,
    required: false
    // Esempio: URL del PDF del menu
  },
  
  // Tipo di media (se presente)
  mediaType: {
    type: String,
    enum: ['pdf', 'image', 'video'],
    required: false
  },
  
  // URL della CTA (Call To Action)
  ctaUrl: {
    type: String,
    required: false
    // Per menu: URL del menu online o null se PDF
    // Per review: URL della recensione (Google, TripAdvisor, etc.)
  },
  
  // Testo della CTA (parte hardcoded)
  ctaText: {
    type: String,
    required: false,
    default: function() {
      return this.messageType === 'menu' ? '🔗 Menu' : '⭐ Lascia una recensione';
    }
  },
  
  // Flag per indicare se il messaggio è attivo
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Metadati per riferimento al template originale (se migrato)
  sourceTemplate: {
    type: Schema.Types.ObjectId,
    ref: 'WhatsAppTemplate',
    required: false
  },
  
  // Timestamp dell'ultima modifica del contenuto
  lastModified: {
    type: Date,
    default: Date.now
  },
  
  // Chi ha modificato il messaggio per ultimo
  modifiedBy: {
    type: String,
    enum: ['claude', 'user', 'system'],
    default: 'claude'
  }
}, {
  timestamps: true
});

// Indice composto per garantire unicità per ristorante+tipo+lingua
RestaurantMessageSchema.index(
  { restaurant: 1, messageType: 1, language: 1 }, 
  { unique: true }
);

// Indici per query frequenti
RestaurantMessageSchema.index({ restaurant: 1, messageType: 1, isActive: 1 });

// Metodo per ottenere il messaggio finale sostituendo le variabili
RestaurantMessageSchema.methods.generateFinalMessage = async function(customerName = 'Cliente', restaurantName = '', customerPhone = null) {
  let finalMessage = this.messageBody;
  
  // Sostituisci le variabili
  finalMessage = finalMessage.replace(/\{\{1\}\}/g, customerName);
  finalMessage = finalMessage.replace(/\{restaurantName\}/g, restaurantName);
  
  // Aggiungi la CTA se presente
  if (this.ctaUrl) {
    let finalCtaUrl = this.ctaUrl;
    
    // 🚀 INTEGRAZIONE OPT-IN MARKETING
    // Se è un messaggio menu con URL esterno, controlla se l'opt-in è abilitato
    if (this.messageType === 'menu' && !this.mediaUrl) {
      try {
        // Popola il ristorante se non è già popolato
        const Restaurant = require('./Restaurant');
        let restaurant;
        
        if (this.restaurant && typeof this.restaurant === 'object' && this.restaurant.marketingOptinConfig) {
          restaurant = this.restaurant;
        } else {
          restaurant = await Restaurant.findById(this.restaurant);
        }
        
        // Se l'opt-in è abilitato, crea URL di redirect
        if (restaurant && restaurant.marketingOptinConfig && restaurant.marketingOptinConfig.enabled) {
          const baseUrl = process.env.FRONTEND_URL || 'https://menuchat.it';
          const optinParams = new URLSearchParams({
            menuUrl: this.ctaUrl,
            lang: this.language
          });
          
          // Aggiungi il numero di telefono se disponibile (per tracking)
          if (customerPhone) {
            optinParams.append('phone', customerPhone);
          }
          
          // Aggiungi il nome del cliente se disponibile (per personalizzazione)
          if (customerName && customerName !== 'Cliente') {
            optinParams.append('customerName', customerName);
          }
          
          finalCtaUrl = `${baseUrl}/optin/${restaurant._id}?${optinParams.toString()}`;
          
          console.log(`🎯 OPT-IN ATTIVO: URL originale ${this.ctaUrl} → URL opt-in ${finalCtaUrl}`);
        }
      } catch (error) {
        console.error('Errore nel controllo opt-in marketing:', error);
        // In caso di errore, usa l'URL originale
        finalCtaUrl = this.ctaUrl;
      }
    }
    
    finalMessage += `\n\n${this.ctaText}: ${finalCtaUrl}`;
  }
  
  return {
    messageBody: finalMessage,
    mediaUrl: this.mediaUrl,
    mediaType: this.mediaType
  };
};

// Metodo statico per trovare un messaggio per ristorante, tipo e lingua
RestaurantMessageSchema.statics.findMessage = async function(restaurantId, messageType, language = 'it') {
  // Cerca il messaggio nella lingua specifica
  let message = await this.findOne({
    restaurant: restaurantId,
    messageType: messageType,
    language: language,
    isActive: true
  });
  
  // Se non trovato, fallback all'italiano
  if (!message && language !== 'it') {
    message = await this.findOne({
      restaurant: restaurantId,
      messageType: messageType,
      language: 'it',
      isActive: true
    });
  }
  
  // Se ancora non trovato, prendi il primo disponibile
  if (!message) {
    message = await this.findOne({
      restaurant: restaurantId,
      messageType: messageType,
      isActive: true
    });
  }
  
  return message;
};

module.exports = mongoose.model('RestaurantMessage', RestaurantMessageSchema); 