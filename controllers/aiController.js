const { generateTemplateWithClaude, generateImagePrompt, generateImage } = require('../services/aiService');
const { anthropic } = require('../services/anthropicService');

exports.generateTemplate = async (req, res) => {
  try {
    const { campaignType, objective, language } = req.body;

    // Validazione input
    if (!campaignType || !objective || !language) {
      return res.status(400).json({
        success: false,
        error: 'Parametri mancanti'
      });
    }

    // Debug log
    console.log('Generating template with params:', {
      campaignType,
      objective,
      language,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY
    });

    // Genera il template
    const template = await generateTemplateWithClaude(campaignType, objective, language);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Errore dettagliato nella generazione del template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Errore nella generazione del template'
    });
  }
};

exports.generateImagePrompt = async (req, res) => {
  try {
    const { messageText, campaignType, objective } = req.body;

    if (!messageText || !campaignType || !objective) {
      return res.status(400).json({
        success: false,
        error: 'Parametri mancanti'
      });
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      temperature: 0.7,
      system: 'You are an expert at creating DALL-E prompts. Create detailed, specific prompts that will generate high-quality marketing images.',
      messages: [
        {
          role: 'user',
          content: `Create a DALL-E prompt for a restaurant marketing image based on this context:
          
Campaign Type: ${campaignType}
Campaign Objective: ${objective}
Message Text: ${messageText}

The prompt should:
1. Be detailed and specific about what should appear in the image
2. Focus on the key elements of the campaign
3. Specify the style (e.g. professional food photography, lifestyle, etc.)
4. Include mood and lighting details
5. Mention specific colors or branding elements
6. Be optimized for marketing/advertising use
7. Include specific composition details

Example format:
"Professional food photography of a gourmet burger on a rustic wooden table, warm ambient lighting, shallow depth of field, garnished with fresh herbs, soft bokeh background, high-end restaurant atmosphere, 4K, high detail"

Respond with just the prompt text, no explanations or additional formatting.`
        }
      ]
    });

    // Estrai il prompt dalla risposta
    const prompt = message.content[0].text.trim();

    res.json({
      success: true,
      data: { prompt }
    });

  } catch (error) {
    console.error('Errore nella generazione del prompt:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Errore nella generazione del prompt'
    });
  }
};

exports.generateImage = async (req, res) => {
  try {
    const { prompt } = req.body;

    // Validazione
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt non valido'
      });
    }

    if (prompt.startsWith('http')) {
      return res.status(400).json({
        success: false,
        error: 'Il prompt non può essere un URL'
      });
    }

    // Genera l'immagine
    const result = await generateImage(prompt);

    res.json({
      success: true,
      data: {
        imageUrl: result.data.imageUrl,
        revisedPrompt: result.data.revisedPrompt
      }
    });
  } catch (error) {
    console.error('Errore dettagliato nella generazione dell\'immagine:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Errore nella generazione dell\'immagine'
    });
  }
}; 