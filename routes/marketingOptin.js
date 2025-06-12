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
    const defaultMessages = {
      'it': {
        title: "🍽️ Prima di accedere al menu...",
        message: "Ciao {customerName}! Prima di mostrarti il delizioso menu di {restaurantName}, vorresti ricevere le nostre offerte esclusive e novità direttamente su WhatsApp? Solo contenuti di qualità, promesso! 🌟",
        acceptButton: "Accetta e Continua",
        skipButton: "Continua senza accettare"
      },
      'en': {
        title: "🍽️ Before accessing the menu...",
        message: "Hi {customerName}! Before showing you {restaurantName}'s delicious menu, would you like to receive our exclusive offers and news directly on WhatsApp? Only quality content, promised! 🌟",
        acceptButton: "Accept and Continue",
        skipButton: "Continue without accepting"
      },
      'es': {
        title: "🍽️ Antes de acceder al menú...",
        message: "¡Hola {customerName}! Antes de mostrarte el delicioso menú de {restaurantName}, ¿te gustaría recibir nuestras ofertas exclusivas y novedades directamente en WhatsApp? ¡Solo contenido de calidad, prometido! 🌟",
        acceptButton: "Aceptar y Continuar",
        skipButton: "Continuar sin aceptar"
      },
      'fr': {
        title: "🍽️ Avant d'accéder au menu...",
        message: "Salut {customerName}! Avant de te montrer le délicieux menu de {restaurantName}, aimerais-tu recevoir nos offres exclusives et nouveautés directement sur WhatsApp? Seulement du contenu de qualité, promis! 🌟",
        acceptButton: "Accepter et Continuer",
        skipButton: "Continuer sans accepter"
      },
      'de': {
        title: "🍽️ Bevor Sie das Menü sehen...",
        message: "Hallo {customerName}! Bevor wir Ihnen das köstliche Menü von {restaurantName} zeigen, möchten Sie unsere exklusiven Angebote und Neuigkeiten direkt über WhatsApp erhalten? Nur Qualitätsinhalt, versprochen! 🌟",
        acceptButton: "Akzeptieren und Weiter",
        skipButton: "Ohne Akzeptieren fortfahren"
      }
    };

    // Converti la Map in oggetto normale se esiste, altrimenti usa i messaggi di default
    let messages = defaultMessages;
    if (restaurant.marketingOptinConfig?.messages) {
      // Se è già un oggetto normale, usalo direttamente
      if (typeof restaurant.marketingOptinConfig.messages === 'object' && 
          !restaurant.marketingOptinConfig.messages instanceof Map) {
        messages = restaurant.marketingOptinConfig.messages;
      } else {
        // Se è una Map, convertila in oggetto normale
        messages = Object.fromEntries(restaurant.marketingOptinConfig.messages);
      }
    }

    const config = {
      enabled: restaurant.marketingOptinConfig?.enabled || false,
      messages: messages,
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
        systemPrompt: "Sei un esperto di marketing per ristoranti. Crea un messaggio di opt-in marketing per WhatsApp che viene mostrato PRIMA che l'utente veda il menu del ristorante.",
        requirements: [
          "Crea un titolo che chiarisca che è uno step prima di accedere al menu (max 40 caratteri) con emoji",
          "Il messaggio deve iniziare riferendosi al fatto che è prima di mostrare il menu",
          "Includi la personalizzazione con {customerName} nel messaggio",
          "Scrivi un messaggio principale coinvolgente (max 150 caratteri)",
          "Il messaggio deve essere amichevole e spiegare che dopo potrà comunque vedere il menu",
          "Menziona che potrà revocare il consenso tramite 'Unsubscribe' nei messaggi futuri",
          "Usa emoji appropriati ma senza esagerare (max 2-3)",
          "Concentrati sui benefici per il cliente (offerte esclusive, novità, etc.)",
          "Evita linguaggio troppo commerciale o aggressivo",
          "Il pulsante di accettazione deve essere invitante e rassicurante",
          "Il pulsante di rifiuto deve essere neutro (es: 'Continua senza accettare')"
        ]
      },
      en: {
        systemPrompt: "You are a restaurant marketing expert. Create a marketing opt-in message for WhatsApp that is shown BEFORE the user sees the restaurant menu.",
        requirements: [
          "Create a title that clarifies this is a step before accessing the menu (max 40 characters) with emoji",
          "The message should start by referring to the fact that it's before showing the menu",
          "Include personalization with {customerName} in the message",
          "Write an engaging main message (max 150 characters)",
          "The message should be friendly and explain they can see the menu anyway",
          "Mention they can revoke consent via 'Unsubscribe' in future messages",
          "Use appropriate emojis but don't overdo it (max 2-3)",
          "Focus on customer benefits (exclusive offers, news, etc.)",
          "Avoid overly commercial or aggressive language",
          "The accept button should be inviting and reassuring",
          "The decline button should be neutral (e.g., 'Continue without accepting')"
        ]
      },
      es: {
        systemPrompt: "Eres un experto en marketing para restaurantes. Crea un mensaje de opt-in marketing para WhatsApp que se muestra ANTES de que el usuario vea el menú del restaurante.",
        requirements: [
          "Crea un título que aclare que es un paso antes de acceder al menú (máx 40 caracteres) con emoji",
          "El mensaje debe comenzar refiriéndose al hecho de que es antes de mostrar el menú",
          "Incluye personalización con {customerName} en el mensaje",
          "Escribe un mensaje principal atractivo (máx 150 caracteres)",
          "El mensaje debe ser amigable y explicar que después podrá ver el menú de todos modos",
          "Menciona que podrá revocar el consentimiento vía 'Unsubscribe' en mensajes futuros",
          "Usa emojis apropiados pero sin exagerar (máx 2-3)",
          "Enfócate en los beneficios para el cliente (ofertas exclusivas, novedades, etc.)",
          "Evita lenguaje demasiado comercial o agresivo",
          "El botón de aceptar debe ser atractivo y tranquilizador",
          "El botón de rechazo debe ser neutral (ej: 'Continuar sin aceptar')"
        ]
      },
      fr: {
        systemPrompt: "Vous êtes un expert en marketing pour restaurants. Créez un message d'opt-in marketing pour WhatsApp qui est affiché AVANT que l'utilisateur voie le menu du restaurant.",
        requirements: [
          "Créez un titre qui clarifie que c'est une étape avant d'accéder au menu (max 40 caractères) avec emoji",
          "Le message doit commencer en se référant au fait que c'est avant de montrer le menu",
          "Incluez la personnalisation avec {customerName} dans le message",
          "Rédigez un message principal engageant (max 150 caractères)",
          "Le message doit être amical et expliquer qu'ils pourront voir le menu de toute façon",
          "Mentionnez qu'ils peuvent révoquer le consentement via 'Unsubscribe' dans les messages futurs",
          "Utilisez des emojis appropriés sans exagérer (max 2-3)",
          "Concentrez-vous sur les avantages pour le client (offres exclusives, nouveautés, etc.)",
          "Évitez un langage trop commercial ou agressif",
          "Le bouton d'acceptation doit être attrayant et rassurant",
          "Le bouton de refus doit être neutre (ex: 'Continuer sans accepter')"
        ]
      },
      de: {
        systemPrompt: "Sie sind ein Restaurant-Marketing-Experte. Erstellen Sie eine Marketing-Opt-in-Nachricht für WhatsApp, die gezeigt wird, BEVOR der Benutzer das Restaurantmenü sieht.",
        requirements: [
          "Erstellen Sie einen Titel, der klar macht, dass dies ein Schritt vor dem Zugriff auf das Menü ist (max 40 Zeichen) mit Emoji",
          "Die Nachricht sollte damit beginnen, sich darauf zu beziehen, dass es vor dem Zeigen des Menüs ist",
          "Fügen Sie Personalisierung mit {customerName} in die Nachricht ein",
          "Schreiben Sie eine ansprechende Hauptnachricht (max 150 Zeichen)",
          "Die Nachricht sollte freundlich sein und erklären, dass sie das Menü trotzdem sehen können",
          "Erwähnen Sie, dass sie die Einwilligung über 'Unsubscribe' in zukünftigen Nachrichten widerrufen können",
          "Verwenden Sie angemessene Emojis, aber übertreiben Sie nicht (max 2-3)",
          "Konzentrieren Sie sich auf Kundenvorteile (exklusive Angebote, Neuigkeiten, etc.)",
          "Vermeiden Sie zu kommerzielle oder aggressive Sprache",
          "Der Akzeptieren-Button sollte einladend und beruhigend sein",
          "Der Ablehnungsbutton sollte neutral sein (z.B. 'Ohne Akzeptieren fortfahren')"
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
  "message": "Messaggio principale coinvolgente con {customerName}",
  "acceptButton": "Testo pulsante accetta",
  "skipButton": "Testo pulsante rifiuta"
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
      if (!generatedMessage.title || !generatedMessage.message || !generatedMessage.acceptButton || 
          !generatedMessage.skipButton) {
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
        title: language === 'it' ? "🍽️ Prima di accedere al menu..." : "🍽️ Before accessing the menu...",
        message: language === 'it' 
          ? `Ciao {customerName}! Prima di mostrarti il delizioso menu di ${restaurant.name}, vorresti ricevere offerte esclusive? ${prompt} 🌟`
          : `Hi {customerName}! Before showing you ${restaurant.name}'s delicious menu, would you like to receive exclusive offers? ${prompt} 🌟`,
        acceptButton: language === 'it' ? "Accetta e Continua" : "Accept and Continue",
        skipButton: language === 'it' ? "Continua senza accettare" : "Continue without accepting"
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