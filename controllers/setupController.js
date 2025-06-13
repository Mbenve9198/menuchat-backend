const userService = require('../services/userService');
const restaurantService = require('../services/restaurantService');
const botConfigurationService = require('../services/botConfigurationService');
const Restaurant = require('../models/Restaurant');
const Anthropic = require('@anthropic-ai/sdk');
const BotConfiguration = require('../models/BotConfiguration');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Funzione helper per ottenere il testo del CTA nella lingua corretta
 */
const getCtaTextByLanguage = (messageType, language) => {
  const ctaTexts = {
    review: {
      'it': '⭐ Lascia una recensione',
      'en': '⭐ Leave a review',
      'es': '⭐ Deja una reseña',
      'de': '⭐ Bewertung abgeben',
      'fr': '⭐ Laisser un avis'
    },
    menu: {
      'it': '🔗 Menu',
      'en': '🔗 Menu',
      'es': '🔗 Menú',
      'de': '🔗 Menü',
      'fr': '🔗 Menu'
    }
  };

  return ctaTexts[messageType]?.[language] || ctaTexts[messageType]?.['en'] || '🔗 Menu';
};

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

      // Se sono disponibili i dati delle recensioni da Google, salviamo il numero iniziale
      if (formData.googleRating && formData.googleRating.reviewCount) {
        // Aggiorniamo l'initialReviewCount con lo stesso valore di reviewCount
        await Restaurant.findByIdAndUpdate(restaurant._id, {
          'googleRating.initialReviewCount': formData.googleRating.reviewCount
        });
      }

      // Aggiorna l'utente con il riferimento al ristorante
      await userService.updateUser(user._id, { restaurant: restaurant._id });

      // Crea la configurazione del bot per il ristorante
      const botConfig = await botConfigurationService.createBotConfiguration(formData, restaurant._id);

      // --- NUOVO: Crea i messaggi RestaurantMessage se presenti nel payload ---
      if (Array.isArray(formData.messages) && formData.messages.length > 0) {
        const RestaurantMessage = require('../models/RestaurantMessage');
        const createdMessages = [];
        for (const msg of formData.messages) {
          // Costruisci il payload coerente con il modello
          const messageData = {
            restaurant: restaurant._id,
            messageType: (msg.messageType === 'media' || msg.messageType === 'menu_url') ? 'menu' : 'review',
            language: msg.language,
            messageBody: msg.messageBody,
            mediaUrl: msg.mediaUrl || '',
            mediaType: msg.mediaUrl ? 'pdf' : undefined,
            ctaUrl: msg.menuUrl || msg.ctaUrl || '',
            ctaText: getCtaTextByLanguage(msg.messageType, msg.language),
            isActive: true,
            lastModified: new Date(),
            modifiedBy: 'system'
          };
          // Evita duplicati per ristorante+tipo+lingua
          const saved = await RestaurantMessage.findOneAndUpdate(
            {
              restaurant: messageData.restaurant,
              messageType: messageData.messageType,
              language: messageData.language
            },
            messageData,
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          createdMessages.push(saved);
        }

        // --- NUOVO: Traduzione automatica in tutte le lingue supportate (allineata a restaurantMessageController.js) ---
        if (formData.translateAllLanguages) {
          const SUPPORTED_LANGUAGES = ['it', 'en', 'fr', 'de', 'es'];
          for (const msg of formData.messages) {
            const mainLang = msg.language;
            const mainBody = msg.messageBody;
            const type = (msg.messageType === 'media' || msg.messageType === 'menu_url') ? 'menu' : 'review';
            for (const lang of SUPPORTED_LANGUAGES) {
              if (lang === mainLang) continue; // Salta la lingua principale già creata
              // Controlla se già esiste
              const exists = await RestaurantMessage.findOne({
                restaurant: restaurant._id,
                messageType: type,
                language: lang
              });
              if (exists) continue;
              // Prompt di traduzione (stessa logica di restaurantMessageController.js)
              let translationPrompt = '';
              if (type === 'review') {
                translationPrompt = `You are a professional translator. Translate the following review request message from ${mainLang} to ${lang}.
\nIMPORTANT: Return ONLY the translated text, no explanations, no quotes, no additional text.\n\nRules:\n- Keep the same tone, style, and formatting\n- Preserve any placeholders like {{1}} exactly as they are\n- Keep emojis and maintain the same message structure\n- Return only the translated message text\n\nOriginal message (${mainLang}):\n${mainBody}\n\nTranslated message (${lang}):`;
              } else {
                translationPrompt = `You are a professional translator. Translate the following restaurant welcome message from ${mainLang} to ${lang}.
\nIMPORTANT: Return ONLY the translated text, no explanations, no quotes, no additional text.\n\nRules:\n- Keep the same tone, style, and formatting\n- Preserve any placeholders like {{1}} exactly as they are\n- Keep emojis and maintain the same message structure\n- Return only the translated message text\n\nOriginal message (${mainLang}):\n${mainBody}\n\nTranslated message (${lang}):`;
              }
              let translatedBody = mainBody;
              try {
                const response = await anthropic.messages.create({
                  model: "claude-3-5-sonnet-20241022",
                  max_tokens: 500,
                  temperature: 0.3,
                  messages: [
                    {
                      role: "user",
                      content: translationPrompt
                    }
                  ]
                });
                translatedBody = response.content[0].text.trim();
              } catch (err) {
                console.error(`Errore traduzione ${type} ${mainLang}->${lang}:`, err);
                // fallback: usa il testo originale
                translatedBody = mainBody;
              }
              // Salva il messaggio tradotto
              await RestaurantMessage.findOneAndUpdate(
                {
                  restaurant: restaurant._id,
                  messageType: type,
                  language: lang
                },
                {
                  restaurant: restaurant._id,
                  messageType: type,
                  language: lang,
                  messageBody: translatedBody,
                  mediaUrl: msg.mediaUrl || '',
                  mediaType: msg.mediaUrl ? 'pdf' : undefined,
                  ctaUrl: msg.menuUrl || msg.ctaUrl || '',
                  ctaText: getCtaTextByLanguage(type, lang),
                  isActive: true,
                  lastModified: new Date(),
                  modifiedBy: 'claude-translation'
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
            }
          }
        }
        // --- FINE TRADUZIONE ---
      }

      // Ritorna la risposta con i dati dell'utente e del ristorante
      // Non creiamo più template dato che ora generiamo messaggi normali direttamente
      res.status(201).json({
        success: true,
        userId: user._id,
        restaurantId: restaurant._id,
        botConfigId: botConfig._id,
        message: 'Ristorante configurato con successo. I messaggi verranno generati automaticamente.'
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
      
      console.log("🔍 Welcome Message Request Payload:", JSON.stringify({
        restaurantId,
        restaurantName,
        menuType,
        language,
        modelId,
        restaurantDetailsKeys: restaurantDetails ? Object.keys(restaurantDetails) : 'null'
      }, null, 2));
      
      if (!restaurantDetails) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant details are required'
        });
      }

      console.log("🍽️ Restaurant Info:", JSON.stringify({
        name: restaurantDetails.name,
        rating: restaurantDetails.rating,
        ratingsTotal: restaurantDetails.ratingsTotal,
        cuisineTypes: restaurantDetails.cuisineTypes,
        reviewsCount: restaurantDetails.reviews?.length || 0
      }, null, 2));

      // Determina la lingua per il prompt
      console.log(`🌐 Generating welcome message in language: ${language}, forceLanguage: ${forceLanguage}`);
      
      // Mappatura delle lingue con le istruzioni corrispondenti
      const languageInstructions = {
        en: {
          welcomeText: "Create a very brief welcome message (max 2-3 lines, 30 words max) for this restaurant:",
          context: "The menu will be automatically handled by the system - do NOT mention menu access, buttons, or attachments.",
          requirements: [
            "Maximum 30 words total",
            "Maximum 2-3 lines",
            "Include {{1}} as placeholder for customer's name (IMPORTANT: use exactly {{1}})",
            "Include restaurant name",
            "Add 1-2 relevant food emojis based on cuisine",
            "Focus on warm welcome and restaurant's specialty",
            "DO NOT mention menu, buttons, links, or attachments",
            "Keep it simple and friendly",
            "IMPORTANT: Return ONLY the message without quotes or explanations"
          ],
          example: "Hi {{1}}! Welcome to Luigi's 🍝\nOur homemade pasta is loved by hundreds of customers!"
        },
        it: {
          welcomeText: "Crea un messaggio di benvenuto molto breve (max 2-3 righe, 30 parole max) per questo ristorante:",
          context: "Il menu sarà gestito automaticamente dal sistema - NON menzionare accesso al menu, pulsanti o allegati.",
          requirements: [
            "Massimo 30 parole totali",
            "Massimo 2-3 righe",
            "Includi {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}})",
            "Includi il nome del ristorante",
            "Aggiungi 1-2 emoji di cibo pertinenti in base alla cucina",
            "Concentrati su un caloroso benvenuto e la specialità del ristorante",
            "NON menzionare menu, pulsanti, link o allegati",
            "Mantieni semplice e amichevole",
            "IMPORTANTE: Restituisci SOLO il messaggio senza virgolette o spiegazioni"
          ],
          example: "Ciao {{1}}! Benvenuto da Luigi's 🍝\nLa nostra pasta fatta in casa è amata da centinaia di clienti!"
        },
        fr: {
          welcomeText: "Créez un message d'accueil très bref (max 2-3 lignes, 30 mots max) pour ce restaurant :",
          context: "Le menu sera géré automatiquement par le système - NE PAS mentionner l'accès au menu, boutons ou pièces jointes.",
          requirements: [
            "Maximum 30 mots au total",
            "Maximum 2-3 lignes",
            "Incluez {{1}} comme espace réservé pour le nom du client (IMPORTANT : utilisez exactement {{1}})",
            "Incluez le nom du restaurant",
            "Ajoutez 1-2 émojis d'aliments pertinents selon la cuisine",
            "Concentrez-vous sur un accueil chaleureux et la spécialité du restaurant",
            "NE PAS mentionner menu, boutons, liens ou pièces jointes",
            "Restez simple et amical",
            "IMPORTANT : Retournez UNIQUEMENT le message sans guillemets ou explications"
          ],
          example: "Bonjour {{1}} ! Bienvenue chez Luigi's 🍝\nNos pâtes maison sont adorées par des centaines de clients !"
        },
        de: {
          welcomeText: "Erstellen Sie eine sehr kurze Willkommensnachricht (max. 2-3 Zeilen, 30 Wörter max) für dieses Restaurant:",
          context: "Das Menü wird automatisch vom System verwaltet - NICHT Menüzugang, Schaltflächen oder Anhänge erwähnen.",
          requirements: [
            "Maximal 30 Wörter insgesamt",
            "Maximal 2-3 Zeilen",
            "Fügen Sie {{1}} als Platzhalter für den Namen des Kunden ein (WICHTIG: Verwenden Sie genau {{1}})",
            "Nennen Sie den Namen des Restaurants",
            "Fügen Sie 1-2 relevante Lebensmittel-Emojis basierend auf der Küche hinzu",
            "Konzentrieren Sie sich auf einen warmen Empfang und die Spezialität des Restaurants",
            "NICHT Menü, Schaltflächen, Links oder Anhänge erwähnen",
            "Halten Sie es einfach und freundlich",
            "WICHTIG: Geben Sie NUR die Nachricht ohne Anführungszeichen oder Erklärungen zurück"
          ],
          example: "Hallo {{1}}! Willkommen bei Luigi's 🍝\nUnsere hausgemachte Pasta wird von Hunderten von Kunden geliebt!"
        },
        es: {
          welcomeText: "Crea un mensaje de bienvenida muy breve (máx. 2-3 líneas, 30 palabras máx.) para este restaurante:",
          context: "El menú será manejado automáticamente por el sistema - NO mencionar acceso al menú, botones o archivos adjuntos.",
          requirements: [
            "Máximo 30 palabras en total",
            "Máximo 2-3 líneas",
            "Incluye {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}})",
            "Incluye el nombre del restaurante",
            "Agrega 1-2 emojis de comida relevantes según la cocina",
            "Enfócate en una bienvenida cálida y la especialidad del restaurante",
            "NO mencionar menú, botones, enlaces o archivos adjuntos",
            "Mantenlo simple y amigable",
            "IMPORTANTE: Devuelve SOLO el mensaje sin comillas o explicaciones"
          ],
          example: "¡Hola {{1}}! Bienvenido a Luigi's 🍝\n¡Nuestra pasta casera es amada por cientos de clientes!"
        }
      };

      // Usa le istruzioni della lingua richiesta o inglese di default se non supportata
      const langInstructions = languageInstructions[language] || languageInstructions.en;
      const menuPromptSuffix = langInstructions.context;

      // Estrai le prime 5 recensioni per il log
      const top5Reviews = restaurantDetails.reviews?.slice(0, 5).map(review => ({
        author: review.author_name || review.authorName,
        rating: review.rating,
        text: review.text?.slice(0, 100) + (review.text?.length > 100 ? '...' : '')
      })) || [];
      
      console.log("📝 Top 5 Reviews:", JSON.stringify(top5Reviews, null, 2));

      const promptContent = `${langInstructions.welcomeText}

Restaurant Name: ${restaurantDetails.name}
Rating: ${restaurantDetails.rating}/5 (${restaurantDetails.ratingsTotal} reviews)
Cuisine: ${restaurantDetails.cuisineTypes?.join(', ')}

Top 5 Reviews:
${restaurantDetails.reviews?.slice(0, 5).map(review => 
  `- "${review.text?.slice(0, 100)}..."`
).join('\n') || ''}

Context: ${menuPromptSuffix}

Requirements:
${langInstructions.requirements.map(req => req).join('\n')}

${language !== 'en' ? `IMPORTANT: The message MUST be in ${language} language.` : ''}

Example:
${langInstructions.example}`;

      console.log("📋 Claude Prompt:", promptContent);

      // Determina il modello da utilizzare
      const model = modelId || "claude-3-7-sonnet-20250219";
      console.log(`🤖 Using Claude model: ${model}`);

      // Genera il messaggio usando Claude
      console.log("🔄 Sending request to Claude...");
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
      console.log("✅ Claude raw response:", fullText);
      
      // Il problema: Claude sta restituendo il messaggio con più righe, ma stiamo perdendo
      // la parte dopo l'a capo perché la consideriamo erroneamente una spiegazione.
      let generatedMessage = fullText;
      
      // Se il messaggio contiene una doppia riga vuota, potrebbe essere una spiegazione aggiuntiva
      if (fullText.includes("\n\n")) {
        // Analizziamo il contenuto prima di decidere cosa scartare
        const parts = fullText.split("\n\n");
        console.log(`🔎 Message has ${parts.length} parts separated by double newlines`);
        
        // Se ci sono 2 paragrafi e il secondo inizia con una frase tipica di spiegazione
        // allora scartiamo il secondo paragrafo
        if (parts.length === 2 && 
            (parts[1].startsWith("This welcome message") || 
             parts[1].startsWith("I've created") || 
             parts[1].startsWith("This message"))) {
          console.log("🔍 Found explanation text after message, removing it");
          generatedMessage = parts[0];
        } else {
          // Altrimenti, probabilmente il \n\n fa parte del formato del messaggio
          // e dobbiamo mantenerlo, sostituendolo con un singolo \n per la formattazione
          console.log("✨ Preserving multiline message format");
          generatedMessage = fullText.replace(/\n\n/g, "\n");
        }
      }
      
      // Rimuovi eventuali virgolette attorno al messaggio
      const beforeCleaning = generatedMessage;
      generatedMessage = generatedMessage.replace(/^["']|["']$/g, "");
      
      if (beforeCleaning !== generatedMessage) {
        console.log("🧹 Removed quotes from message");
      }
      
      console.log("📱 Final message:", generatedMessage);

      res.json({ 
        success: true, 
        message: generatedMessage
      });
    } catch (error) {
      console.error('❌ Error generating welcome message:', error);
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
      
      console.log("🔍 Review Template Request Payload:", JSON.stringify({
        restaurantName,
        reviewLink,
        language,
        modelId,
        forceLanguage,
        restaurantDetailsKeys: restaurantDetails ? Object.keys(restaurantDetails) : 'null'
      }, null, 2));
      
      if (!restaurantDetails) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant details are required'
        });
      }

      console.log("🍽️ Restaurant Info for Review:", JSON.stringify({
        name: restaurantDetails.name,
        rating: restaurantDetails.rating,
        ratingsTotal: restaurantDetails.ratingsTotal,
        cuisineTypes: restaurantDetails.cuisineTypes,
        reviewsCount: restaurantDetails.reviews?.length || 0
      }, null, 2));

      // Debug info
      console.log(`🌐 Generating review template in language: ${language}, forceLanguage: ${forceLanguage}`);
      
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
          example: "Thanks for dining with us, {{1}}! 🌟 Your feedback helps us serve you better."
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
          example: "Grazie per aver cenato da noi, {{1}}! 🌟 Il tuo feedback ci aiuta a servirti meglio."
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
          example: "Merci d'avoir dîné chez nous, {{1}} ! 🌟 Vos commentaires nous aident à mieux vous servir."
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
          example: "Danke für Ihren Besuch bei uns, {{1}}! 🌟 Ihr Feedback hilft uns, Sie besser zu bedienen."
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
          example: "¡Gracias por cenar con nosotros, {{1}}! 🌟 Tus comentarios nos ayudan a servirte mejor."
        }
      };

      // Usa le istruzioni della lingua richiesta o inglese di default se non supportata
      const langInstructions = languageInstructions[language] || languageInstructions.en;

      // Estrai le prime 5 recensioni per il log
      const top5Reviews = restaurantDetails.reviews?.slice(0, 5).map(review => ({
        author: review.author_name || review.authorName,
        rating: review.rating,
        text: review.text?.slice(0, 100) + (review.text?.length > 100 ? '...' : '')
      })) || [];
      
      console.log("📝 Top 5 Reviews for Review Template:", JSON.stringify(top5Reviews, null, 2));

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

      console.log("📋 Claude Review Prompt:", promptContent);

      // Determina il modello da utilizzare
      console.log(`🤖 Using Claude model for review: ${modelId}`);

      // Genera il messaggio usando Claude
      console.log("🔄 Sending review template request to Claude...");
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
      const rawResponse = response.content[0].text;
      console.log("✅ Claude raw review response:", rawResponse);
      
      // Verifica se c'è del testo esplicativo che dovrebbe essere rimosso
      let message = rawResponse;
      
      if (rawResponse.includes("\n\n")) {
        const parts = rawResponse.split("\n\n");
        console.log(`🔎 Review message has ${parts.length} parts separated by double newlines`);
        
        // Se ci sono 2 paragrafi e il secondo inizia con una frase tipica di spiegazione
        if (parts.length >= 2 && 
            (parts[1].startsWith("This message") || 
             parts[1].startsWith("This review") || 
             parts[1].startsWith("I've created"))) {
          console.log("🔍 Found explanation text after review message, removing it");
          message = parts[0];
        }
      }
      
      // Rimuovi eventuali virgolette e spazi iniziali/finali
      message = message.trim().replace(/^["']|["']$/g, "");
      
      // Verifica della lunghezza del messaggio
      console.log(`📊 Review message length: ${message.length} characters`);
      if (message.length < 50 || message.length > 200) {
        console.log("⚠️ Warning: Review message length outside recommended range (50-200 chars)");
      }
      
      // Verifica che il messaggio contenga {{1}} per il nome del cliente
      if (!message.includes("{{1}}")) {
        console.log("⚠️ Warning: Review message does not contain the placeholder {{1}} for customer name");
      }
      
      // Conta gli emoji nel messaggio
      const emojiCount = (message.match(/[\p{Emoji}]/gu) || []).length;
      console.log(`🔢 Emoji count in review message: ${emojiCount}`);
      
      console.log("📱 Final review template:", message);

      res.json({ 
        success: true, 
        templates: [message]
      });
    } catch (error) {
      console.error('❌ Error generating review message:', error);
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

      // Ottieni l'immagine del profilo
      let profileImage = null;
      
      // Controlla se esiste un'immagine principale
      if (restaurant.mainPhoto) {
        profileImage = restaurant.mainPhoto;
      } 
      // Se non c'è un'immagine principale ma ci sono altre foto, usa la prima
      else if (restaurant.photos && restaurant.photos.length > 0) {
        profileImage = restaurant.photos[0];
      }

      // Restituisci sempre il nome del ristorante, con o senza immagine
      return res.status(200).json({
        success: true,
        name: restaurant.name,
        profileImage: profileImage
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