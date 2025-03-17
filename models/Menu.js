const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema per gli elementi del menu
const MenuItemSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Nome dell\'elemento del menu è obbligatorio']
  },
  description: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: [true, 'Prezzo è obbligatorio'],
    min: 0
  },
  priceFormatted: {
    type: String, // Per salvare il prezzo formattato (es. "12,50 €")
  },
  dietaryInfo: {
    isVegetarian: { type: Boolean, default: false },
    isVegan: { type: Boolean, default: false },
    isGlutenFree: { type: Boolean, default: false },
    isLactoseFree: { type: Boolean, default: false },
    containsAllergens: [String] // Array di allergeni
  },
  recommended: {
    type: Boolean,
    default: false
  },
  imageUrl: String,
  available: {
    type: Boolean,
    default: true
  },
  // Supporto multi-lingua
  translations: {
    en: {
      name: String,
      description: String
    },
    es: {
      name: String,
      description: String
    }
  }
}, { _id: true });

// Schema per le sezioni del menu
const MenuSectionSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Nome della sezione è obbligatorio']
  },
  description: String,
  order: {
    type: Number,
    default: 0 // Per ordinare le sezioni
  },
  items: [MenuItemSchema],
  // Supporto multi-lingua
  translations: {
    en: {
      name: String,
      description: String
    },
    es: {
      name: String,
      description: String
    }
  }
}, { _id: true });

// Schema principale del menu
const MenuSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true // Indicizzazione per trovare menu per ristorante
  },
  name: {
    type: String,
    required: [true, 'Nome del menu è obbligatorio'],
    trim: true
  },
  sourceType: {
    type: String,
    enum: ['pdfUpload', 'url', 'aiGenerated', 'manual'],
    required: [true, 'Tipo di fonte è obbligatorio']
  },
  sourceUrl: String,
  filePath: String,
  pdfMetadata: {
    fileName: String,
    fileSize: Number,
    uploadDate: Date,
    pageCount: Number
  },
  sections: [MenuSectionSchema],
  isActive: {
    type: Boolean,
    default: true,
    index: true // Indicizzazione per trovare menu attivi
  },
  // Supporto multi-lingua per il nome e le informazioni del menu
  translations: {
    en: {
      name: String,
      description: String
    },
    es: {
      name: String,
      description: String
    }
  },
  lastProcessed: Date, // Data dell'ultima elaborazione AI
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'error'],
    default: 'pending'
  },
  processingError: String,
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true // Aggiunge automaticamente i campi createdAt e updatedAt
});

// Indicizzazione per query frequenti
MenuSchema.index({ restaurant: 1, isActive: 1 });
MenuSchema.index({ restaurant: 1, sourceType: 1 });
MenuSchema.index({ restaurant: 1, 'processingStatus': 1 });
MenuSchema.index({ restaurant: 1, isDefault: 1 });

// Metodo per trovare elementi specifici nel menu
MenuSchema.methods.findItemByName = function(itemName) {
  for (const section of this.sections) {
    const item = section.items.find(item => 
      item.name.toLowerCase().includes(itemName.toLowerCase()));
    if (item) return item;
  }
  return null;
};

// Metodo per ottenere tutti gli elementi raccomandati
MenuSchema.methods.getRecommendedItems = function() {
  const recommendedItems = [];
  for (const section of this.sections) {
    for (const item of section.items) {
      if (item.recommended) {
        recommendedItems.push({
          item,
          sectionName: section.name
        });
      }
    }
  }
  return recommendedItems;
};

module.exports = mongoose.model('Menu', MenuSchema); 