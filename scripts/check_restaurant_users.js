const mongoose = require('mongoose');
const Restaurant = require('../models/Restaurant');
const RestaurantMessage = require('../models/RestaurantMessage');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const User = require('../models/User');

const connectDB = async () => {
  try {
    const mongoURI = 'mongodb+srv://marco:XFpWdkYWfzA5KpWW@cluster0.cit5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoURI);
    console.log('✅ Connesso al database MongoDB');
  } catch (error) {
    console.error('❌ Errore connessione database:', error);
    process.exit(1);
  }
};

const checkRestaurantUsers = async () => {
  try {
    console.log('👥 IDENTIFICAZIONE UTENTI DEI RISTORANTI NON MIGRATI');
    console.log('=' * 60);
    
    // Trova tutti i ristoranti attivi
    const allRestaurants = await Restaurant.find({ isActive: true }).populate('user');
    
    console.log(`📊 TOTALE RISTORANTI ATTIVI: ${allRestaurants.length}`);
    
    // Categorizza i ristoranti per stato migrazione
    const restaurantsWithMessages = [];
    const restaurantsWithoutMessages = [];
    const partialCoverage = [];
    
    for (const restaurant of allRestaurants) {
      const menuCount = await RestaurantMessage.countDocuments({
        restaurant: restaurant._id,
        messageType: 'menu',
        isActive: true
      });
      
      const reviewCount = await RestaurantMessage.countDocuments({
        restaurant: restaurant._id,
        messageType: 'review',
        isActive: true
      });
      
      const templateCount = await WhatsAppTemplate.countDocuments({
        restaurant: restaurant._id,
        isActive: true
      });
      
      const restaurantData = {
        restaurant,
        menuCount,
        reviewCount,
        templateCount,
        user: restaurant.user
      };
      
      if (menuCount > 0 && reviewCount > 0) {
        restaurantsWithMessages.push(restaurantData);
      } else if (menuCount > 0 || reviewCount > 0) {
        partialCoverage.push(restaurantData);
      } else {
        restaurantsWithoutMessages.push(restaurantData);
      }
    }
    
    console.log(`\n✅ Ristoranti con migrazione COMPLETA: ${restaurantsWithMessages.length}`);
    console.log(`⚠️ Ristoranti con migrazione PARZIALE: ${partialCoverage.length}`);
    console.log(`❌ Ristoranti NON MIGRATI: ${restaurantsWithoutMessages.length}`);
    
    // Dettaglio ristoranti NON migrati
    if (restaurantsWithoutMessages.length > 0) {
      console.log(`\n🚨 RISTORANTI NON MIGRATI - DETTAGLIO:`);
      console.log('=' * 50);
      
      restaurantsWithoutMessages.forEach((data, index) => {
        const { restaurant, templateCount, user } = data;
        console.log(`\n${index + 1}. 🍽️ RISTORANTE: ${restaurant.name}`);
        console.log(`   📧 ID: ${restaurant._id}`);
        console.log(`   👤 PROPRIETARIO: ${user ? user.name : 'UTENTE NON TROVATO'}`);
        console.log(`   📧 Email proprietario: ${user ? user.email : 'N/A'}`);
        console.log(`   📋 Template WhatsApp disponibili: ${templateCount}`);
        console.log(`   📅 Creato: ${restaurant.createdAt ? restaurant.createdAt.toISOString().split('T')[0] : 'N/A'}`);
        console.log(`   🔧 Ultima modifica: ${restaurant.updatedAt ? restaurant.updatedAt.toISOString().split('T')[0] : 'N/A'}`);
        
        // Verifica se ha template
        if (templateCount === 0) {
          console.log(`   ⚠️ PROBLEMA: Nessun template WhatsApp disponibile`);
        } else {
          console.log(`   ✅ Ha ${templateCount} template da migrare`);
        }
      });
    }
    
    // Dettaglio ristoranti con migrazione PARZIALE
    if (partialCoverage.length > 0) {
      console.log(`\n⚠️ RISTORANTI CON MIGRAZIONE PARZIALE:`);
      console.log('=' * 50);
      
      partialCoverage.forEach((data, index) => {
        const { restaurant, menuCount, reviewCount, templateCount, user } = data;
        console.log(`\n${index + 1}. 🍽️ RISTORANTE: ${restaurant.name}`);
        console.log(`   👤 PROPRIETARIO: ${user ? user.name : 'UTENTE NON TROVATO'}`);
        console.log(`   📧 Email: ${user ? user.email : 'N/A'}`);
        console.log(`   📋 Template originali: ${templateCount}`);
        console.log(`   📝 RestaurantMessage: menu=${menuCount}, review=${reviewCount}`);
        
        if (menuCount === 0) {
          console.log(`   ❌ MANCA: Messaggi menu`);
        }
        if (reviewCount === 0) {
          console.log(`   ❌ MANCA: Messaggi recensione`);
        }
      });
    }
    
    // Analisi per utente
    console.log(`\n👥 ANALISI PER UTENTE:`);
    console.log('=' * 30);
    
    const userAnalysis = {};
    
    allRestaurants.forEach(restaurant => {
      const user = restaurant.user;
      if (!user) return;
      
      if (!userAnalysis[user._id]) {
        userAnalysis[user._id] = {
          user,
          restaurants: [],
          totalRestaurants: 0,
          migratedRestaurants: 0,
          partialRestaurants: 0,
          notMigratedRestaurants: 0
        };
      }
      
      userAnalysis[user._id].restaurants.push(restaurant);
      userAnalysis[user._id].totalRestaurants++;
    });
    
    // Calcola statistiche per utente
    for (const userId in userAnalysis) {
      const userData = userAnalysis[userId];
      
      for (const restaurant of userData.restaurants) {
        const isComplete = restaurantsWithMessages.some(r => r.restaurant._id.toString() === restaurant._id.toString());
        const isPartial = partialCoverage.some(r => r.restaurant._id.toString() === restaurant._id.toString());
        
        if (isComplete) {
          userData.migratedRestaurants++;
        } else if (isPartial) {
          userData.partialRestaurants++;
        } else {
          userData.notMigratedRestaurants++;
        }
      }
    }
    
    // Mostra risultati per utente
    Object.values(userAnalysis).forEach(userData => {
      const { user, totalRestaurants, migratedRestaurants, partialRestaurants, notMigratedRestaurants } = userData;
      
      console.log(`\n👤 UTENTE: ${user.name} (${user.email})`);
      console.log(`   📊 Ristoranti totali: ${totalRestaurants}`);
      console.log(`   ✅ Migrati completamente: ${migratedRestaurants}`);
      console.log(`   ⚠️ Migrazione parziale: ${partialRestaurants}`);
      console.log(`   ❌ Non migrati: ${notMigratedRestaurants}`);
      
      if (notMigratedRestaurants > 0 || partialRestaurants > 0) {
        console.log(`   🔧 RICHIEDE ATTENZIONE`);
        
        userData.restaurants.forEach(restaurant => {
          const isComplete = restaurantsWithMessages.some(r => r.restaurant._id.toString() === restaurant._id.toString());
          const isPartial = partialCoverage.some(r => r.restaurant._id.toString() === restaurant._id.toString());
          
          if (!isComplete) {
            const status = isPartial ? '⚠️ PARZIALE' : '❌ NON MIGRATO';
            console.log(`      - ${restaurant.name}: ${status}`);
          }
        });
      }
    });
    
    // Raccomandazioni finali
    console.log(`\n💡 RACCOMANDAZIONI:`);
    console.log('=' * 20);
    
    const usersWithProblems = Object.values(userAnalysis).filter(u => 
      u.notMigratedRestaurants > 0 || u.partialRestaurants > 0
    );
    
    if (usersWithProblems.length === 0) {
      console.log(`✅ TUTTI gli utenti hanno ristoranti completamente migrati!`);
    } else {
      console.log(`⚠️ ${usersWithProblems.length} utenti hanno ristoranti con problemi di migrazione:`);
      usersWithProblems.forEach(userData => {
        console.log(`   - ${userData.user.name} (${userData.user.email}): ${userData.notMigratedRestaurants + userData.partialRestaurants} ristoranti problematici`);
      });
      
      console.log(`\n🔧 PROSSIMI PASSI:`);
      console.log(`   1. Verificare se questi utenti sono attivi`);
      console.log(`   2. Controllare se i template sono validi`);
      console.log(`   3. Eseguire migrazione completamento per utenti attivi`);
      console.log(`   4. Eventualmente contattare utenti per template mancanti`);
    }
    
  } catch (error) {
    console.error('❌ Errore verifica utenti:', error);
  }
};

const main = async () => {
  try {
    await connectDB();
    await checkRestaurantUsers();
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnesso dal database');
  }
};

main(); 