const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema semplificato per l'indirizzo per adattarsi meglio ai dati di Google Places
const AddressSchema = new Schema({
  formattedAddress: {
    type: String,
    required: [true, 'Indirizzo completo è obbligatorio']
  },
  // Campi opzionali se disponibili da Google Places
  street: String,
  streetNumber: String,
  city: String,
  province: String,
  postalCode: String,
  country: {
    type: String,
    default: 'Italia'
  },
  latitude: Number,
  longitude: Number
}, { _id: false });

const ContactSchema = new Schema({
  phone: {
    type: String,
    required: false // Reso non obbligatorio se non disponibile da Google Places
  },
  email: {
    type: String,
    match: [/^\S+@\S+\.\S+$/, 'Formato email non valido'],
    required: false
  },
  website: String,
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String
  }
}, { _id: false });

// Schema semplificato per gli orari di apertura
const OperatingHoursSchema = new Schema({
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'],
    required: true
  },
  open: {
    type: Boolean,
    default: true
  },
  periods: [{
    open: String, // formato HH:MM
    close: String // formato HH:MM
  }],
  // Conserviamo il formato originale da Google Places
  rawText: String
}, { _id: false });

const RestaurantSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Proprietario è obbligatorio'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Nome del ristorante è obbligatorio'],
    trim: true,
    index: true
  },
  address: {
    type: AddressSchema,
    required: [true, 'Indirizzo è obbligatorio']
  },
  googlePlaceId: {
    type: String,
    sparse: true,
    index: true
  },
  googleMapsUrl: String,
  // Aggiunto campo per le foto del ristorante
  photos: [String],
  // Foto principale del ristorante (per l'identificativo visivo)
  mainPhoto: String,
  // Formato semplificato per i rating da Google
  googleRating: {
    rating: Number,
    reviewCount: Number,
    initialReviewCount: Number,
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  // Sistema di gamification
  gamification: {
    level: {
      type: Number,
      default: 1
    },
    totalExperience: {
      type: Number,
      default: 0
    },
    weeklyStreak: {
      type: Number,
      default: 0
    },
    longestStreak: {
      type: Number,
      default: 0
    },
    lastWeeklyGoalCompleted: Date,
    achievements: [{
      id: String,
      name: String,
      description: String,
      unlockedAt: {
        type: Date,
        default: Date.now
      },
      category: {
        type: String,
        enum: ['reviews', 'streak', 'level', 'special']
      }
    }],
    weeklyGoalHistory: [{
      weekStart: {
        type: Date,
        required: true
      },
      target: {
        type: Number,
        required: true
      },
      achieved: {
        type: Number,
        default: 0
      },
      completed: {
        type: Boolean,
        default: false
      }
    }]
  },
  // Conserviamo anche le recensioni se disponibili
  reviews: [{
    authorName: String,
    rating: Number,
    text: String,
    time: Date
  }],
  customReviewLink: String,
  reviewPlatform: {
    type: String,
    enum: ['google', 'yelp', 'tripadvisor', 'custom'],
    default: 'google'
  },
  contact: {
    type: ContactSchema,
    default: {} // Impostato come oggetto vuoto di default per evitare errori
  },
  operatingHours: [OperatingHoursSchema],
  description: {
    type: String,
    required: false // Reso non obbligatorio inizialmente, può essere generato dopo
  },
  // Rinominato per coerenza con i dati di Google Places
  cuisineTypes: [String],
  priceLevel: {
    type: Number,
    min: 0,
    max: 4 // Google usa 0-4 per i livelli di prezzo
  },
  features: [String], // es. ["Wi-Fi gratuito", "Terrazzo", "Pet-friendly"]
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Mantenuti gli indici per ottimizzare le query
RestaurantSchema.index({ user: 1, isActive: 1 });
RestaurantSchema.index({ 'address.city': 1, 'address.province': 1 });
RestaurantSchema.index({ cuisineTypes: 1 });

// Metodo fullAddress adattato al nuovo schema
RestaurantSchema.methods.fullAddress = function() {
  return this.address.formattedAddress;
};

module.exports = mongoose.model('Restaurant', RestaurantSchema); 