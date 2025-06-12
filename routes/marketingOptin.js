const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const WhatsAppContact = require('../models/WhatsAppContact');
const { authenticateToken } = require('../middleware/auth');

// GET /api/marketing-optin - Ottieni configurazione opt-in
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { restaurantId } = req.query;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID è richiesto'
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Ristorante non trovato'
      });
    }

    // Restituisci la configurazione opt-in o quella di default
    const config = {
      enabled: restaurant.marketingOptinConfig?.enabled || false,
      messages: restaurant.marketingOptinConfig?.messages || new Map([
        ['it', {
          title: "🍽️ Resta aggiornato!",
          message: "Vuoi ricevere le nostre offerte esclusive e novità del menu direttamente su WhatsApp? Solo roba d'oro, promesso! 🌟",
          checkboxText: "Sì, voglio ricevere offerte esclusive",
          continueButton: "Continua al Menu",
          skipButton: "Salta"
        }]
      ]),
      stats: restaurant.marketingOptinConfig?.stats || {
        totalViews: 0,
        totalOptins: 0,
        totalSkips: 0
      }
    };

    res.json({
      success: true,
      config
    });

  } catch (error) {
    console.error('Error fetching marketing optin config:', error);
    res.status(500).json({
      success: false,
      error: 'Errore interno del server'
    });
  }
});

// POST /api/marketing-optin - Salva configurazione opt-in
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { restaurantId, config } = req.body;

    if (!restaurantId || !config) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID e configurazione sono richiesti'
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Ristorante non trovato'
      });
    }

    // Aggiorna la configurazione
    restaurant.marketingOptinConfig = {
      enabled: config.enabled,
      messages: new Map(Object.entries(config.messages)),
      stats: config.stats || {
        totalViews: 0,
        totalOptins: 0,
        totalSkips: 0
      }
    };

    await restaurant.save();

    res.json({
      success: true,
      message: 'Configurazione salvata con successo'
    });

  } catch (error) {
    console.error('Error saving marketing optin config:', error);
    res.status(500).json({
      success: false,
      error: 'Errore interno del server'
    });
  }
});

// POST /api/marketing-optin/generate - Genera messaggio con AI
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { restaurantId, prompt, language, restaurantName } = req.body;

    if (!restaurantId || !prompt || !language) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID, prompt e lingua sono richiesti'
      });
    }

    // Qui integreresti con OpenAI o altro servizio AI
    // Per ora restituisco un messaggio di esempio basato sul prompt
    const generatedMessage = {
      title: language === 'it' ? "🍽️ Offerta Speciale!" : "🍽️ Special Offer!",
      message: language === 'it' 
        ? `Ciao! ${restaurantName} ha preparato qualcosa di speciale per te. ${prompt} Vuoi essere il primo a saperlo? 🌟`
        : `Hi! ${restaurantName} has prepared something special for you. ${prompt} Want to be the first to know? 🌟`,
      checkboxText: language === 'it' 
        ? "Sì, voglio le offerte esclusive!" 
        : "Yes, I want exclusive offers!",
      continueButton: language === 'it' ? "Continua al Menu" : "Continue to Menu",
      skipButton: language === 'it' ? "Salta" : "Skip"
    };

    res.json({
      success: true,
      message: generatedMessage
    });

  } catch (error) {
    console.error('Error generating AI message:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella generazione del messaggio'
    });
  }
});

// POST /api/marketing-optin/track - Traccia interazione utente
router.post('/track', async (req, res) => {
  try {
    const { restaurantId, phoneNumber, action, ipAddress, userAgent } = req.body;

    if (!restaurantId || !phoneNumber || !action) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID, numero di telefono e azione sono richiesti'
      });
    }

    // Trova o crea il contatto
    const contact = await WhatsAppContact.findOrCreate(restaurantId, phoneNumber);
    
    // Aggiorna le statistiche del ristorante
    const restaurant = await Restaurant.findById(restaurantId);
    if (restaurant && restaurant.marketingOptinConfig) {
      if (action === 'view') {
        restaurant.marketingOptinConfig.stats.totalViews += 1;
      } else if (action === 'optin') {
        restaurant.marketingOptinConfig.stats.totalOptins += 1;
        // Registra la scelta dell'utente
        await contact.setMenuOptinChoice(true, ipAddress, userAgent);
      } else if (action === 'skip') {
        restaurant.marketingOptinConfig.stats.totalSkips += 1;
        // Registra la scelta dell'utente
        await contact.setMenuOptinChoice(false, ipAddress, userAgent);
      }
      
      await restaurant.save();
    }

    res.json({
      success: true,
      message: 'Interazione tracciata con successo'
    });

  } catch (error) {
    console.error('Error tracking interaction:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel tracciamento'
    });
  }
});

module.exports = router; 