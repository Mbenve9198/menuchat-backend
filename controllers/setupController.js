const userService = require('../services/userService');
const restaurantService = require('../services/restaurantService');
const botConfigurationService = require('../services/botConfigurationService');
const whatsappTemplateService = require('../services/whatsappTemplateService');
const Restaurant = require('../models/Restaurant');
const Anthropic = require('@anthropic-ai/sdk');
const BotConfiguration = require('../models/BotConfiguration');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Controller per gestire le richieste di setup
 */
class SetupController {
  /**
   * Gestisce la registrazione di un nuovo utente e ristorante
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async setupRestaurant(req, res) {
    try {
      const formData = req.body;

      // Verifica che i dati necessari siano presenti
      if (!formData.userEmail || !formData.userPassword || !formData.userFullName || !formData.restaurantName) {
        return res.status(400).json({
          success: false,
          error: 'Dati mancanti',
          details: 'Email, password, nome completo e nome del ristorante sono obbligatori'
        });
      }

      // Verifica se l'utente esiste già
      const existingUser = await userService.findUserByEmail(formData.userEmail);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'L\'email è già registrata'
        });
      }

      // Crea il nuovo utente
      const userData = {
        email: formData.userEmail,
        password: formData.userPassword,
        fullName: formData.userFullName
      };
      
      const user = await userService.createUser(userData);

      // Crea il nuovo ristorante
      const restaurant = await restaurantService.createRestaurant(formData, user._id);

      // Aggiorna l'utente con il riferimento al ristorante
      await userService.updateUser(user._id, { restaurant: restaurant._id });

      // Crea la configurazione del bot per il ristorante
      const botConfig = await botConfigurationService.createBotConfiguration(formData, restaurant._id);

      let menuTemplate = null;
      let reviewTemplate = null;
      let templateError = null;

      try {
        // Determina il tipo di menu e crea il template appropriato
        const menuLanguages = formData.menuLanguages || [];

        // Trova una lingua con menuPdfUrl (file PDF caricato)
        const languageWithPdf = menuLanguages.find(lang => 
          lang.menuPdfUrl && lang.menuPdfUrl.trim() !== ''
        );

        // Trova una lingua con menuUrl (URL esterno)
        const languageWithUrl = menuLanguages.find(lang => 
          lang.menuUrl && lang.menuUrl.trim() !== ''
        );

        let menuType, menuLinkUrl;

        // Priorità al PDF se disponibile
        if (languageWithPdf) {
          console.log('Trovato PDF caricato:', languageWithPdf.menuPdfUrl);
          menuType = 'pdf';
          menuLinkUrl = languageWithPdf.menuPdfUrl;
        } else if (languageWithUrl) {
          console.log('Trovato URL del menu:', languageWithUrl.menuUrl);
          menuType = 'url';
          menuLinkUrl = languageWithUrl.menuUrl;
        } else {
          console.error('Nessun URL del menu o PDF trovato');
          throw new Error('Nessun URL del menu o PDF trovato');
        }

        console.log('Tipo di menu selezionato:', menuType);
        console.log('URL selezionato:', menuLinkUrl);

        // Crea il template del menu
        menuTemplate = await whatsappTemplateService.createMenuTemplate(
          restaurant._id,
          menuType,
          formData.welcomeMessage,
          menuLinkUrl
        );

        // Crea il template per le recensioni
        reviewTemplate = await whatsappTemplateService.createReviewTemplate(
          restaurant._id,
          formData.reviewTemplate || "Grazie per aver ordinato da noi! 🌟 La tua opinione è importante - ci piacerebbe sapere cosa ne pensi della tua esperienza.",
          formData.reviewLink
        );

      } catch (error) {
        console.error('Errore nella creazione dei template WhatsApp:', error);
        templateError = error.message;
      }

      // Ritorna la risposta con i dati dell'utente, del ristorante e dei template
      res.status(201).json({
        success: true,
        userId: user._id,
        restaurantId: restaurant._id,
        botConfigId: botConfig._id,
        templates: {
          menu: menuTemplate ? {
            id: menuTemplate._id,
            status: menuTemplate.status
          } : null,
          review: reviewTemplate ? {
            id: reviewTemplate._id,
            status: reviewTemplate.status
          } : null,
          error: templateError
        }
      });

    } catch (error) {
      console.error('Errore in setupRestaurant:', error);

      // Gestisci gli errori specifici
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: 'Errore di validazione',
          details: error.message
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          error: 'Email già esistente'
        });
      }

      // Errore generico
      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }

  /**
   * Ottiene i dati di un ristorante esistente
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async getRestaurant(req, res) {
    try {
      const { id } = req.params;

      // Trova il ristorante per ID
      const restaurant = await restaurantService.findRestaurantById(id);

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      // Ritorna i dati del ristorante
      res.status(200).json({
        success: true,
        restaurant
      });
    } catch (error) {
      console.error('Errore in getRestaurant:', error);

      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }

  /**
   * Aggiorna i dati di un ristorante esistente
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async updateRestaurant(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Aggiorna il ristorante
      const restaurant = await restaurantService.updateRestaurant(id, updateData);

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      // Ritorna i dati aggiornati del ristorante
      res.status(200).json({
        success: true,
        restaurant
      });
    } catch (error) {
      console.error('Errore in updateRestaurant:', error);

      if (error.message === 'Ristorante non trovato') {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }

  /**
   * Elimina un ristorante esistente
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async deleteRestaurant(req, res) {
    try {
      const { id } = req.params;

      // Elimina il ristorante
      const deleted = await restaurantService.deleteRestaurant(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      // Ritorna la conferma dell'eliminazione
      res.status(200).json({
        success: true,
        message: 'Ristorante eliminato con successo'
      });
    } catch (error) {
      console.error('Errore in deleteRestaurant:', error);

      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }

  async generateWelcomeMessage(req, res) {
    try {
      const { 
        restaurantId, 
        restaurantName,
        restaurantDetails,
        menuType, // 'pdf' or 'url'
        language = "en", // default a inglese se non specificato
        forceLanguage = false, // se true, forza l'uso della lingua specificata
        modelId = "claude-3-7-sonnet-20250219"
      } = req.body;
      
      if (!restaurantDetails) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant details are required'
        });
      }

      // Determina la lingua per il prompt
      console.log(`Generating welcome message in language: ${language}, forceLanguage: ${forceLanguage}`);
      
      // Mappatura delle lingue con le istruzioni corrispondenti
      const languageInstructions = {
        en: {
          welcomeText: "Analyze these restaurant details and reviews to create a very concise welcome message (max 40 words):",
          context: menuType === 'pdf' 
            ? "The menu will be attached as a PDF file to this message."
            : "The menu will be accessible via a button below this message.",
          requirements: [
            "Maximum 40 words",
            "Include {{1}} as a placeholder for the customer's name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)",
            "Include restaurant name",
            "Add relevant food emojis based on cuisine and reviews",
            "Highlight what customers love most based on reviews",
            "Keep it friendly and welcoming",
            "DO NOT include any URLs or placeholders for menu links",
            "IMPORTANT: Return ONLY the welcome message without any description, explanation, or comments. Do not include quotes around the message."
          ],
          example: menuType === 'pdf'
            ? "Hi {{1}}! Welcome to Luigi's 🍝\nOur homemade pasta got 200+ five-star reviews! I've attached our menu with all our specialties."
            : "Hi {{1}}! Welcome to Luigi's 🍝\nOur homemade pasta got 200+ five-star reviews! Check out our menu with all our specialties below."
        },
        it: {
          welcomeText: "Analizza i dettagli e le recensioni di questo ristorante per creare un messaggio di benvenuto molto conciso (massimo 40 parole):",
          context: menuType === 'pdf' 
            ? "Il menu sarà allegato come file PDF a questo messaggio."
            : "Il menu sarà accessibile tramite un pulsante sotto questo messaggio.",
          requirements: [
            "Massimo 40 parole",
            "Includi {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}}, non {customerName} o altre variazioni)",
            "Includi il nome del ristorante",
            "Aggiungi emoji di cibo pertinenti in base alla cucina e alle recensioni",
            "Metti in evidenza ciò che i clienti apprezzano di più in base alle recensioni",
            "Mantieni un tono amichevole e accogliente",
            "NON includere URL o segnaposto per link al menu",
            "IMPORTANTE: Restituisci SOLO il messaggio di benvenuto senza descrizioni, spiegazioni o commenti. Non includere virgolette attorno al messaggio."
          ],
          example: menuType === 'pdf'
            ? "Ciao {{1}}! Benvenuto da Luigi's 🍝\nLa nostra pasta fatta in casa ha ricevuto oltre 200 recensioni a cinque stelle! Ho allegato il nostro menu con tutte le nostre specialità."
            : "Ciao {{1}}! Benvenuto da Luigi's 🍝\nLa nostra pasta fatta in casa ha ricevuto oltre 200 recensioni a cinque stelle! Scopri il nostro menu con tutte le nostre specialità qui sotto."
        },
        fr: {
          welcomeText: "Analysez ces détails et avis de restaurant pour créer un message d'accueil très concis (max 40 mots) :",
          context: menuType === 'pdf' 
            ? "Le menu sera joint en fichier PDF à ce message."
            : "Le menu sera accessible via un bouton ci-dessous.",
          requirements: [
            "Maximum 40 mots",
            "Incluez {{1}} comme espace réservé pour le nom du client (IMPORTANT : utilisez exactement {{1}}, pas {customerName} ou autres variations)",
            "Incluez le nom du restaurant",
            "Ajoutez des émojis d'aliments pertinents selon la cuisine et les avis",
            "Soulignez ce que les clients apprécient le plus d'après les avis",
            "Restez amical et accueillant",
            "N'incluez PAS d'URL ou d'espaces réservés pour les liens vers le menu",
            "IMPORTANT : Retournez UNIQUEMENT le message d'accueil sans description, explication ou commentaires. N'incluez pas de guillemets autour du message."
          ],
          example: menuType === 'pdf'
            ? "Bonjour {{1}}! Bienvenue chez Luigi's 🍝\nNos pâtes maison ont reçu plus de 200 avis 5 étoiles! J'ai joint notre menu avec toutes nos spécialités."
            : "Bonjour {{1}}! Bienvenue chez Luigi's 🍝\nNos pâtes maison ont reçu plus de 200 avis 5 étoiles! Découvrez notre menu avec toutes nos spécialités ci-dessous."
        },
        de: {
          welcomeText: "Analysieren Sie diese Restaurantdetails und Bewertungen, um eine sehr prägnante Willkommensnachricht zu erstellen (max. 40 Wörter):",
          context: menuType === 'pdf' 
            ? "Das Menü wird dieser Nachricht als PDF-Datei beigefügt."
            : "Das Menü wird über eine Schaltfläche unter dieser Nachricht zugänglich sein.",
          requirements: [
            "Maximal 40 Wörter",
            "Fügen Sie {{1}} als Platzhalter für den Namen des Kunden ein (WICHTIG: Verwenden Sie genau {{1}}, nicht {customerName} oder andere Variationen)",
            "Nennen Sie den Namen des Restaurants",
            "Fügen Sie relevante Lebensmittel-Emojis basierend auf Küche und Bewertungen hinzu",
            "Heben Sie hervor, was Kunden laut Bewertungen am meisten schätzen",
            "Halten Sie es freundlich und einladend",
            "Fügen Sie KEINE URLs oder Platzhalter für Menülinks ein",
            "WICHTIG: Geben Sie NUR die Willkommensnachricht ohne Beschreibung, Erklärung oder Kommentare zurück. Verwenden Sie keine Anführungszeichen um die Nachricht."
          ],
          example: menuType === 'pdf'
            ? "Hallo {{1}}! Willkommen bei Luigi's 🍝\nUnsere hausgemachte Pasta hat über 200 Fünf-Sterne-Bewertungen erhalten! Ich habe unser Menü mit all unseren Spezialitäten beigefügt."
            : "Hallo {{1}}! Willkommen bei Luigi's 🍝\nUnsere hausgemachte Pasta hat über 200 Fünf-Sterne-Bewertungen erhalten! Entdecken Sie unser Menü mit all unseren Spezialitäten unten."
        },
        es: {
          welcomeText: "Analiza estos detalles y reseñas del restaurante para crear un mensaje de bienvenida muy conciso (máx. 40 palabras):",
          context: menuType === 'pdf' 
            ? "El menú se adjuntará como archivo PDF a este mensaje."
            : "El menú será accesible mediante un botón debajo de este mensaje.",
          requirements: [
            "Máximo 40 palabras",
            "Incluye {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}}, no {customerName} u otras variaciones)",
            "Incluye el nombre del restaurante",
            "Agrega emojis de comida relevantes según la cocina y las reseñas",
            "Destaca lo que más les gusta a los clientes según las reseñas",
            "Mantenlo amigable y acogedor",
            "NO incluyas URLs o marcadores de posición para enlaces al menú",
            "IMPORTANTE: Devuelve SOLO el mensaje de bienvenida sin descripción, explicación o comentarios. No incluyas comillas alrededor del mensaje."
          ],
          example: menuType === 'pdf'
            ? "¡Hola {{1}}! Bienvenido a Luigi's 🍝\nNuestra pasta casera ha recibido más de 200 reseñas de cinco estrellas! He adjuntado nuestro menú con todas nuestras especialidades."
            : "¡Hola {{1}}! Bienvenido a Luigi's 🍝\nNuestra pasta casera ha recibido más de 200 reseñas de cinco estrellas! Consulta nuestro menú con todas nuestras especialidades a continuación."
        }
      };

      // Usa le istruzioni della lingua richiesta o inglese di default se non supportata
      const langInstructions = languageInstructions[language] || languageInstructions.en;
      const menuPromptSuffix = langInstructions.context;

      const promptContent = `${langInstructions.welcomeText}

Restaurant Name: ${restaurantDetails.name}
Rating: ${restaurantDetails.rating}/5 (${restaurantDetails.ratingsTotal} reviews)
Cuisine: ${restaurantDetails.cuisineTypes?.join(', ')}

Top 5 Reviews:
${restaurantDetails.reviews?.slice(0, 5).map(review => 
  `- "${review.text.slice(0, 100)}..."`
).join('\n') || ''}

Context: ${menuPromptSuffix}

Requirements:
${langInstructions.requirements.map(req => req).join('\n')}

${language !== 'en' ? `IMPORTANT: The message MUST be in ${language} language.` : ''}

Example:
${langInstructions.example}`;

      // Determina il modello da utilizzare
      const model = modelId || "claude-3-7-sonnet-20250219";

      // Genera il messaggio usando Claude
      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 500,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: promptContent
          }
        ]
      });

      // Estrai il messaggio dalla risposta
      const fullText = response.content[0].text;
      
      // Estrae solo il messaggio di benvenuto, escludendo eventuali spiegazioni
      // Prende il primo paragrafo che contiene il testo del messaggio di benvenuto
      // e rimuove eventuali virgolette
      let generatedMessage = fullText;
      
      // Se il messaggio contiene una spiegazione dopo il messaggio vero e proprio
      if (fullText.includes("\n\n")) {
        // Prendi solo la prima parte del testo, che dovrebbe essere il messaggio
        generatedMessage = fullText.split("\n\n")[0];
      }
      
      // Rimuovi eventuali virgolette attorno al messaggio
      generatedMessage = generatedMessage.replace(/^["']|["']$/g, "");

      res.json({ 
        success: true, 
        message: generatedMessage
      });
    } catch (error) {
      console.error('Error generating welcome message:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error generating welcome message',
        details: error.message 
      });
    }
  }

  async generateReviewTemplates(req, res) {
    try {
      const { 
        restaurantName, 
        restaurantDetails,
        reviewLink,
        language = "en", // Default a inglese se non specificato
        forceLanguage = false, // Se true, forza l'uso della lingua specificata
        modelId = "claude-3-7-sonnet-20250219"
      } = req.body;
      
      if (!restaurantDetails) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant details are required'
        });
      }

      // Debug info
      console.log(`Generating review template in language: ${language}, forceLanguage: ${forceLanguage}`);
      
      // Mappatura delle lingue con le istruzioni corrispondenti
      const languageInstructions = {
        en: {
          welcomeText: "Create an optimized review request message for a restaurant. The message should encourage customers to leave a review by clicking a button that will be shown below the message.",
          requirements: [
            "Be friendly and conversational",
            "Keep the message between 100-120 characters",
            "Don't mention or include the review link (it will be in a button below)",
            "Focus on one of these approaches:",
            "   - Thank the customer for their order",
            "   - Emphasize how feedback helps the restaurant improve",
            "   - Highlight the value of customer opinions",
            "Use appropriate emojis (max 2)",
            "Don't use generic phrases like \"leave a review\"",
            "Make it personal and engaging",
            "Use {{1}} as a placeholder for the customer's name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)"
          ],
          example: "Thanks for dining with us, {{1}}! 🌟 Your opinion means the world to us - we'd love to hear about your experience with our dishes."
        },
        it: {
          welcomeText: "Crea un messaggio ottimizzato per richiedere recensioni a un ristorante. Il messaggio dovrebbe incoraggiare i clienti a lasciare una recensione cliccando su un pulsante che verrà mostrato sotto il messaggio.",
          requirements: [
            "Sii amichevole e conversazionale",
            "Mantieni il messaggio tra 100-120 caratteri",
            "Non menzionare o includere il link alla recensione (sarà in un pulsante sotto)",
            "Concentrati su uno di questi approcci:",
            "   - Ringrazia il cliente per il suo ordine",
            "   - Enfatizza come il feedback aiuta il ristorante a migliorare",
            "   - Sottolinea il valore delle opinioni dei clienti",
            "Usa emoji appropriate (massimo 2)",
            "Non usare frasi generiche come \"lascia una recensione\"",
            "Rendilo personale e coinvolgente",
            "Usa {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}}, non {customerName} o altre variazioni)"
          ],
          example: "Grazie per aver cenato da noi, {{1}}! 🌟 La tua opinione è molto importante - ci piacerebbe sapere cosa pensi dei nostri piatti."
        },
        fr: {
          welcomeText: "Créez un message optimisé pour demander un avis sur un restaurant. Le message devrait encourager les clients à laisser un avis en cliquant sur un bouton qui sera affiché sous le message.",
          requirements: [
            "Soyez amical et conversationnel",
            "Gardez le message entre 100 et 120 caractères",
            "Ne mentionnez pas et n'incluez pas le lien d'avis (il sera dans un bouton ci-dessous)",
            "Concentrez-vous sur l'une de ces approches :",
            "   - Remerciez le client pour sa commande",
            "   - Soulignez comment les commentaires aident le restaurant à s'améliorer",
            "   - Mettez en valeur l'importance des opinions des clients",
            "Utilisez des émojis appropriés (maximum 2)",
            "N'utilisez pas de phrases génériques comme \"laissez un avis\"",
            "Rendez-le personnel et engageant",
            "Utilisez {{1}} comme espace réservé pour le nom du client (IMPORTANT : utilisez exactement {{1}}, pas {customerName} ou autres variations)"
          ],
          example: "Merci d'avoir dîné chez nous, {{1}} ! 🌟 Votre avis compte beaucoup pour nous - nous aimerions connaître votre expérience avec nos plats."
        },
        de: {
          welcomeText: "Erstellen Sie eine optimierte Bewertungsanfrage für ein Restaurant. Die Nachricht sollte Kunden ermutigen, eine Bewertung abzugeben, indem sie auf eine Schaltfläche klicken, die unter der Nachricht angezeigt wird.",
          requirements: [
            "Seien Sie freundlich und gesprächig",
            "Halten Sie die Nachricht zwischen 100-120 Zeichen",
            "Erwähnen oder fügen Sie den Bewertungslink nicht ein (er wird in einer Schaltfläche unten angezeigt)",
            "Konzentrieren Sie sich auf einen dieser Ansätze:",
            "   - Danken Sie dem Kunden für seine Bestellung",
            "   - Betonen Sie, wie Feedback dem Restaurant hilft, sich zu verbessern",
            "   - Heben Sie den Wert der Kundenmeinungen hervor",
            "Verwenden Sie passende Emojis (maximal 2)",
            "Verwenden Sie keine generischen Phrasen wie \"Bewertung abgeben\"",
            "Machen Sie es persönlich und ansprechend",
            "Verwenden Sie {{1}} als Platzhalter für den Namen des Kunden (WICHTIG: Verwenden Sie genau {{1}}, nicht {customerName} oder andere Variationen)"
          ],
          example: "Danke für Ihren Besuch bei uns, {{1}}! 🌟 Ihre Meinung bedeutet uns sehr viel - wir würden gerne von Ihren Erfahrungen mit unseren Gerichten hören."
        },
        es: {
          welcomeText: "Crea un mensaje optimizado para solicitar reseñas para un restaurante. El mensaje debe animar a los clientes a dejar una reseña haciendo clic en un botón que se mostrará debajo del mensaje.",
          requirements: [
            "Sé amigable y conversacional",
            "Mantén el mensaje entre 100-120 caracteres",
            "No menciones ni incluyas el enlace de reseña (estará en un botón debajo)",
            "Concéntrate en uno de estos enfoques:",
            "   - Agradece al cliente por su pedido",
            "   - Enfatiza cómo los comentarios ayudan al restaurante a mejorar",
            "   - Destaca el valor de las opiniones de los clientes",
            "Usa emojis apropiados (máximo 2)",
            "No uses frases genéricas como \"deja una reseña\"",
            "Hazlo personal y atractivo",
            "Usa {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}}, no {customerName} u otras variaciones)"
          ],
          example: "¡Gracias por cenar con nosotros, {{1}}! 🌟 Tu opinión significa mucho para nosotros - nos encantaría saber sobre tu experiencia con nuestros platos."
        }
      };

      // Usa le istruzioni della lingua richiesta o inglese di default se non supportata
      const langInstructions = languageInstructions[language] || languageInstructions.en;

      const promptContent = `${langInstructions.welcomeText}

Restaurant Name: ${restaurantDetails.name}
Rating: ${restaurantDetails.rating}/5 (${restaurantDetails.ratingsTotal} reviews)
Cuisine: ${restaurantDetails.cuisineTypes?.join(', ') || 'Various'}

Requirements:
${langInstructions.requirements.map(req => req).join('\n')}

${language !== 'en' ? `IMPORTANT: The message MUST be in ${language} language.` : ''}

Response format:
Return ONLY the message text, without quotes or any additional explanation.

Example:
${langInstructions.example}`;

      // Genera il messaggio usando Claude
      const response = await anthropic.messages.create({
        model: modelId,
        max_tokens: 500,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: promptContent
          }
        ]
      });

      // Estrai il messaggio dalla risposta
      const message = response.content[0].text.trim();

      res.json({ 
        success: true, 
        templates: [message]
      });
    } catch (error) {
      console.error('Error generating review message:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error generating review message',
        details: error.message 
      });
    }
  }

  async checkTrigger(req, res) {
    try {
      const { triggerPhrase } = req.body;
      
      if (!triggerPhrase || triggerPhrase.trim() === '') {
        return res.json({ available: false, error: 'Trigger phrase cannot be empty' });
      }
      
      const existingBot = await BotConfiguration.findOne({
        triggerWord: { $regex: new RegExp(`^${triggerPhrase}$`, 'i') },
        active: true
      });
      
      return res.json({ available: !existingBot });
      
    } catch (error) {
      console.error('Error checking trigger availability:', error);
      return res.status(500).json({ available: false, error: 'Server error' });
    }
  }

  /**
   * Ottiene l'immagine del profilo di un ristorante
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async getRestaurantProfileImage(req, res) {
    try {
      const { id } = req.params;

      // Trova il ristorante per ID
      const restaurant = await restaurantService.findRestaurantById(id);

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      // Controlla se esiste un'immagine principale
      if (restaurant.mainPhoto) {
        return res.status(200).json({
          success: true,
          profileImage: restaurant.mainPhoto
        });
      }
      
      // Se non c'è un'immagine principale ma ci sono altre foto, usa la prima
      if (restaurant.photos && restaurant.photos.length > 0) {
        return res.status(200).json({
          success: true,
          profileImage: restaurant.photos[0]
        });
      }

      // Se non ci sono immagini
      return res.status(404).json({
        success: false,
        error: 'Nessuna immagine del profilo trovata per questo ristorante'
      });
      
    } catch (error) {
      console.error('Errore in getRestaurantProfileImage:', error);
      
      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }
}

module.exports = new SetupController(); 