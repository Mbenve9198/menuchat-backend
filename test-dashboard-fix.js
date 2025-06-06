require('dotenv').config();
const mongoose = require('mongoose');
const Restaurant = require('./models/Restaurant');
const googlePlacesService = require('./services/googlePlacesService');

async function testDashboardFix() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connesso a MongoDB');
    
    // Trova un ristorante con dati interessanti
    const restaurant = await Restaurant.findOne({ 
      name: "Arnold's",
      isActive: true 
    });
    
    if (!restaurant) {
      console.log('❌ Ristorante Arnold\'s non trovato');
      return;
    }
    
    console.log('🏪 Testando con ristorante:', restaurant.name);
    console.log('📊 Recensioni attuali:', restaurant.googleRating?.reviewCount || 0);
    console.log('📊 Recensioni iniziali:', restaurant.googleRating?.initialReviewCount || 0);
    console.log('📊 Differenza (metodo tradizionale):', (restaurant.googleRating?.reviewCount || 0) - (restaurant.googleRating?.initialReviewCount || 0));
    
    // Testa il calcolo per gli ultimi 7 giorni
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    console.log('\n📈 Testando calcolo recensioni periodo (ultimi 7 giorni)...');
    console.log('📅 Da:', startDate.toDateString());
    console.log('📅 A:', endDate.toDateString());
    
    const reviewsInPeriod = await googlePlacesService.getReviewsCollectedInPeriod(
      restaurant._id, 
      startDate, 
      endDate
    );
    
    console.log('📈 Recensioni raccolte nel periodo (nuovo sistema):', reviewsInPeriod);
    
    // Simula la logica del controller
    let finalReviewsCollected = reviewsInPeriod;
    const initialReviewCount = restaurant.googleRating?.initialReviewCount || 0;
    const currentReviewCount = restaurant.googleRating?.reviewCount || 0;
    
    if (finalReviewsCollected === 0 && currentReviewCount > initialReviewCount) {
      console.log('⚠️ Sistema snapshot restituisce 0, usando fallback al calcolo tradizionale');
      finalReviewsCollected = Math.max(0, currentReviewCount - initialReviewCount);
    }
    
    console.log('\n🎯 RISULTATO FINALE:');
    console.log('📊 Recensioni che verranno mostrate in dashboard:', finalReviewsCollected);
    console.log('📊 Initial Review Count:', initialReviewCount);
    console.log('📊 Current Review Count:', currentReviewCount);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Errore:', error);
    process.exit(1);
  }
}

testDashboardFix(); 