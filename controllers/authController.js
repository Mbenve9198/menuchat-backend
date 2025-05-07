const userService = require('../services/userService');
const jwt = require('jsonwebtoken');
const Restaurant = require('../models/Restaurant');

// Chiave segreta per firmare i token JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const TOKEN_EXPIRY = '7d'; // 7 giorni

/**
 * Controller per gestire l'autenticazione degli utenti
 */
class AuthController {
  /**
   * Gestisce il login di un utente
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Verifica che siano stati forniti email e password
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email e password sono obbligatori'
        });
      }

      // Verifica le credenziali
      const user = await userService.verifyCredentials(email, password);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Credenziali non valide'
        });
      }

      // Trova il ristorante associato all'utente
      const restaurant = await Restaurant.findOne({ user: user._id });
      
      // Genera il token JWT con restaurantId se disponibile
      const token = jwt.sign(
        { 
          userId: user._id, 
          email: user.email,
          restaurantId: restaurant?._id 
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      // Ritorna il token e i dati dell'utente
      res.status(200).json({
        success: true,
        token,
        user: {
          _id: user._id,
          email: user.email,
          fullName: user.fullName,
          subscriptionTier: user.subscriptionTier,
          restaurant: restaurant?._id
        }
      });
    } catch (error) {
      console.error('Errore in login:', error);

      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }

  /**
   * Registra un nuovo utente
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async register(req, res) {
    try {
      const { email, password, fullName } = req.body;

      // Verifica che siano stati forniti email, password e nome completo
      if (!email || !password || !fullName) {
        return res.status(400).json({
          success: false,
          error: 'Email, password e nome completo sono obbligatori'
        });
      }

      // Verifica se l'utente esiste già
      const existingUser = await userService.findUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'L\'email è già registrata'
        });
      }

      // Crea il nuovo utente
      const userData = {
        email,
        password,
        fullName
      };
      
      const user = await userService.createUser(userData);

      // Genera il token JWT
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      // Ritorna il token e i dati dell'utente
      res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          subscriptionTier: user.subscriptionTier
        }
      });
    } catch (error) {
      console.error('Errore in register:', error);

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

      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }

  /**
   * Verifica il token JWT
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async verifyToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token non fornito'
        });
      }

      // Verifica il token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Trova l'utente nel database
      const user = await userService.findUserById(decoded.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Utente non trovato'
        });
      }

      // Ritorna i dati dell'utente
      res.status(200).json({
        success: true,
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          subscriptionTier: user.subscriptionTier
        }
      });
    } catch (error) {
      console.error('Errore in verifyToken:', error);

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Token non valido'
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token scaduto'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Errore del server'
      });
    }
  }

  /**
   * Logout dell'utente (invalidazione token sul client)
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {void}
   */
  logout(req, res) {
    // In realtà, il logout è gestito dal client rimuovendo il token
    // Qui possiamo solo confermare che il logout è avvenuto con successo
    res.status(200).json({
      success: true,
      message: 'Logout effettuato con successo'
    });
  }
}

module.exports = new AuthController(); 