require('dotenv').config();
const mongoose = require('mongoose');
const Restaurant = require('./models/Restaurant');
const googlePlacesService = require('./services/googlePlacesService');

async function createInitialSnapshots() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connesso a MongoDB');
    
    const restaurants = await Restaurant.find({ 
      isActive: true,
      googlePlaceId: { $exists: true, $ne: null }
    });
    
    console.log(`🏪 Trovati ${restaurants.length} ristoranti attivi con Google Place ID`);
    
    for (const restaurant of restaurants) {
      console.log(`\n📸 Creando snapshot iniziale per: ${restaurant.name}`);
      console.log(`   - Recensioni attuali: ${restaurant.googleRating?.reviewCount || 0}`);
      console.log(`   - Recensioni iniziali: ${restaurant.googleRating?.initialReviewCount || 0}`);
      
      try {
        // Crea uno snapshot iniziale per oggi
        const snapshot = await googlePlacesService.createDailySnapshot(restaurant, 'initial');
        
        console.log(`   ✅ Snapshot creato:`);
        console.log(`      - Data: ${snapshot.date.toDateString()}`);
        console.log(`      - Totale recensioni: ${snapshot.googleReviewSnapshot.totalReviews}`);
        console.log(`      - Nuove recensioni oggi: ${snapshot.googleReviewSnapshot.newReviewsToday}`);
        console.log(`      - È snapshot iniziale: ${snapshot.isInitialSnapshot}`);
        
      } catch (error) {
        console.error(`   ❌ Errore creando snapshot per ${restaurant.name}:`, error.message);
      }
    }
    
    console.log('\n🎉 Processo completato!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Errore:', error);
    process.exit(1);
  }
}

createInitialSnapshots(); 