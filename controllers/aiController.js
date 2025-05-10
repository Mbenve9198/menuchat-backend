const { generateTemplateWithClaude, generateImagePrompt, generateImage } = require('../services/aiService');

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

    const prompt = await generateImagePrompt(messageText, campaignType, objective);

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

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt mancante'
      });
    }

    const result = await generateImage(prompt);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Errore nella generazione dell\'immagine:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Errore nella generazione dell\'immagine'
    });
  }
}; 