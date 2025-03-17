require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
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
app.use(cors());
app.use(helmet());

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