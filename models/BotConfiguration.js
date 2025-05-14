const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema per i menu PDF in diverse lingue
 */
const LanguageMenuSchema = new Schema({
  language: {
    code: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    phonePrefix: {
      type: [String],
      required: true
    }
  },
  // URL del menu PDF su Cloudinary
  menuUrl: String,
  // URL del menu PDF uploadato su Cloudinary
  menuPdfUrl: String,
  // Nome originale del file PDF
  menuPdfName: String
}, { _id: false });

/**
 * Schema per la configurazione del bot
 */
const BotConfigurationSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  triggerWord: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  welcomeMessage: {
    type: String,
    required: true
  },
  // Riferimenti ai menu in diverse lingue
  menus: [{
    type: Schema.Types.ObjectId,
    ref: 'Menu'
  }],
  // Menu di default per retrocompatibilità
  defaultMenuUrl: String,
  // Link per le recensioni
  reviewLink: String,
  reviewPlatform: {
    type: String,
    enum: ['google', 'yelp', 'tripadvisor', 'custom'],
    default: 'google'
  },
  // Tempo di attesa in minuti prima di chiedere una recensione
  reviewTimer: {
    type: Number,
    default: 120 // 2 ore di default
  },
  // Messaggio per la richiesta di recensione
  reviewMessage: String,
  // Configurazione attiva o inattiva
  active: {
    type: Boolean,
    default: true
  },
  // Tipo di numero WhatsApp (default o personalizzato)
  whatsappNumberType: {
    type: String,
    enum: ['default', 'custom'],
    default: 'default'
  },
  // Numero WhatsApp personalizzato
  whatsappNumber: {
    type: String,
    trim: true
  },
  // Messaging Service ID personalizzato
  messagingServiceSid: {
    type: String,
    trim: true
  },
  // Twilio Account SID personalizzato (opzionale)
  twilioAccountSid: {
    type: String,
    trim: true
  },
  // Twilio Auth Token personalizzato (opzionale)
  twilioAuthToken: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Metodo per ottenere il menu nella lingua appropriata
BotConfigurationSchema.methods.getMenuForLanguage = async function(languageCode) {
  try {
    // Popola i menu se non sono già popolati
    if (!this.populated('menus')) {
      await this.populate('menus');
    }
    
    // Cerca un menu nella lingua specificata
    const menu = this.menus.find(menu => 
      menu.language.code === languageCode && menu.isActive
    );
    
    // Se non trovato, restituisci il menu di default
    if (!menu) {
      return this.menus.find(menu => 
        menu.isDefault && menu.isActive
      );
    }
    
    return menu;
  } catch (error) {
    console.error('Error getting menu for language:', error);
    return null;
  }
};

module.exports = mongoose.model('BotConfiguration', BotConfigurationSchema); 