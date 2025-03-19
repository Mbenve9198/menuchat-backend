const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema per i modelli di messaggi multilingua
const MessageTemplateSchema = new Schema({
  it: {
    type: String,
    required: [true, 'Modello di messaggio in italiano è obbligatorio']
  },
  en: String,
  es: String
}, { _id: false });

// Schema principale per la configurazione del bot
const BotConfigurationSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true // Indicizzazione per trovare configurazioni bot per ristorante
  },
  triggerWord: {
    type: String,
    required: [true, 'Trigger phrase is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return v.length >= 2 && v.length <= 50; // Allow trigger phrases between 2-50 characters
      },
      message: props => `Trigger phrase must be between 2 and 50 characters long!`
    },
    index: true // Ensure this field is indexed for quick lookups and uniqueness checks
  },
  welcomeMessage: {
    type: MessageTemplateSchema,
    required: [true, 'Messaggio di benvenuto è obbligatorio']
  },
  reviewRequestMessage: {
    type: MessageTemplateSchema,
    required: [true, 'Messaggio di richiesta recensione è obbligatorio']
  },
  hoursDelayBeforeReviewRequest: {
    type: Number,
    default: 2,
    min: 1,
    max: 72
  },
  whatsappNumberType: {
    type: String,
    enum: ['system', 'custom'],
    default: 'system'
  },
  whatsappNumber: {
    type: String,
    validate: {
      validator: function(v) {
        // Controllo di base per il formato del numero di telefono
        return /^\+?[0-9]{10,15}$/.test(v);
      },
      message: props => `${props.value} non è un numero di telefono valido!`
    }
  },
  qrCode: {
    generatedUrl: String,
    imagePath: String,
    generatedAt: Date
  },
  aiConfiguration: {
    personalityType: {
      type: String,
      enum: ['friendly', 'professional', 'casual', 'formal'],
      default: 'friendly'
    },
    responseStyle: {
      type: String,
      enum: ['concise', 'detailed', 'enthusiastic'],
      default: 'concise'
    },
    knowledgeBase: {
      type: String,
      enum: ['basic', 'advanced'],
      default: 'basic'
    },
    customInstructions: String
  },
  active: {
    type: Boolean,
    default: true,
    index: true // Indicizzazione per trovare bot attivi
  },
  deactivationReason: String,
  // Configurazioni avanzate disponibili solo per account premium
  premiumFeatures: {
    customChatbotName: String,
    customBotAvatar: String,
    customTheme: {
      primaryColor: String, // Formato HEX (#RRGGBB)
      secondaryColor: String,
      fontFamily: String
    },
    allowFreeFormQuestions: {
      type: Boolean,
      default: false
    },
    autoReplyToCommonQuestions: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true // Aggiunge automaticamente i campi createdAt e updatedAt
});

// Indicizzazione composta per query frequenti
BotConfigurationSchema.index({ restaurant: 1, active: 1 });
BotConfigurationSchema.index({ triggerWord: 1 }); // Per cercare rapidamente per parola di attivazione
BotConfigurationSchema.index({ 'whatsappNumber': 1 }, { sparse: true }); // Indicizzazione per numero WhatsApp

// Metodo per generare un QR code dinamico
BotConfigurationSchema.methods.generateQrData = function() {
  return {
    restaurantId: this.restaurant,
    botId: this._id,
    triggerWord: this.triggerWord
  };
};

// Validazione avanzata: assicura che i client premium abbiano accesso a tutte le funzionalità
BotConfigurationSchema.pre('save', async function(next) {
  // Recupera l'oggetto restaurant popolato se non è già popolato
  let restaurant;
  if (this.restaurant._id) {
    restaurant = this.restaurant;
  } else {
    try {
      restaurant = await mongoose.model('Restaurant').findById(this.restaurant).populate('user');
    } catch (err) {
      return next(err);
    }
  }
  
  // Se il ristorante o l'utente non sono trovati, passa al prossimo middleware
  if (!restaurant || !restaurant.user) return next();
  
  // Controlla se l'utente ha un account premium
  const isPremium = restaurant.user.subscriptionTier === 'premium';
  
  // Se non è premium e sta cercando di usare funzionalità premium, reimposta ai valori predefiniti
  if (!isPremium && this.whatsappNumberType === 'custom') {
    this.whatsappNumberType = 'system';
    this.whatsappNumber = undefined;
  }
  
  next();
});

module.exports = mongoose.model('BotConfiguration', BotConfigurationSchema); 