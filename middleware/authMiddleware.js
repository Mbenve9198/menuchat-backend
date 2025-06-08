const jwt = require('jsonwebtoken');
const userService = require('../services/userService');

// Chiave segreta per verificare i token JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Log della configurazione JWT (solo in development)
if (process.env.NODE_ENV === 'development') {
  console.log('JWT_SECRET configurato:', JWT_SECRET ? 'SÌ' : 'NO');
}

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

    // Verifica il token con logging migliorato
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      // Log dettagliato dell'errore JWT
      console.error('Errore verifica JWT:', {
        error: jwtError.name,
        message: jwtError.message,
        tokenPreview: token.substring(0, 20) + '...',
        jwtSecretConfigured: !!process.env.JWT_SECRET,
        timestamp: new Date().toISOString()
      });
      
      // Gestisci i diversi tipi di errore JWT
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Token non valido'
        });
      }
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token scaduto'
        });
      }
      
      if (jwtError.name === 'NotBeforeError') {
        return res.status(401).json({
          success: false,
          error: 'Token non ancora valido'
        });
      }
      
      // Errore generico JWT
      return res.status(401).json({
        success: false,
        error: 'Errore di autenticazione'
      });
    }

    // Cerca l'utente nel database
    const user = await userService.findUserById(decoded.userId);

    if (!user) {
      console.error('Utente non trovato per token valido:', {
        userId: decoded.userId,
        timestamp: new Date().toISOString()
      });
      
      return res.status(401).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    // Aggiungi l'utente alla richiesta
    req.user = {
      id: user._id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      restaurantId: decoded.restaurantId || null
    };

    next();
  } catch (error) {
    console.error('Errore generico in authMiddleware:', {
      error: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

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