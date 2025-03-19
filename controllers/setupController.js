const userService = require('../services/userService');
const restaurantService = require('../services/restaurantService');
const Restaurant = require('../models/Restaurant');
const Anthropic = require('@anthropic-ai/sdk');

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

      // Prepara il prompt per Claude con i dati dettagliati
      let promptContent = `Analyze these restaurant details and reviews to create a very concise welcome message (max 40 words):
      let promptContent = `Generate a friendly and engaging welcome message for the following restaurant:

Restaurant Name: ${restaurantDetails.name}
Location: ${restaurantDetails.address}
Rating: ${restaurantDetails.rating}/5 stars (${restaurantDetails.ratingsTotal} reviews)
Cuisine Types: ${restaurantDetails.cuisineTypes.join(', ')}
${restaurantDetails.priceLevel ? `Price Level: ${'€'.repeat(restaurantDetails.priceLevel)}` : ''}
${restaurantDetails.openingHours ? `Opening Hours:\n${restaurantDetails.openingHours.join('\n')}` : ''}
${restaurantDetails.website ? `Website: ${restaurantDetails.website}` : ''}
${restaurantDetails.phoneNumber ? `Phone: ${restaurantDetails.phoneNumber}` : ''}

Sample Reviews:
${restaurantDetails.reviews?.slice(0, 3).map(review => 
  `- "${review.text.slice(0, 100)}..."`
).join('\n') || ''}

The welcome message should:
1. Be friendly, warm, and inviting
2. Include the restaurant name
3. Include appropriate food emojis related to the specific cuisine type
4. Mention something unique about the restaurant based on the reviews or cuisine type
5. Include a placeholder like (link menu / pdf) where the menu link will be placed
6. End with a friendly closing phrase appropriate for the cuisine type
7. Be around 4-6 lines long with proper spacing
8. Be in English
9. Include a personalized greeting with {customerName} placeholder

Example format (but create your own unique message):

Hello {customerName}, welcome to [Restaurant Name] 🍽️

Our menu features delicious [type of food] specialties prepared with fresh ingredients. We're known for our [famous dish].

(link menu / pdf)

Enjoy your meal! 😋`;

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
      const generatedMessage = response.content[0].text;

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
}

module.exports = new SetupController(); 