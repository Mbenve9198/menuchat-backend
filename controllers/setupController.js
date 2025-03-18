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
        restaurantAddress, 
        restaurantRating,
        modelId = "claude-3-7-sonnet-20250219"
      } = req.body;
      
      // Utilizziamo i dati inviati dal frontend o recuperiamo dal database
      let restaurantData = {
        name: restaurantName,
        address: restaurantAddress,
        rating: restaurantRating
      };
      
      // Se abbiamo l'ID del ristorante ma mancano altri dettagli, li recuperiamo dal database
      if (restaurantId && (!restaurantName || !restaurantAddress)) {
        const restaurant = await Restaurant.findById(restaurantId);
        if (restaurant) {
          restaurantData = {
            name: restaurant.name || restaurantData.name,
            address: restaurant.address || restaurantData.address,
            rating: restaurant.rating || restaurantData.rating,
            cuisine: restaurant.cuisine,
            specialties: restaurant.specialties
          };
        }
      }

      // Prepara il prompt per Claude con i dati disponibili
      let prompt = `Generate a friendly and engaging welcome message for the following restaurant:

Restaurant Name: ${restaurantData.name || "our restaurant"}
${restaurantData.address ? `Location: ${restaurantData.address}` : ""}
${restaurantData.rating ? `Rating: ${restaurantData.rating}/5 stars` : ""}
${restaurantData.cuisine ? `Cuisine: ${restaurantData.cuisine}` : ""}
${restaurantData.specialties ? `Specialties: ${restaurantData.specialties.join(', ')}` : ""}

The welcome message should:
1. Be friendly, warm, and inviting
2. Include the restaurant name
3. Include appropriate food emojis related to the restaurant type
4. Mention something about the menu or food offerings
5. Include a placeholder like (link menu / pdf) where the menu link will be placed
6. End with a friendly closing phrase like "Buon appetito!" or "Enjoy your meal!"
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
        model,
        max_tokens: 500,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      // Estrai il messaggio dalla risposta
      const generatedMessage = response.content[0].text.trim();

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