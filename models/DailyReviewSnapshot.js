const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema per tracciare le recensioni giornaliere
 * Ogni documento rappresenta uno snapshot delle recensioni per un ristorante in una data specifica
 */
const DailyReviewSnapshotSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Data è obbligatoria'],
    index: true
  },
  // Snapshot delle recensioni Google al momento del sync
  googleReviewSnapshot: {
    totalReviews: {
      type: Number,
      required: true,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0
    },
    // Recensioni raccolte in questo giorno specifico (calcolate dalla differenza)
    newReviewsToday: {
      type: Number,
      default: 0
    },
    // Timestamp del sync
    syncedAt: {
      type: Date,
      default: Date.now
    }
  },
  // Tipo di sync (automatico giornaliero o manuale)
  syncType: {
    type: String,
    enum: ['daily_auto', 'manual', 'initial'],
    default: 'daily_auto'
  },
  // Flag per indicare se questo è il primo snapshot (baseline)
  isInitialSnapshot: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indice composto per garantire un solo snapshot per ristorante per giorno
DailyReviewSnapshotSchema.index({ restaurant: 1, date: 1 }, { unique: true });

// Indice per query temporali
DailyReviewSnapshotSchema.index({ date: -1 });

// Metodo statico per calcolare le recensioni raccolte in un periodo
DailyReviewSnapshotSchema.statics.calculateReviewsCollectedInPeriod = async function(restaurantId, startDate, endDate) {
  try {
    const snapshots = await this.find({
      restaurant: restaurantId,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: 1 });

    // Somma tutte le nuove recensioni nel periodo
    const totalNewReviews = snapshots.reduce((sum, snapshot) => {
      return sum + (snapshot.googleReviewSnapshot.newReviewsToday || 0);
    }, 0);

    return totalNewReviews;
  } catch (error) {
    console.error('Errore nel calcolo recensioni periodo:', error);
    return 0;
  }
};

// Metodo statico per ottenere l'ultimo snapshot di un ristorante
DailyReviewSnapshotSchema.statics.getLatestSnapshot = async function(restaurantId) {
  try {
    return await this.findOne({
      restaurant: restaurantId
    }).sort({ date: -1 });
  } catch (error) {
    console.error('Errore nel recupero ultimo snapshot:', error);
    return null;
  }
};

module.exports = mongoose.model('DailyReviewSnapshot', DailyReviewSnapshotSchema); 