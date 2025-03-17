const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema per le statistiche periodiche (giornaliere, settimanali, mensili)
const PeriodStatsSchema = new Schema({
  periodType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  // Statistiche menu
  menuStats: {
    totalScans: {
      type: Number,
      default: 0
    },
    uniqueVisitors: {
      type: Number,
      default: 0
    },
    popularItems: [{
      itemId: {
        type: Schema.Types.ObjectId,
        ref: 'Menu.sections.items'
      },
      itemName: String,
      viewCount: Number
    }],
    averageViewTime: Number, // in secondi
    peakHours: [{
      hour: Number, // 0-23
      count: Number
    }]
  },
  // Statistiche recensioni
  reviewStats: {
    requestsSent: {
      type: Number,
      default: 0
    },
    reviewsCompleted: {
      type: Number,
      default: 0
    },
    conversionRate: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0
    },
    platformBreakdown: {
      google: { type: Number, default: 0 },
      tripadvisor: { type: Number, default: 0 },
      facebook: { type: Number, default: 0 },
      custom: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    }
  },
  // Statistiche interazioni
  interactionStats: {
    totalInteractions: {
      type: Number,
      default: 0
    },
    uniqueUsers: {
      type: Number,
      default: 0
    },
    averageInteractionsPerUser: {
      type: Number,
      default: 0
    },
    interactionsByType: {
      menuViewed: { type: Number, default: 0 },
      infoRequested: { type: Number, default: 0 },
      orderIntent: { type: Number, default: 0 },
      reviewRequested: { type: Number, default: 0 },
      reviewCompleted: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    }
  }
}, { _id: true });

// Schema principale per le analitiche
const AnalyticsSchema = new Schema({
  restaurant: {
    type: Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Ristorante è obbligatorio'],
    index: true // Indicizzazione per trovare analitiche per ristorante
  },
  // Array di statistiche periodiche
  stats: [PeriodStatsSchema],
  // Totali complessivi dall'inizio
  cumulativeStats: {
    totalScans: {
      type: Number,
      default: 0
    },
    totalReviewsRequested: {
      type: Number,
      default: 0
    },
    totalReviewsCompleted: {
      type: Number,
      default: 0
    },
    totalUniqueVisitors: {
      type: Number,
      default: 0
    },
    lifetimeConversionRate: {
      type: Number,
      default: 0
    },
    // Data in cui è stato raggiunto un determinato traguardo
    milestones: {
      first100Scans: Date,
      first10Reviews: Date,
      first1000Scans: Date
    }
  },
  // Data ultimo aggiornamento statistiche
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Aggiunge automaticamente i campi createdAt e updatedAt
});

// Indicizzazione composta per query frequenti
AnalyticsSchema.index({ restaurant: 1, 'stats.periodType': 1, 'stats.startDate': -1 });
AnalyticsSchema.index({ restaurant: 1, lastUpdated: -1 });

// Metodo statico per aggregare le statistiche giornaliere per una settimana
AnalyticsSchema.statics.aggregateWeeklyStats = async function(restaurantId, startDate, endDate) {
  const dailyStats = await this.find({
    restaurant: restaurantId,
    'stats.periodType': 'daily',
    'stats.startDate': { $gte: startDate, $lte: endDate }
  }).lean();
  
  // Logica di aggregazione qui
  // ...
  
  return {
    periodType: 'weekly',
    startDate,
    endDate,
    // Dati aggregati
    // ...
  };
};

// Metodo per calcolare i tassi di conversione
AnalyticsSchema.methods.calculateConversionRates = function() {
  for (const stat of this.stats) {
    const { reviewsSent, reviewsCompleted } = stat.reviewStats;
    if (reviewsSent > 0) {
      stat.reviewStats.conversionRate = (reviewsCompleted / reviewsSent) * 100;
    }
  }
  
  const { totalReviewsRequested, totalReviewsCompleted } = this.cumulativeStats;
  if (totalReviewsRequested > 0) {
    this.cumulativeStats.lifetimeConversionRate = 
      (totalReviewsCompleted / totalReviewsRequested) * 100;
  }
  
  return this;
};

module.exports = mongoose.model('Analytics', AnalyticsSchema); 