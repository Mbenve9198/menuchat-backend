require('dotenv').config();
const mongoose = require('mongoose');
const DailyReviewSnapshot = require('./models/DailyReviewSnapshot');
const Restaurant = require('./models/Restaurant');
const googlePlacesService = require('./services/googlePlacesService');

async function testNewReviewSystem() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connesso a MongoDB');
    
    // Trova un ristorante di test
    const restaurant = await Restaurant.findOne({ 
      isActive: true, 
      googlePlaceId: { $exists: true, $ne: null } 
    });
    
    if (!restaurant) {
      console.log('❌ Nessun ristorante trovato per il test');
      return;
    }
    
    console.log('🏪 Testando con ristorante:', restaurant.name);
    console.log('📊 Recensioni attuali:', restaurant.googleRating?.reviewCount || 0);
    console.log('📊 Recensioni iniziali:', restaurant.googleRating?.initialReviewCount || 0);
    
    // Crea uno snapshot di test
    console.log('\n📸 Creando snapshot di test...');
    const snapshot = await googlePlacesService.createDailySnapshot(restaurant, 'manual');
    console.log('✅ Snapshot creato:', {
      date: snapshot.date.toDateString(),
      totalReviews: snapshot.googleReviewSnapshot.totalReviews,
      newReviewsToday: snapshot.googleReviewSnapshot.newReviewsToday,
      isInitial: snapshot.isInitialSnapshot
    });
    
    // Testa il calcolo delle recensioni in un periodo
    console.log('\n📈 Testando calcolo recensioni periodo...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const reviewsInPeriod = await googlePlacesService.getReviewsCollectedInPeriod(
      restaurant._id, 
      yesterday, 
      today
    );
    console.log('📈 Recensioni raccolte nel periodo:', reviewsInPeriod);
    
    // Testa le statistiche giornaliere
    console.log('\n📊 Testando statistiche giornaliere...');
    const dailyStats = await googlePlacesService.getDailyReviewStats(restaurant._id);
    console.log('📊 Statistiche giornaliere:', dailyStats);
    
    // Mostra tutti gli snapshot esistenti per questo ristorante
    console.log('\n📋 Snapshot esistenti:');
    const allSnapshots = await DailyReviewSnapshot.find({ 
      restaurant: restaurant._id 
    }).sort({ date: -1 }).limit(5);
    
    allSnapshots.forEach(snap => {
      console.log(`   ${snap.date.toDateString()}: ${snap.googleReviewSnapshot.newReviewsToday} nuove recensioni (totale: ${snap.googleReviewSnapshot.totalReviews})`);
    });
    
    console.log('\n✅ Test completato con successo!');
    
  } catch (error) {
    console.error('❌ Errore test:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testNewReviewSystem(); 