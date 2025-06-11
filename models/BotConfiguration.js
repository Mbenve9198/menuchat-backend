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
  // Configurazione fasce orarie per l'invio dei messaggi
  messagingHours: {
    enabled: {
      type: Boolean,
      default: true // Abilitato di default
    },
    startHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 9 // Inizia a inviare dalle 9:00
    },
    endHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 23 // Smette di inviare alle 23:00 (fino alle 23:59)
    },
    timezone: {
      type: String,
      default: 'Europe/Rome' // Timezone di default per l'Italia
    }
  },
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

// Metodo per verificare se è possibile inviare messaggi nell'orario corrente
BotConfigurationSchema.methods.canSendMessageNow = function() {
  try {
    // Se le fasce orarie sono disabilitate, può sempre inviare
    if (!this.messagingHours.enabled) {
      return { canSend: true, reason: 'Fasce orarie disabilitate' };
    }

    // Ottieni l'ora corrente nel timezone del ristorante
    const now = new Date();
    const timezone = this.messagingHours.timezone || 'Europe/Rome';
    
    // Converti l'ora corrente nel timezone del ristorante
    const currentHour = new Date(now.toLocaleString("en-US", { timeZone: timezone })).getHours();
    
    const startHour = this.messagingHours.startHour;
    const endHour = this.messagingHours.endHour;
    
    // Verifica se l'ora corrente è nell'intervallo consentito
    let canSend = false;
    
    if (startHour <= endHour) {
      // Caso normale: es. dalle 9 alle 23
      canSend = currentHour >= startHour && currentHour <= endHour;
    } else {
      // Caso che attraversa la mezzanotte: es. dalle 23 alle 9 (del giorno dopo)
      canSend = currentHour >= startHour || currentHour <= endHour;
    }
    
    if (canSend) {
      return { 
        canSend: true, 
        reason: `Orario consentito (${currentHour}:xx, fascia ${startHour}:00-${endHour}:59)` 
      };
    } else {
      return { 
        canSend: false, 
        reason: `Orario non consentito (${currentHour}:xx, fascia consentita ${startHour}:00-${endHour}:59)`,
        nextAllowedTime: this.getNextAllowedTime()
      };
    }
  } catch (error) {
    console.error('Error checking messaging hours:', error);
    // In caso di errore, permetti l'invio per sicurezza
    return { canSend: true, reason: 'Errore nel controllo fasce orarie, invio consentito' };
  }
};

// Metodo per calcolare il prossimo orario consentito per l'invio
BotConfigurationSchema.methods.getNextAllowedTime = function() {
  try {
    const now = new Date();
    const timezone = this.messagingHours.timezone || 'Europe/Rome';
    const startHour = this.messagingHours.startHour;
    
    // Crea una data per l'inizio della fascia oraria di oggi
    const todayStart = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    todayStart.setHours(startHour, 0, 0, 0);
    
    // Se l'orario di inizio di oggi è già passato, usa quello di domani
    if (todayStart <= now) {
      todayStart.setDate(todayStart.getDate() + 1);
    }
    
    return todayStart;
  } catch (error) {
    console.error('Error calculating next allowed time:', error);
    // Ritorna un'ora nel futuro come fallback
    return new Date(Date.now() + 60 * 60 * 1000);
  }
};

module.exports = mongoose.model('BotConfiguration', BotConfigurationSchema); 