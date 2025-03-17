const jwt = require('jsonwebtoken');
const userService = require('../services/userService');

// Chiave segreta per verificare i token JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

/**
 * Middleware per proteggere le rotte che richiedono autenticazione
 * @param {Object} req - Richiesta HTTP
 * @param {Object} res - Risposta HTTP
 * @param {Function} next - Funzione next
 * @returns {Promise<void>}
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Controlla se il token è presente nell'header Authorization
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Se non c'è il token, ritorna un errore
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Non sei autorizzato ad accedere a questa risorsa'
      });
    }

    // Verifica il token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Cerca l'utente nel database
    const user = await userService.findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    // Aggiungi l'utente alla richiesta
    req.user = {
      id: user._id,
      email: user.email,
      subscriptionTier: user.subscriptionTier
    };

    next();
  } catch (error) {
    console.error('Errore in authMiddleware:', error);

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
};

/**
 * Middleware per verificare che l'utente sia amministratore
 * @param {Object} req - Richiesta HTTP
 * @param {Object} res - Risposta HTTP
 * @param {Function} next - Funzione next
 * @returns {void}
 */
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({
      success: false,
      error: 'Non sei autorizzato ad accedere a questa risorsa'
    });
  }
};

/**
 * Middleware per verificare che l'utente sia premium
 * @param {Object} req - Richiesta HTTP
 * @param {Object} res - Risposta HTTP
 * @param {Function} next - Funzione next
 * @returns {void}
 */
const premium = (req, res, next) => {
  if (req.user && req.user.subscriptionTier === 'premium') {
    next();
  } else {
    res.status(403).json({
      success: false,
      error: 'Questa funzionalità è disponibile solo per gli utenti premium'
    });
  }
};

module.exports = { protect, admin, premium }; 