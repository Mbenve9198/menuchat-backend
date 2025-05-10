const { Configuration, OpenAIApi } = require('openai');

exports.generateTemplate = async (req, res) => {
  try {
    const { campaignType, objective, language } = req.body;

    // Qui implementeremo la chiamata a Claude 3.7
    // Per ora simuliamo una risposta
    const response = await generateTemplateWithClaude(campaignType, objective, language);

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Errore nella generazione del template:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella generazione del template'
    });
  }
};

const generateTemplateWithClaude = async (campaignType, objective, language) => {
  // Qui implementeremo la vera chiamata a Claude
  // Per ora ritorniamo un mock
  return {
    messageText: `Template generato per campagna di tipo ${campaignType}`,
    cta: {
      text: "Clicca qui",
      type: "url",
      value: "https://example.com"
    }
  };
}; 