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

      let menuTemplate = null;
      let reviewTemplate = null;
      let templateError = null;

      try {
        // Determina il tipo di menu e crea il template appropriato
        const menuLanguages = formData.menuLanguages || [];

        console.log('Menu languages ricevute:', JSON.stringify(menuLanguages, null, 2));

        // Verifica che ci sia almeno una lingua con un menu
        const languagesWithMenu = menuLanguages.filter(lang => {
          const hasUrl = lang.menuUrl && lang.menuUrl.trim() !== '';
          const hasPdf = lang.menuPdfUrl && lang.menuPdfUrl.trim() !== '';
          return hasUrl || hasPdf;
        });

        if (languagesWithMenu.length === 0) {
          console.error('Nessuna lingua con menu trovata');
          throw new Error('È necessario configurare almeno un menu (URL o PDF) per una lingua');
        }

        console.log('Lingue con menu valide:', languagesWithMenu.map(l => 
          `${l.language.code} - ${l.menuUrl ? 'URL: ' + l.menuUrl : 'PDF: ' + l.menuPdfUrl}`
        ));

        // Determina il tipo principale di menu (se c'è almeno un PDF, usa 'pdf', altrimenti 'url')
        const hasAnyPdf = languagesWithMenu.some(lang => lang.menuPdfUrl && lang.menuPdfUrl.trim() !== '');
        const menuType = hasAnyPdf ? 'pdf' : 'url';

        // Per retrocompatibilità, trova un URL di fallback
        const fallbackLanguage = languagesWithMenu[0];
        const fallbackUrl = fallbackLanguage.menuPdfUrl || fallbackLanguage.menuUrl || '';

        console.log('Tipo di menu determinato:', menuType);
        console.log('URL di fallback:', fallbackUrl);

        // Crea il template del menu passando le lingue specifiche
        console.log('=== CREAZIONE TEMPLATE MENU ===');
        menuTemplate = await whatsappTemplateService.createMenuTemplate(
          restaurant._id,
          menuType,
          formData.welcomeMessage,
          fallbackUrl,
          menuLanguages // Passa l'array completo delle lingue
        );
        console.log('Template menu creato:', menuTemplate ? `ID: ${menuTemplate._id}, Status: ${menuTemplate.status}` : 'FALLITO');

        // Crea il template per le recensioni
        console.log('=== CREAZIONE TEMPLATE REVIEW ===');
        console.log('Review message:', formData.reviewTemplate);
        console.log('Review link:', formData.reviewLink);
        
        if (!formData.reviewLink || formData.reviewLink.trim() === '') {
          console.error('Review link mancante, salto la creazione del template di review');
          throw new Error('Review link è richiesto per creare il template di recensione');
        }
        
        reviewTemplate = await whatsappTemplateService.createReviewTemplate(
          restaurant._id,
          formData.reviewTemplate || "Grazie per aver ordinato da noi! 🌟 La tua opinione è importante - ci piacerebbe sapere cosa ne pensi della tua esperienza.",
          formData.reviewLink
        );
        console.log('Template review creato:', reviewTemplate ? `ID: ${reviewTemplate._id}, Status: ${reviewTemplate.status}` : 'FALLITO');

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
          welcomeText: "Create a SERVICE-oriented menu response message for a restaurant. This is a RESPONSE to a customer's request for menu information.",
          context: menuType === 'pdf' 
            ? "The menu will be attached as a PDF file to this message."
            : "The menu will be accessible via a button below this message.",
          requirements: [
            "CRITICAL: This is a SERVICE message - responding to a customer's menu request",
            "Use INFORMATIONAL language, not promotional language",
            "Focus on PROVIDING the requested service (menu access)",
            "Use words like: 'Here is', 'Available', 'You can view', 'As requested'",
            "AVOID marketing words like: 'discover', 'explore', 'amazing', 'delicious', 'fantastic'",
            "Maximum 40 words to stay service-focused",
            "Include {{1}} as placeholder for customer name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)",
            "Include the restaurant name",
            "Add relevant food emojis based on cuisine",
            "Keep it helpful and informative, like a waiter responding to 'Can I see the menu?'",
            "DO NOT include URLs or placeholders for menu links",
            "IMPORTANT: Return ONLY the welcome message without description, explanation or comments. Do not include quotes around the message."
          ],
          example: menuType === 'pdf'
            ? "Hi {{1}}! Here is Luigi's menu 🍝\nOur pasta menu is attached for you to view."
            : "Hi {{1}}! Here is Luigi's menu 🍝\nYou can view our pasta offerings below."
        },
        it: {
          welcomeText: "Crea un messaggio di risposta SERVICE per un ristorante. Questo è una RISPOSTA alla richiesta del cliente per informazioni sul menu.",
          context: menuType === 'pdf' 
            ? "Il menu sarà allegato come file PDF a questo messaggio."
            : "Il menu sarà accessibile tramite un pulsante sotto questo messaggio.",
          requirements: [
            "CRITICO: Questo è un messaggio SERVICE - risposta alla richiesta del menu del cliente",
            "Usa linguaggio INFORMATIVO, non promozionale",
            "Concentrati sul FORNIRE il servizio richiesto (accesso al menu)",
            "Usa parole come: 'Ecco', 'Disponibile', 'Puoi vedere', 'Come richiesto'",
            "EVITA parole di marketing come: 'scopri', 'esplora', 'fantastico', 'delizioso'",
            "Massimo 40 parole per rimanere focalizzato sul servizio",
            "Includi {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}}, non {customerName} o altre variazioni)",
            "Includi il nome del ristorante",
            "Aggiungi emoji di cibo rilevanti basate sulla cucina",
            "Mantienilo utile e informativo, come un cameriere che risponde a 'Posso vedere il menu?'",
            "NON includere URL o segnaposto per link al menu",
            "IMPORTANTE: Restituisci SOLO il messaggio di benvenuto senza descrizione, spiegazione o commenti. Non includere virgolette attorno al messaggio."
          ],
          example: menuType === 'pdf'
            ? "Ciao {{1}}! Ecco il menu di Luigi's 🍝\nIl nostro menu pasta è allegato per la tua consultazione."
            : "Ciao {{1}}! Ecco il menu di Luigi's 🍝\nPuoi consultare le nostre proposte pasta qui sotto."
        },
        fr: {
          welcomeText: "Créez un message de réponse SERVICE pour un restaurant. Ceci est une RÉPONSE à la demande du client pour les informations du menu.",
          context: menuType === 'pdf' 
            ? "Le menu sera joint en tant que fichier PDF à ce message."
            : "Le menu sera accessible via un bouton sous ce message.",
          requirements: [
            "CRITIQUE: Ceci est un message SERVICE - réponse à la demande de menu du client",
            "Utilisez un langage INFORMATIF, pas promotionnel",
            "Concentrez-vous sur FOURNIR le service demandé (accès au menu)",
            "Utilisez des mots comme: 'Voici', 'Disponible', 'Vous pouvez voir', 'Comme demandé'",
            "ÉVITEZ les mots marketing comme: 'découvrir', 'explorer', 'fantastique', 'délicieux'",
            "Maximum 40 mots pour rester axé sur le service",
            "Incluez {{1}} comme espace réservé pour le nom du client (IMPORTANT: utilisez exactement {{1}}, pas {customerName} ou autres variations)",
            "Incluez le nom du restaurant",
            "Ajoutez des emojis de nourriture pertinents basés sur la cuisine",
            "Gardez-le utile et informatif, comme un serveur répondant à 'Puis-je voir le menu?'",
            "N'incluez PAS d'URLs ou d'espaces réservés pour les liens du menu",
            "IMPORTANT: Retournez SEULEMENT le message de bienvenue sans description, explication ou commentaires. N'incluez pas de guillemets autour du message."
          ],
          example: menuType === 'pdf'
            ? "Salut {{1}}! Voici le menu de Luigi's 🍝\nNotre menu pasta est joint pour votre consultation."
            : "Salut {{1}}! Voici le menu de Luigi's 🍝\nVous pouvez consulter nos offres pasta ci-dessous."
        },
        de: {
          welcomeText: "Erstellen Sie eine SERVICE-orientierte Menü-Antwortnachricht für ein Restaurant. Dies ist eine ANTWORT auf die Menü-Anfrage des Kunden.",
          context: menuType === 'pdf' 
            ? "Das Menü wird dieser Nachricht als PDF-Datei beigefügt."
            : "Das Menü wird über eine Schaltfläche unter dieser Nachricht zugänglich sein.",
          requirements: [
            "KRITISCH: Dies ist eine SERVICE-Nachricht - Antwort auf die Menü-Anfrage des Kunden",
            "Verwenden Sie INFORMATIVE Sprache, nicht Werbesprache",
            "Konzentrieren Sie sich darauf, den angeforderten Service zu BIETEN (Menü-Zugang)",
            "Verwenden Sie Wörter wie: 'Hier ist', 'Verfügbar', 'Sie können sehen', 'Wie angefordert'",
            "VERMEIDEN Sie Marketing-Wörter wie: 'entdecken', 'erkunden', 'fantastisch', 'köstlich'",
            "Maximal 40 Wörter, um service-fokussiert zu bleiben",
            "Fügen Sie {{1}} als Platzhalter für den Namen des Kunden ein (WICHTIG: Verwenden Sie genau {{1}}, nicht {customerName} oder andere Variationen)",
            "Nennen Sie den Namen des Restaurants",
            "Fügen Sie relevante Lebensmittel-Emojis basierend auf der Küche hinzu",
            "Halten Sie es hilfreich und informativ, wie ein Kellner, der auf 'Kann ich das Menü sehen?' antwortet",
            "Fügen Sie KEINE URLs oder Platzhalter für Menülinks ein",
            "WICHTIG: Geben Sie NUR die Willkommensnachricht ohne Beschreibung, Erklärung oder Kommentare zurück. Verwenden Sie keine Anführungszeichen um die Nachricht."
          ],
          example: menuType === 'pdf'
            ? "Hallo {{1}}! Hier ist Luigi's Menü 🍝\nUnser Pasta-Menü ist zur Ansicht beigefügt."
            : "Hallo {{1}}! Hier ist Luigi's Menü 🍝\nSie können unser Pasta-Angebot unten einsehen."
        },
        es: {
          welcomeText: "Crea un mensaje de respuesta SERVICE para un restaurante. Esta es una RESPUESTA a la solicitud del cliente para información del menú.",
          context: menuType === 'pdf' 
            ? "El menú se adjuntará como archivo PDF a este mensaje."
            : "El menú será accesible mediante un botón debajo de este mensaje.",
          requirements: [
            "CRÍTICO: Este es un mensaje SERVICE - respuesta a la solicitud de menú del cliente",
            "Usa lenguaje INFORMATIVO, no promocional",
            "Enfócate en PROPORCIONAR el servicio solicitado (acceso al menú)",
            "Usa palabras como: 'Aquí está', 'Disponible', 'Puedes ver', 'Como solicitado'",
            "EVITA palabras de marketing como: 'descubrir', 'explorar', 'fantástico', 'delicioso'",
            "Máximo 40 palabras para mantenerse enfocado en el servicio",
            "Incluye {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}}, no {customerName} u otras variaciones)",
            "Incluye el nombre del restaurante",
            "Agrega emojis de comida relevantes según la cocina",
            "Mantenlo útil e informativo, como un mesero respondiendo a '¿Puedo ver el menú?'",
            "NO incluyas URLs o marcadores de posición para enlaces al menú",
            "IMPORTANTE: Devuelve SOLO el mensaje de bienvenida sin descripción, explicación o comentarios. No incluyas comillas alrededor del mensaje."
          ],
          example: menuType === 'pdf'
            ? "¡Hola {{1}}! Aquí está el menú de Luigi's 🍝\nNuestro menú de pasta está adjunto para tu consulta."
            : "¡Hola {{1}}! Aquí está el menú de Luigi's 🍝\nPuedes consultar nuestras ofertas de pasta a continuación."
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
          welcomeText: "Create a SERVICE-oriented review follow-up message for a restaurant. This is a FOLLOW-UP after the customer received service.",
          requirements: [
            "CRITICAL: This is a SERVICE message - follow-up after customer received service",
            "Use INFORMATIONAL and HELPFUL language, not promotional language",
            "Focus on PROVIDING a service (feedback collection to improve service)",
            "Use words like: 'How was', 'Your feedback helps', 'We'd appreciate', 'To improve our service'",
            "AVOID marketing words like: 'amazing', 'fantastic', 'discover', 'explore'",
            "Keep the message between 100-120 characters to stay service-focused",
            "Don't mention or include the review link (it will be in a button below)",
            "Focus on service improvement, not promotion:",
            "   - Thank the customer for their visit/order",
            "   - Emphasize how feedback helps improve service quality",
            "   - Position it as helping other customers receive better service",
            "Use appropriate emojis (max 2) - prefer service-oriented ones like ⭐ 📝",
            "Don't use generic phrases like 'leave a review' - use 'share your experience'",
            "Make it sound like a waiter asking 'How was everything?'",
            "Use {{1}} as a placeholder for the customer's name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)"
          ],
          example: "Hi {{1}}! How was your experience with us? ⭐ Your feedback helps us improve our service."
        },
        it: {
          welcomeText: "Crea un messaggio di follow-up SERVICE per un ristorante. Questo è un FOLLOW-UP dopo che il cliente ha ricevuto il servizio.",
          requirements: [
            "CRITICO: Questo è un messaggio SERVICE - follow-up dopo che il cliente ha ricevuto il servizio",
            "Usa linguaggio INFORMATIVO e UTILE, non promozionale",
            "Concentrati sul FORNIRE un servizio (raccolta feedback per migliorare il servizio)",
            "Usa parole come: 'Come è stato', 'Il tuo feedback ci aiuta', 'Apprezzeremmo', 'Per migliorare il nostro servizio'",
            "EVITA parole di marketing come: 'fantastico', 'incredibile', 'scopri', 'esplora'",
            "Mantieni il messaggio tra 100-120 caratteri per rimanere focalizzato sul servizio",
            "Non menzionare o includere il link alla recensione (sarà in un pulsante sotto)",
            "Concentrati sul miglioramento del servizio, non sulla promozione:",
            "   - Ringrazia il cliente per la sua visita/ordine",
            "   - Enfatizza come il feedback aiuta a migliorare la qualità del servizio",
            "   - Posizionalo come aiuto per altri clienti a ricevere un servizio migliore",
            "Usa emoji appropriate (massimo 2) - preferisci quelle orientate al servizio come ⭐ 📝",
            "Non usare frasi generiche come 'lascia una recensione' - usa 'condividi la tua esperienza'",
            "Fallo suonare come un cameriere che chiede 'Come è andato tutto?'",
            "Usa {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}}, non {customerName} o altre variazioni)"
          ],
          example: "Ciao {{1}}! Come è stata la tua esperienza da noi? ⭐ Il tuo feedback ci aiuta a migliorare il nostro servizio."
        },
        fr: {
          welcomeText: "Créez un message de suivi SERVICE pour un restaurant. Ceci est un SUIVI après que le client ait reçu le service.",
          requirements: [
            "CRITIQUE: Ceci est un message SERVICE - suivi après que le client ait reçu le service",
            "Utilisez un langage INFORMATIF et UTILE, pas promotionnel",
            "Concentrez-vous sur FOURNIR un service (collecte de commentaires pour améliorer le service)",
            "Utilisez des mots comme: 'Comment était', 'Vos commentaires nous aident', 'Nous apprécierions', 'Pour améliorer notre service'",
            "ÉVITEZ les mots marketing comme: 'fantastique', 'incroyable', 'découvrir', 'explorer'",
            "Gardez le message entre 100 et 120 caractères pour rester axé sur le service",
            "Ne mentionnez pas et n'incluez pas le lien d'avis (il sera dans un bouton ci-dessous)",
            "Concentrez-vous sur l'amélioration du service, pas sur la promotion:",
            "   - Remerciez le client pour sa visite/commande",
            "   - Soulignez comment les commentaires aident à améliorer la qualité du service",
            "   - Positionnez-le comme une aide pour d'autres clients à recevoir un meilleur service",
            "Utilisez des emojis appropriés (maximum 2) - préférez ceux orientés service comme ⭐ 📝",
            "N'utilisez pas de phrases génériques comme 'laissez un avis' - utilisez 'partagez votre expérience'",
            "Faites-le sonner comme un serveur demandant 'Comment était tout?'",
            "Utilisez {{1}} comme espace réservé pour le nom du client (IMPORTANT: utilisez exactement {{1}}, pas {customerName} ou autres variations)"
          ],
          example: "Salut {{1}}! Comment était votre expérience chez nous? ⭐ Vos commentaires nous aident à améliorer notre service."
        },
        de: {
          welcomeText: "Erstellen Sie eine SERVICE-orientierte Nachfass-Nachricht für ein Restaurant. Dies ist eine NACHFASSUNG nachdem der Kunde den Service erhalten hat.",
          requirements: [
            "KRITISCH: Dies ist eine SERVICE-Nachricht - Nachfassung nachdem der Kunde den Service erhalten hat",
            "Verwenden Sie INFORMATIVE und HILFREICHE Sprache, nicht Werbesprache",
            "Konzentrieren Sie sich darauf, einen Service zu BIETEN (Feedback-Sammlung zur Serviceverbesserung)",
            "Verwenden Sie Wörter wie: 'Wie war', 'Ihr Feedback hilft uns', 'Wir würden schätzen', 'Um unseren Service zu verbessern'",
            "VERMEIDEN Sie Marketing-Wörter wie: 'fantastisch', 'unglaublich', 'entdecken', 'erkunden'",
            "Halten Sie die Nachricht zwischen 100-120 Zeichen, um service-fokussiert zu bleiben",
            "Erwähnen oder fügen Sie den Bewertungslink nicht ein (er wird in einer Schaltfläche unten angezeigt)",
            "Konzentrieren Sie sich auf Serviceverbesserung, nicht auf Werbung:",
            "   - Danken Sie dem Kunden für seinen Besuch/seine Bestellung",
            "   - Betonen Sie, wie Feedback hilft, die Servicequalität zu verbessern",
            "   - Positionieren Sie es als Hilfe für andere Kunden, besseren Service zu erhalten",
            "Verwenden Sie passende Emojis (maximal 2) - bevorzugen Sie service-orientierte wie ⭐ 📝",
            "Verwenden Sie keine generischen Phrasen wie 'Bewertung abgeben' - verwenden Sie 'Erfahrung teilen'",
            "Lassen Sie es klingen wie ein Kellner, der fragt 'Wie war alles?'",
            "Verwenden Sie {{1}} als Platzhalter für den Namen des Kunden (WICHTIG: Verwenden Sie genau {{1}}, nicht {customerName} oder andere Variationen)"
          ],
          example: "Hallo {{1}}! Wie war Ihre Erfahrung bei uns? ⭐ Ihr Feedback hilft uns, unseren Service zu verbessern."
        },
        es: {
          welcomeText: "Crea un mensaje de seguimiento SERVICE para un restaurante. Este es un SEGUIMIENTO después de que el cliente recibió el servicio.",
          requirements: [
            "CRÍTICO: Este es un mensaje SERVICE - seguimiento después de que el cliente recibió el servicio",
            "Usa lenguaje INFORMATIVO y ÚTIL, no promocional",
            "Enfócate en PROPORCIONAR un servicio (recolección de comentarios para mejorar el servicio)",
            "Usa palabras como: 'Cómo estuvo', 'Tus comentarios nos ayudan', 'Apreciaríamos', 'Para mejorar nuestro servicio'",
            "EVITA palabras de marketing como: 'fantástico', 'increíble', 'descubrir', 'explorar'",
            "Mantén el mensaje entre 100-120 caracteres para mantenerse enfocado en el servicio",
            "No menciones ni incluyas el enlace de reseña (estará en un botón debajo)",
            "Concéntrate en la mejora del servicio, no en la promoción:",
            "   - Agradece al cliente por su visita/pedido",
            "   - Enfatiza cómo los comentarios ayudan a mejorar la calidad del servicio",
            "   - Posiciónalo como ayuda para que otros clientes reciban mejor servicio",
            "Usa emojis apropiados (máximo 2) - prefiere los orientados al servicio como ⭐ 📝",
            "No uses frases genéricas como 'deja una reseña' - usa 'comparte tu experiencia'",
            "Hazlo sonar como un mesero preguntando '¿Cómo estuvo todo?'",
            "Usa {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}}, no {customerName} u otras variaciones)"
          ],
          example: "¡Hola {{1}}! ¿Cómo estuvo tu experiencia con nosotros? ⭐ Tus comentarios nos ayudan a mejorar nuestro servicio."
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