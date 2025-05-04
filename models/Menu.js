const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema per un menu in una specifica lingua
 */
const MenuSchema = new Schema({
  // Riferimento al ristorante
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  // Dettagli della lingua
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
  // Informazioni sul menu
  name: {
    type: String,
    default: 'Standard Menu'
  },
  description: String,
  // URL del menu (link esterno)
  menuUrl: String,
  // URL del PDF caricato su Cloudinary
  menuPdfUrl: String,
  // Nome originale del file PDF
  menuPdfName: String,
  // Cloudinary public ID per gestire le eliminazioni
  cloudinaryPublicId: String,
  // Flag per indicare se è un menu stagionale o speciale
  isDefault: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Campi per futura implementazione di menu strutturati
  categories: [{
    name: String,
    description: String,
    items: [{
      name: String,
      description: String,
      price: Number,
      imageUrl: String,
      allergens: [String],
      isAvailable: {
        type: Boolean,
        default: true
      }
    }]
  }],
  // Per memorizzare dati aggiuntivi in formato JSON senza schema fisso
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indici per ottimizzare le query più comuni
MenuSchema.index({ restaurant: 1, 'language.code': 1 });
MenuSchema.index({ restaurant: 1, isDefault: 1, isActive: 1 });

module.exports = mongoose.model('Menu', MenuSchema); 