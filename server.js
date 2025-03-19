require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
// Commentato temporaneamente per il deploy
// const helmet = require('helmet');
const connectDB = require('./db');
const routes = require('./routes');

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 5000;

// Connessione al database
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',                // development
      'https://menuchat.com',                 // production (aggiungi il tuo dominio principale)
      /^https:\/\/.*\.vercel\.app$/          // tutti i domini vercel.app
    ];

    // Permetti richieste senza origin (es. Postman)
    if (!origin) {
      return callback(null, true);
    }

    // Controlla se l'origin è nella lista o matcha il pattern vercel.app
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
// Commentato temporaneamente per il deploy
// app.use(helmet());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rotte API
app.use('/api', routes);

// Rotta di base per verifica che il server funzioni
app.get('/', (req, res) => {
  res.json({ message: 'MenuChat API' });
});

// Gestione errori 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' });
});

// Gestione errori generici
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Errore del server' });
});

// Avvio del server
app.listen(PORT, () => {
  console.log(`Server in esecuzione sulla porta ${PORT} in modalità ${process.env.NODE_ENV || 'development'}`);
}); 