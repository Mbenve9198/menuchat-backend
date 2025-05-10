const anthropic = require('../config/anthropic');
const openai = require('../config/openai');

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

    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      temperature: 0.7,
      system: 'You are a restaurant marketing expert. Return ONLY the JSON object without any markdown formatting or additional text.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    console.log('Claude response:', message.content[0].text);

    try {
      // Puliamo la risposta da eventuali backticks e markdown
      let cleanResponse = message.content[0].text;
      
      // Rimuovi i backticks e l'indicatore json se presenti
      cleanResponse = cleanResponse.replace(/```json\s*/, '');
      cleanResponse = cleanResponse.replace(/```\s*$/, '');
      cleanResponse = cleanResponse.trim();

      console.log('Cleaned response:', cleanResponse);

      // Estrai la risposta JSON dal messaggio
      const response = JSON.parse(cleanResponse);

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
    throw error;
  }
};

const generateImagePrompt = async (messageText, campaignType, objective) => {
  try {
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
1. Be detailed and specific
2. Focus on the key elements of the campaign
3. Specify the style (e.g. photography, illustration)
4. Include mood and lighting
5. Mention any specific colors or branding elements
6. Be optimized for marketing/advertising use

Respond with just the prompt text, no explanations.`
        }
      ]
    });

    return message.content[0].text;
  } catch (error) {
    console.error('Errore nella generazione del prompt per immagine:', error);
    throw error;
  }
};

const generateImage = async (prompt) => {
  try {
    console.log('Generating image with DALL-E 3 prompt:', prompt);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      style: "vivid",
    });

    console.log('DALL-E response:', response);

    // Non usare la risposta come nuovo prompt
    if (!response.data?.[0]?.url) {
      throw new Error('URL immagine non trovato nella risposta');
    }

    return {
      success: true,
      imageUrl: response.data[0].url,
      revisedPrompt: response.data[0].revised_prompt // opzionale: per debug
    };
  } catch (error) {
    console.error('Errore dettagliato nella generazione dell\'immagine:', error);
    throw error;
  }
};

module.exports = {
  generateTemplateWithClaude,
  generateImagePrompt,
  generateImage
}; 