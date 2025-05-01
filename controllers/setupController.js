const userService = require('../services/userService');
const restaurantService = require('../services/restaurantService');
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

      // Ritorna la risposta con i dati dell'utente e del ristorante
      res.status(201).json({
        success: true,
        userId: user._id,
        restaurantId: restaurant._id
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
        modelId = "claude-3-7-sonnet-20250219"
      } = req.body;
      
      if (!restaurantDetails) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant details are required'
        });
      }

      const promptContent = `Analyze these restaurant details and reviews to create a very concise welcome message (max 40 words):

Restaurant Name: ${restaurantDetails.name}
Rating: ${restaurantDetails.rating}/5 (${restaurantDetails.ratingsTotal} reviews)
Cuisine: ${restaurantDetails.cuisineTypes?.join(', ')}

Top 5 Reviews:
${restaurantDetails.reviews?.slice(0, 5).map(review => 
  `- "${review.text.slice(0, 100)}..."`
).join('\n') || ''}

Requirements:
1. Maximum 40 words
2. Include {customerName} placeholder
3. Include restaurant name
4. Add relevant food emojis based on cuisine and reviews
5. Include (menu_link) placeholder
6. Highlight what customers love most based on reviews
7. Keep it friendly and welcoming
8. IMPORTANT: Return ONLY the welcome message without any description, explanation, or comments. Do not include quotes around the message.

Example (32 words):
Hi {customerName}! Welcome to Luigi's 🍝
Our homemade pasta got 200+ five-star reviews! Check our menu:
(menu_link)
Buon appetito! 🇮🇹`;

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

      const promptContent = `Create 3 different review request messages for a restaurant. Each should be unique but follow these guidelines:

Restaurant Name: ${restaurantDetails.name}
Rating: ${restaurantDetails.rating}/5 (${restaurantDetails.ratingsTotal} reviews)
Cuisine: ${restaurantDetails.cuisineTypes?.join(', ') || 'Various'}

Requirements for EACH template:
1. Be friendly and conversational
2. Keep each message to 120-150 characters
3. Ask customers to leave a review
4. Don't include the review link directly in the message (it will be added automatically)
5. Each template should have a different style:
   - Template 1: Direct and simple
   - Template 2: Emphasize how feedback helps the restaurant
   - Template 3: Thank the customer for their order first

Response format must be EXACTLY:
Template 1: [first template text]
Template 2: [second template text]
Template 3: [third template text]

Do not include the review link or any placeholders for it in the templates.`;

      // Genera i template usando Claude
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

      // Estrai i template dalla risposta
      const fullText = response.content[0].text;
      const templates = fullText
        .split(/Template \d+: /)
        .filter(text => text.trim().length > 0)
        .map(text => text.trim());

      res.json({ 
        success: true, 
        templates: templates
      });
    } catch (error) {
      console.error('Error generating review templates:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error generating review templates',
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