const jwt = require('jsonwebtoken');

/**
 * Middleware per proteggere le route admin
 */
const adminAuth = (req, res, next) => {
  try {
    // Ottieni il token dall'header Authorization
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token di accesso mancante'
      });
    }

    const token = authHeader.substring(7); // Rimuovi "Bearer "

    // Verifica il token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verifica che sia un token admin
    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato - Privilegi admin richiesti'
      });
    }

    // Aggiungi le informazioni admin alla richiesta
    req.admin = {
      email: decoded.email,
      isAdmin: true
    };

    next();
  } catch (error) {
    console.error('Errore nell\'autenticazione admin:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token scaduto'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token non valido'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

module.exports = adminAuth; 