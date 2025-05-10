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

    // Genera il template
    const template = await generateTemplateWithClaude(campaignType, objective, language);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Errore nella generazione del template:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella generazione del template'
    });
  }
}; 