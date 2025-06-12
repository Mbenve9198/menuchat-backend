const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const WhatsAppContact = require('../models/WhatsAppContact');
const { protect } = require('../middleware/authMiddleware');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// GET /api/marketing-optin - Ottieni configurazione opt-in
router.get('/', protect, async (req, res) => {
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
router.post('/', protect, async (req, res) => {
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
router.post('/generate', protect, async (req, res) => {
  try {
    const { restaurantId, prompt, language, restaurantName } = req.body;

    if (!restaurantId || !prompt || !language) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID, prompt e lingua sono richiesti'
      });
    }

    // Ottieni informazioni del ristorante per un prompt più accurato
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Ristorante non trovato'
      });
    }

    // Definisci le istruzioni per lingua
    const languageInstructions = {
      it: {
        systemPrompt: "Sei un esperto di marketing per ristoranti. Crea un messaggio di opt-in marketing accattivante per WhatsApp.",
        requirements: [
          "Crea un titolo breve e accattivante (max 30 caratteri) con emoji",
          "Scrivi un messaggio principale coinvolgente (max 120 caratteri)",
          "Il messaggio deve essere amichevole e non invadente",
          "Usa emoji appropriati ma senza esagerare (max 2-3)",
          "Concentrati sui benefici per il cliente",
          "Evita linguaggio troppo commerciale o aggressivo",
          "Il testo del checkbox deve essere breve e chiaro",
          "I pulsanti devono essere semplici e diretti"
        ]
      },
      en: {
        systemPrompt: "You are a restaurant marketing expert. Create an engaging marketing opt-in message for WhatsApp.",
        requirements: [
          "Create a short and catchy title (max 30 characters) with emoji",
          "Write an engaging main message (max 120 characters)",
          "The message should be friendly and non-intrusive",
          "Use appropriate emojis but don't overdo it (max 2-3)",
          "Focus on customer benefits",
          "Avoid overly commercial or aggressive language",
          "Checkbox text should be short and clear",
          "Buttons should be simple and direct"
        ]
      },
      es: {
        systemPrompt: "Eres un experto en marketing para restaurantes. Crea un mensaje de opt-in marketing atractivo para WhatsApp.",
        requirements: [
          "Crea un título corto y atractivo (máx 30 caracteres) con emoji",
          "Escribe un mensaje principal atractivo (máx 120 caracteres)",
          "El mensaje debe ser amigable y no intrusivo",
          "Usa emojis apropiados pero sin exagerar (máx 2-3)",
          "Enfócate en los beneficios para el cliente",
          "Evita lenguaje demasiado comercial o agresivo",
          "El texto del checkbox debe ser corto y claro",
          "Los botones deben ser simples y directos"
        ]
      },
      fr: {
        systemPrompt: "Vous êtes un expert en marketing pour restaurants. Créez un message d'opt-in marketing engageant pour WhatsApp.",
        requirements: [
          "Créez un titre court et accrocheur (max 30 caractères) avec emoji",
          "Rédigez un message principal engageant (max 120 caractères)",
          "Le message doit être amical et non intrusif",
          "Utilisez des emojis appropriés sans exagérer (max 2-3)",
          "Concentrez-vous sur les avantages pour le client",
          "Évitez un langage trop commercial ou agressif",
          "Le texte de la case à cocher doit être court et clair",
          "Les boutons doivent être simples et directs"
        ]
      },
      de: {
        systemPrompt: "Sie sind ein Restaurant-Marketing-Experte. Erstellen Sie eine ansprechende Marketing-Opt-in-Nachricht für WhatsApp.",
        requirements: [
          "Erstellen Sie einen kurzen und eingängigen Titel (max 30 Zeichen) mit Emoji",
          "Schreiben Sie eine ansprechende Hauptnachricht (max 120 Zeichen)",
          "Die Nachricht sollte freundlich und nicht aufdringlich sein",
          "Verwenden Sie angemessene Emojis, aber übertreiben Sie nicht (max 2-3)",
          "Konzentrieren Sie sich auf Kundenvorteile",
          "Vermeiden Sie zu kommerzielle oder aggressive Sprache",
          "Der Checkbox-Text sollte kurz und klar sein",
          "Die Schaltflächen sollten einfach und direkt sein"
        ]
      }
    };

    const langInstructions = languageInstructions[language] || languageInstructions.en;

    const promptContent = `${langInstructions.systemPrompt}

Informazioni Ristorante:
- Nome: ${restaurant.name}
- Valutazione: ${restaurant.googleRating?.rating || 'N/A'}/5 (${restaurant.googleRating?.ratingsTotal || 0} recensioni)
- Cucina: ${restaurant.cuisineTypes?.join(', ') || 'Varia'}

Prompt dell'utente: "${prompt}"

Requisiti:
${langInstructions.requirements.map(req => `- ${req}`).join('\n')}

IMPORTANTE: Rispondi SOLO con un oggetto JSON nel seguente formato (senza spiegazioni aggiuntive):
{
  "title": "Titolo con emoji",
  "message": "Messaggio principale coinvolgente",
  "checkboxText": "Testo per il checkbox",
  "continueButton": "Testo pulsante continua",
  "skipButton": "Testo pulsante salta"
}

${language !== 'en' ? `IMPORTANTE: Tutto il contenuto DEVE essere in lingua ${language}.` : ''}`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 800,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: promptContent
        }
      ]
    });

    let generatedContent = response.content[0].text.trim();
    
    // Rimuovi eventuali backticks o formattazione markdown
    generatedContent = generatedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    try {
      const generatedMessage = JSON.parse(generatedContent);
      
      // Validazione dei campi richiesti
      if (!generatedMessage.title || !generatedMessage.message || !generatedMessage.checkboxText || 
          !generatedMessage.continueButton || !generatedMessage.skipButton) {
        throw new Error('Campi mancanti nella risposta AI');
      }

      res.json({
        success: true,
        message: generatedMessage
      });

    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.error('AI Response:', generatedContent);
      
      // Fallback con messaggio di default
      const fallbackMessage = {
        title: language === 'it' ? "🍽️ Offerte Esclusive!" : "🍽️ Exclusive Offers!",
        message: language === 'it' 
          ? `${restaurant.name} ha preparato qualcosa di speciale per te! ${prompt} 🌟`
          : `${restaurant.name} has prepared something special for you! ${prompt} 🌟`,
        checkboxText: language === 'it' 
          ? "Sì, voglio le offerte esclusive!" 
          : "Yes, I want exclusive offers!",
        continueButton: language === 'it' ? "Continua al Menu" : "Continue to Menu",
        skipButton: language === 'it' ? "Salta" : "Skip"
      };

      res.json({
        success: true,
        message: fallbackMessage,
        warning: 'Usato messaggio di fallback a causa di errore AI'
      });
    }

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