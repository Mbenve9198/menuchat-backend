const anthropic = require('../config/anthropic');

const generatePromptForTemplate = (campaignType, objective, language) => {
  const basePrompt = `Create a WhatsApp marketing message based on these details.
IMPORTANT: Your response must be a valid JSON object with this exact structure:
{
  "messageText": "your message here",
  "cta": {
    "text": "button text",
    "type": "url|phone",
    "value": "url or phone number"
  }
}

Campaign details:
- Type: ${campaignType}
- Objective: ${objective}
- Language: ${language}

Requirements:
1. Message must be concise (max 200 characters)
2. Include relevant emojis
3. Use friendly yet professional tone
4. End with clear call-to-action

CTA options:
- URL: for online bookings/menu
- Phone: for direct reservations`;

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
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY non configurata');
    }

    const prompt = generatePromptForTemplate(campaignType, objective, language);
    
    console.log('Sending prompt to Claude:', prompt);

    // Rimuoviamo response_format e aggiungiamo system message
    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'You are a restaurant marketing expert. Always respond in valid JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    console.log('Claude response:', message.content[0].text);

    try {
      // Estrai la risposta JSON dal messaggio
      const response = JSON.parse(message.content[0].text);

      // Validazione della risposta
      if (!response.messageText || !response.cta) {
        throw new Error('Risposta AI non valida: mancano campi richiesti');
      }

      return response;
    } catch (parseError) {
      console.error('Errore nel parsing della risposta:', parseError);
      console.log('Risposta raw:', message.content[0].text);
      throw new Error('Errore nel parsing della risposta AI');
    }
  } catch (error) {
    console.error('Errore dettagliato in generateTemplateWithClaude:', error);
    
    if (error.name === 'SyntaxError') {
      throw new Error('Errore nel parsing della risposta AI');
    }
    
    throw error;
  }
};

module.exports = {
  generateTemplateWithClaude
}; 