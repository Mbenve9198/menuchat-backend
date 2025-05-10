const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContactSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Nome è obbligatorio'],
    trim: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Numero di telefono è obbligatorio'],
    index: true
  },
  countryCode: {
    type: String,
    default: 'IT' // Default a Italia
  },
  optIn: {
    type: Boolean,
    default: true // Opt-in di default come richiesto
  },
  // Metadati sulle interazioni
  firstContact: {
    type: Date,
    default: Date.now
  },
  lastContact: {
    type: Date,
    default: Date.now
  },
  interactionDates: [{
    type: Date
  }],
  totalInteractions: {
    type: Number,
    default: 1
  },
  // Contatore delle interazioni per giorno distinto
  uniqueDayInteractions: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Indici per ottimizzare le query
ContactSchema.index({ restaurant: 1, phoneNumber: 1 }, { unique: true });
ContactSchema.index({ restaurant: 1, lastContact: -1 });
ContactSchema.index({ restaurant: 1, totalInteractions: -1 });
ContactSchema.index({ restaurant: 1, uniqueDayInteractions: -1 });
ContactSchema.index({ restaurant: 1, optIn: 1 });

// Metodo per registrare una nuova interazione
ContactSchema.methods.recordInteraction = function() {
  const now = new Date();
  this.lastContact = now;
  
  // Aggiungi data alla lista delle interazioni
  this.interactionDates.push(now);
  
  // Incrementa contatore totale interazioni
  this.totalInteractions += 1;
  
  // Calcola il numero di giorni unici di interazione
  // Converti tutte le date al formato gg/mm/aaaa per contare solo giorni unici
  const uniqueDays = new Set();
  this.interactionDates.forEach(date => {
    const day = date.toISOString().split('T')[0]; // formato YYYY-MM-DD
    uniqueDays.add(day);
  });
  
  this.uniqueDayInteractions = uniqueDays.size;
  
  return this;
};

// Utility per ottenere il codice paese dal prefisso internazionale
ContactSchema.statics.getCountryCodeFromPhoneNumber = function(phoneNumber) {
  // Rimuovi eventuali spazi e simboli come + o -
  const cleanNumber = phoneNumber.replace(/\s+/g, '');
  
  // Mappa dei prefissi più comuni con i relativi codici paese
  const prefixMap = {
    '39': 'IT',  // Italia
    '1': 'US',   // Stati Uniti / Canada
    '44': 'GB',  // Regno Unito
    '33': 'FR',  // Francia
    '49': 'DE',  // Germania
    '34': 'ES',  // Spagna
    '351': 'PT', // Portogallo
    '41': 'CH',  // Svizzera
    '43': 'AT',  // Austria
    '32': 'BE',  // Belgio
    '31': 'NL',  // Paesi Bassi
    '45': 'DK',  // Danimarca
    '46': 'SE',  // Svezia
    '47': 'NO',  // Norvegia
    '358': 'FI', // Finlandia
    '420': 'CZ', // Repubblica Ceca
    '48': 'PL',  // Polonia
    '36': 'HU',  // Ungheria
    '30': 'GR',  // Grecia
    '7': 'RU',   // Russia
    '81': 'JP',  // Giappone
    '86': 'CN',  // Cina
    '91': 'IN',  // India
    '55': 'BR',  // Brasile
    '52': 'MX',  // Messico
    '61': 'AU',  // Australia
    '64': 'NZ'   // Nuova Zelanda
  };
  
  // Se il numero inizia con +, rimuovilo
  const normalizedNumber = cleanNumber.startsWith('+') ? cleanNumber.substring(1) : cleanNumber;
  
  // Prova a trovare una corrispondenza con i prefissi conosciuti
  for (const [prefix, code] of Object.entries(prefixMap)) {
    if (normalizedNumber.startsWith(prefix)) {
      return code;
    }
  }
  
  // Default a IT se non viene trovata corrispondenza
  return 'IT';
};

module.exports = mongoose.model('Contact', ContactSchema); 