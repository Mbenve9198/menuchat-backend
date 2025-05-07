const Anthropic = require('@anthropic-ai/sdk');

// Inizializza il client Anthropic con la chiave API dall'ambiente
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

module.exports = anthropic; 