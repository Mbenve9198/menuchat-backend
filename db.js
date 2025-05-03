const { MongoClient, ServerApiVersion } = require('mongodb');
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Connect to MongoDB with Mongoose
const connectDB = async () => {
  try {
    // Connessione con Mongoose
    await mongoose.connect(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
    console.log('MongoDB connesso con Mongoose');
    
    // Ping per verificare la connessione
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log("Ping MongoDB eseguito con successo");
    
    // Anche se non strettamente necessario, manteniamo una connessione diretta
    // per compatibilità con codice esistente
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connessione client MongoDB diretta verificata");
    
    return mongoose.connection;
  } catch (error) {
    console.error('Errore di connessione MongoDB:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB; 