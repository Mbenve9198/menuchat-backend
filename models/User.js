const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  email: {
    type: String,
    required: [true, 'Email è obbligatoria'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Formato email non valido'],
    index: true // Indicizzazione per le ricerche per email
  },
  passwordHash: {
    type: String,
    required: [true, 'Password hash è obbligatorio']
  },
  salt: {
    type: String,
    required: [true, 'Salt è obbligatorio']
  },
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: false,
    index: true
  },
  subscriptionTier: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free',
    index: true // Indicizzazione per filtrare per tier di abbonamento
  },
  languagePreference: {
    type: String,
    enum: ['italiano', 'english', 'español'],
    default: 'italiano'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true // Indicizzazione per trovare utenti per data di creazione
  },
  lastLogin: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true // Indicizzazione per trovare utenti attivi/inattivi
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, {
  timestamps: true // Aggiunge automaticamente i campi createdAt e updatedAt
});

// Metodo per controllare se l'account utente è premium
UserSchema.methods.isPremium = function() {
  return this.subscriptionTier === 'premium';
};

// Indicizzazione compound per query comuni
UserSchema.index({ email: 1, subscriptionTier: 1 });
UserSchema.index({ createdAt: -1 }); // Per ordinare per data di creazione

module.exports = mongoose.model('User', UserSchema); 