const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Genera un'immagine usando DALL-E 3 basata sul prompt fornito
 * @param {Object} req - Richiesta Express
 * @param {Object} res - Risposta Express
 * @returns {Promise<void>}
 */
exports.generateImage = async (req, res) => {
  try {
    const { prompt, restaurantId } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt è richiesto'
      });
    }
    
    console.log(`Generazione immagine per ristorante: ${restaurantId}`);
    console.log(`Prompt: ${prompt}`);
    
    // Verifica che l'utente abbia accesso al ristorante
    if (req.user.restaurantId !== restaurantId) {
      return res.status(403).json({
        success: false,
        error: 'Accesso non autorizzato a questo ristorante'
      });
    }
    
    // Chiamata a DALL-E 3 per generare l'immagine
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "url",
    });
    
    if (!response.data || response.data.length === 0) {
      throw new Error('Nessuna immagine generata');
    }
    
    const imageUrl = response.data[0].url;
    console.log(`Immagine generata: ${imageUrl.substring(0, 50)}...`);
    
    return res.json({
      success: true,
      imageUrl
    });
    
  } catch (error) {
    console.error('Errore nella generazione dell\'immagine:', error);
    
    // Gestione dettagliata dell'errore
    let errorMessage = 'Errore durante la generazione dell\'immagine';
    
    if (error.response) {
      // Errore API OpenAI
      console.error('Errore API OpenAI:', error.response.data);
      errorMessage = error.response.data.error.message || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}; 