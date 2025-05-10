const anthropic = require('../config/anthropic');

const generatePromptForTemplate = (campaignType, objective, language) => {
  const basePrompt = `You are an expert restaurant marketing specialist.
You need to create a persuasive WhatsApp message for a marketing campaign.

Campaign details:
- Type: ${campaignType}
- Objective: ${objective}
- Language: ${language}

The message must:
- Be concise and direct (max 200 characters)
- Include relevant emojis
- Have a friendly yet professional tone
- End with a clear call-to-action

For the call-to-action, decide whether it's more appropriate to use:
- A link (for online bookings, menu, etc.)
- A phone number (for direct reservations)

Respond in JSON format with this structure:
{
  "messageText": "the message text",
  "cta": {
    "text": "button text",
    "type": "url|phone",
    "value": "url or phone number"
  }
}

Additional specifications based on campaign type:`;

  const campaignSpecifics = {
    promo: `
- Emphasize the value and urgency of the offer
- Clearly include the discount or benefit
- Specify the promotion duration
- Preferred CTA: link to order/book`,

    event: `
- Clearly communicate date and time
- Highlight what makes the event special
- Mention if seats are limited
- Preferred CTA: booking link`,

    update: `
- Present updates with enthusiasm
- Highlight main dishes/changes
- Invite to discover the news
- Preferred CTA: menu link`,

    feedback: `
- Show customer appreciation
- Emphasize feedback brevity (1-2 minutes)
- Mention incentives (discount, freebie)
- Preferred CTA: feedback form link`
  };

  // Add language instruction
  const languageInstruction = language === 'en' ? 
    `Generate the message in English.` :
    `Generate the message in ${language}. Keep CTAs and technical terms in English if appropriate.`;

  return basePrompt + campaignSpecifics[campaignType] + '\n\n' + languageInstruction;
};

const generateTemplateWithClaude = async (campaignType, objective, language) => {
  try {
    const prompt = generatePromptForTemplate(campaignType, objective, language);
    
    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: prompt
      }],
      response_format: { type: 'json' }
    });

    // Estrai la risposta JSON dal messaggio
    const response = JSON.parse(message.content[0].text);

    // Valida la risposta
    if (!response.messageText || !response.cta) {
      throw new Error('Risposta AI non valida');
    }

    return response;
  } catch (error) {
    console.error('Errore nella generazione del template con Claude:', error);
    throw new Error('Errore nella generazione del template');
  }
};

module.exports = {
  generateTemplateWithClaude
}; 