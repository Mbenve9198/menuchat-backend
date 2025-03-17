const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AddressSchema = new Schema({
  street: {
    type: String,
    required: [true, 'Via/Piazza è obbligatoria']
  },
  streetNumber: {
    type: String,
    required: [true, 'Numero civico è obbligatorio']
  },
  city: {
    type: String,
    required: [true, 'Città è obbligatoria']
  },
  province: {
    type: String,
    required: [true, 'Provincia è obbligatoria']
  },
  postalCode: {
    type: String,
    required: [true, 'CAP è obbligatorio']
  },
  country: {
    type: String,
    required: [true, 'Paese è obbligatorio'],
    default: 'Italia'
  },
  latitude: Number,
  longitude: Number
}, { _id: false });

const ContactSchema = new Schema({
  phone: {
    type: String,
    required: [true, 'Numero di telefono è obbligatorio']
  },
  email: {
    type: String,
    match: [/^\S+@\S+\.\S+$/, 'Formato email non valido']
  },
  website: String,
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String
  }
}, { _id: false });

const OperatingHoursSchema = new Schema({
  day: {
    type: String,
    enum: ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'],
    required: true
  },
  open: Boolean, // true se aperto, false se chiuso
  openTime: String, // formato HH:MM
  closeTime: String, // formato HH:MM
  splitTimes: [{ // per gestire le pause pranzo/cena
    openTime: String,
    closeTime: String
  }]
}, { _id: false });

const RestaurantSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Proprietario è obbligatorio'],
    index: true // Indicizzazione per trovare ristoranti per proprietario
  },
  name: {
    type: String,
    required: [true, 'Nome del ristorante è obbligatorio'],
    trim: true,
    index: true // Indicizzazione per ricerche per nome
  },
  address: {
    type: AddressSchema,
    required: [true, 'Indirizzo è obbligatorio']
  },
  googlePlaceId: {
    type: String,
    sparse: true,
    index: true // Indicizzazione per cercare per Google Place ID
  },
  googleMapsUrl: String,
  googleRating: {
    rating: {
      type: Number,
      min: 0,
      max: 5
    },
    reviewCount: {
      type: Number,
      default: 0
    },
    lastUpdated: Date
  },
  customReviewLink: String,
  contact: {
    type: ContactSchema,
    required: [true, 'Informazioni di contatto sono obbligatorie']
  },
  operatingHours: [OperatingHoursSchema],
  description: {
    type: String,
    required: [true, 'Descrizione del ristorante è obbligatoria per il bot AI']
  },
  cuisineType: [String],
  features: [String], // es. ["Wi-Fi gratuito", "Terrazzo", "Pet-friendly"]
  isActive: {
    type: Boolean,
    default: true,
    index: true // Indicizzazione per trovare ristoranti attivi/inattivi
  }
}, {
  timestamps: true // Aggiunge automaticamente i campi createdAt e updatedAt
});

// Indicizzazione composta per ottimizzare query frequenti
RestaurantSchema.index({ user: 1, isActive: 1 });
RestaurantSchema.index({ 'address.city': 1, 'address.province': 1 });
RestaurantSchema.index({ 'address.postalCode': 1 });
RestaurantSchema.index({ cuisineType: 1 });

// Aggiunta del metodo fullAddress per ottenere l'indirizzo completo
RestaurantSchema.methods.fullAddress = function() {
  const addr = this.address;
  return `${addr.street}, ${addr.streetNumber}, ${addr.postalCode} ${addr.city} (${addr.province}), ${addr.country}`;
};

module.exports = mongoose.model('Restaurant', RestaurantSchema); 