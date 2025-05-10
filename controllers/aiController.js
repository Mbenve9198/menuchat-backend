const { generateTemplateWithClaude } = require('../services/aiService');

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