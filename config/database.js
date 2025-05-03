const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Impostazioni di configurazione per MongoDB
    const options = {
      serverApi: {
        version: mongoose.mongo.ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    };

    // URI di connessione da variabile d'ambiente
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MongoDB URI non configurato nelle variabili d\'ambiente');
    }

    // Connessione con Mongoose
    const conn = await mongoose.connect(uri, options);
    
    console.log(`MongoDB connesso: ${conn.connection.host}`);
    
    // Ping per verificare la connessione
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log("Ping MongoDB eseguito con successo");
    
    return conn;
  } catch (error) {
    console.error('Errore di connessione MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB; 