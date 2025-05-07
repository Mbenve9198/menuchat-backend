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
        modelId = "claude-3-7-sonnet-20250219"
      } = req.body;
      
      if (!restaurantDetails) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant details are required'
        });
      }

      const menuPromptSuffix = menuType === 'pdf' 
        ? "The menu will be attached as a PDF file to this message."
        : "The menu will be accessible via a button below this message.";

      const promptContent = `Analyze these restaurant details and reviews to create a very concise welcome message (max 40 words):

Restaurant Name: ${restaurantDetails.name}
Rating: ${restaurantDetails.rating}/5 (${restaurantDetails.ratingsTotal} reviews)
Cuisine: ${restaurantDetails.cuisineTypes?.join(', ')}

Top 5 Reviews:
${restaurantDetails.reviews?.slice(0, 5).map(review => 
  `- "${review.text.slice(0, 100)}..."`
).join('\n') || ''}

Context: ${menuPromptSuffix}

Requirements:
1. Maximum 40 words
2. Include {{1}} as a placeholder for the customer's name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)
3. Include restaurant name
4. Add relevant food emojis based on cuisine and reviews
5. Highlight what customers love most based on reviews
6. Keep it friendly and welcoming
7. DO NOT include any URLs or placeholders for menu links
8. IMPORTANT: Return ONLY the welcome message without any description, explanation, or comments. Do not include quotes around the message.

Example for PDF menu (32 words):
Hi {{1}}! Welcome to Luigi's 🍝
Our homemade pasta got 200+ five-star reviews! I've attached our menu with all our specialties.

Example for URL menu (32 words):
Hi {{1}}! Welcome to Luigi's 🍝
Our homemade pasta got 200+ five-star reviews! Check out our menu with all our specialties below.`;

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
        modelId = "claude-3-7-sonnet-20250219"
      } = req.body;
      
      if (!restaurantDetails) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant details are required'
        });
      }

      const promptContent = `Create an optimized review request message for a restaurant. The message should encourage customers to leave a review by clicking a button that will be shown below the message.

Restaurant Name: ${restaurantDetails.name}
Rating: ${restaurantDetails.rating}/5 (${restaurantDetails.ratingsTotal} reviews)
Cuisine: ${restaurantDetails.cuisineTypes?.join(', ') || 'Various'}

Requirements:
1. Be friendly and conversational
2. Keep the message between 100-120 characters
3. Don't mention or include the review link (it will be in a button below)
4. Focus on one of these approaches:
   - Thank the customer for their order
   - Emphasize how feedback helps the restaurant improve
   - Highlight the value of customer opinions
5. Use appropriate emojis (max 2)
6. Don't use generic phrases like "leave a review"
7. Make it personal and engaging
8. Use {{1}} as a placeholder for the customer's name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)

Response format:
Return ONLY the message text, without quotes or any additional explanation.

Example:
Thanks for dining with us, {{1}}! 🌟 Your opinion means the world to us - we'd love to hear about your experience with our dishes.`;

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
}

module.exports = new SetupController(); 