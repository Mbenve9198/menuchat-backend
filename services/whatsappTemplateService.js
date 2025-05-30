const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');
const twilio = require('twilio');
const crypto = require('crypto');
const axios = require('axios');
const anthropic = require('../services/anthropic');

// Inizializza il client Twilio solo se le credenziali sono presenti
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith('AC') && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('Servizio Twilio inizializzato correttamente');
  } else {
    console.warn('Credenziali Twilio mancanti o non valide. Alcune funzionalità di WhatsApp potrebbero non essere disponibili.');
  }
} catch (error) {
  console.error('Errore nell\'inizializzazione del client Twilio:', error);
}

class WhatsAppTemplateService {
  constructor() {
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    
    // Base URL per le API Content di Twilio
    this.contentApiBaseUrl = `https://content.twilio.com/v1/Content`;
  }

  /**
   * Sanitizza il nome del ristorante per l'uso nel nome del template
   * Rimuove spazi, apostrofi e caratteri speciali
   */
  sanitizeRestaurantName(name) {
    return name
      .toLowerCase()
      .replace(/[']/g, '') // rimuove apostrofi
      .replace(/[^a-z0-9]/g, '_') // sostituisce caratteri speciali e spazi con underscore
      .replace(/_+/g, '_') // rimuove underscore multipli
      .replace(/^_|_$/g, ''); // rimuove underscore iniziali e finali
  }

  /**
   * Genera un nome univoco per il template
   */
  async generateTemplateUniqueName(restaurantName, type) {
    const sanitizedName = this.sanitizeRestaurantName(restaurantName);
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(4).toString('hex');
    
    // Determina il tipo di template
    let templateType;
    switch (type) {
      case 'pdf':
        templateType = 'menu_pdf';
        break;
      case 'url':
        templateType = 'menu_url';
        break;
      case 'review':
        templateType = 'review';
        break;
      default:
        templateType = type;
    }
    
    // Formato: nomeristorante_tipo_timestamp_random
    // Esempio: pizzeria_italia_review_1684847576_a1b2c3d4
    const templateName = `${sanitizedName}_${templateType}_${timestamp}_${randomString}`;
    
    // Verifica che il nome non sia già in uso
    const existingTemplate = await WhatsAppTemplate.findOne({ name: templateName });
    if (existingTemplate) {
      // Nel caso improbabile di collisione, riprova con un nuovo random string
      return this.generateTemplateUniqueName(restaurantName, type);
    }
    
    return templateName;
  }

  /**
   * Converte il nostro formato template in quello di Twilio
   */
  convertToTwilioFormat(template) {
    console.log('=== CONVERTING TEMPLATE TO TWILIO FORMAT ===');
    console.log('Template type:', template.type);
    console.log('Template components:', JSON.stringify(template.components, null, 2));
    
    const types = {};
    
    // Prepara le variabili per Twilio
    const variables = {};
    if (template.variables && template.variables.length > 0) {
      template.variables.forEach(variable => {
        // Per WhatsApp, dobbiamo fornire un esempio specifico per il tipo di variabile
        variables[variable.index] = variable.name || "customer_name";
      });
    }
    
    // Limita la lunghezza del friendly_name a 64 caratteri e rimuovi caratteri speciali
    const sanitizedName = template.name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .substring(0, 64);
    
    switch (template.type) {
      case 'MEDIA':
        const pdfUrl = template.components.header?.example;
        console.log('PDF URL for MEDIA template:', pdfUrl);
        
        if (!pdfUrl) {
          throw new Error('PDF URL is required for MEDIA template');
        }
        
        // Verifica che l'URL sia valido e pubblicamente accessibile
        try {
          new URL(pdfUrl);
        } catch (e) {
          throw new Error('Invalid PDF URL format');
        }
        
        // Per WhatsApp, il body è richiesto per l'approvazione e non può iniziare o finire con una variabile
        const bodyText = template.components.body.text;
        if (bodyText.length > 1600) {
          throw new Error('Body text exceeds maximum length of 1,600 characters');
        }
        
        // Verifica che il testo non inizi o finisca con una variabile
        if (bodyText.startsWith('{{') || bodyText.endsWith('}}')) {
          throw new Error('Body text cannot start or end with a variable');
        }
        
        types['twilio/media'] = {
          body: bodyText,
          media: [pdfUrl]
        };
        break;

      case 'CALL_TO_ACTION':
      case 'REVIEW':
        if (!template.components.buttons || template.components.buttons.length === 0) {
          throw new Error('CALL_TO_ACTION or REVIEW templates must have buttons');
        }

        const button = template.components.buttons[0];
        const buttonTitle = button.text.length > 20 ? button.text.substring(0, 20) : button.text;
        
        // Verifica che il testo non inizi o finisca con una variabile
        const ctaBodyText = template.components.body.text;
        if (ctaBodyText.length > 640) {
          throw new Error('Body text exceeds maximum length of 640 characters for call-to-action');
        }
        
        if (ctaBodyText.startsWith('{{') || ctaBodyText.endsWith('}}')) {
          throw new Error('Body text cannot start or end with a variable');
        }

        types['twilio/call-to-action'] = {
          body: ctaBodyText,
          actions: [{
            type: "URL",
            title: buttonTitle, // Non supporta variabili nel titolo
            url: button.url // Supporta variabili solo alla fine dell'URL
          }]
        };
        break;
        
      default:
        throw new Error(`Unsupported template type: ${template.type}`);
    }
    
    if (Object.keys(types).length === 0) {
      throw new Error('At least one content type is required');
    }

    console.log('Final Twilio template types:', JSON.stringify(types, null, 2));
    
    return {
      friendly_name: sanitizedName,
      types,
      language: template.language.toLowerCase(),
      variables
    };
  }

  /**
   * Crea un nuovo template per il menu (PDF o URL) in tutte le lingue supportate
   */
  async createMenuTemplate(restaurantId, type, welcomeMessage, menuUrl = null) {
    try {
      console.log('=== CREATING MENU TEMPLATE ===');
      console.log('Type:', type);
      console.log('Menu URL:', menuUrl);
      
      // Trova il ristorante per ottenere il nome
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        throw new Error('Ristorante non trovato');
      }

      // Genera un nome univoco per il template base
      const baseTemplateName = await this.generateTemplateUniqueName(restaurant.name, type);

      // Lingue supportate
      const languages = ['it', 'en', 'es', 'de', 'fr'];
      
      // Traduci il messaggio in tutte le lingue usando Claude
      const translatedMessages = await this.translateWelcomeMessage(welcomeMessage, languages);

      // Crea un template per ogni lingua
      const templates = await Promise.all(languages.map(async (lang) => {
        const templateName = `${baseTemplateName}_${lang}`;

      const templateData = {
        restaurant: restaurantId,
        type: type === 'pdf' ? 'MEDIA' : 'CALL_TO_ACTION',
        name: templateName,
          language: lang,
          variables: [{
            index: 1,
            name: "customerName",
            example: "John"
          }],
        components: {
          body: {
              text: translatedMessages[lang],
            example: {
                body_text: [translatedMessages[lang].replace('{{1}}', 'John')]
              }
          }
        }
      };

      // Aggiungi componenti specifici in base al tipo
      if (type === 'pdf') {
        if (!menuUrl) {
          console.error('ERRORE: PDF URL mancante per il template MEDIA');
          throw new Error('PDF URL is required for MEDIA template');
        }
        
        console.log('Setting up PDF template with URL:', menuUrl);
        templateData.components.header = {
          type: 'DOCUMENT',
          format: 'PDF',
          example: menuUrl
        };
      } else if (type === 'url' && menuUrl) {
        console.log('Setting up URL template with URL:', menuUrl);
        templateData.components.buttons = [{
          type: 'URL',
            text: lang === 'it' ? 'Vedi Menu' :
                  lang === 'en' ? 'View Menu' :
                  lang === 'es' ? 'Ver Menú' :
                  lang === 'de' ? 'Menü anzeigen' :
                  'Voir le Menu',
          url: menuUrl
        }];
      } else {
        console.error('ERRORE: URL mancante per il template CALL_TO_ACTION');
        throw new Error('URL is required for CALL_TO_ACTION template');
      }

      // Crea il template nel database
      const template = new WhatsAppTemplate(templateData);
      await template.save();

      // Invia il template a Twilio per approvazione
        await this.submitTemplateToTwilio(template);

      return template;
      }));

      return templates;
    } catch (error) {
      console.error('Errore nella creazione dei template:', error);
      throw error;
    }
  }

  /**
   * Crea un nuovo template per la richiesta di recensione in tutte le lingue supportate
   */
  async createReviewTemplate(restaurantId, reviewMessage, reviewLink) {
    try {
      // Trova il ristorante per ottenere il nome
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        throw new Error('Ristorante non trovato');
      }

      // Genera un nome univoco per il template base
      const baseTemplateName = await this.generateTemplateUniqueName(restaurant.name, 'review');

      // Lingue supportate
      const languages = ['it', 'en', 'es', 'de', 'fr'];
      
      // Traduci il messaggio in tutte le lingue usando Claude
      const translatedMessages = await this.translateReviewMessage(reviewMessage, languages);

      // Crea un template per ogni lingua
      const templates = await Promise.all(languages.map(async (lang) => {
        const templateName = `${baseTemplateName}_${lang}`;

      const templateData = {
        restaurant: restaurantId,
        type: 'REVIEW',
        name: templateName,
          language: lang,
          variables: [{
            index: 1,
            name: "customerName",
            example: "John"
          }],
        components: {
          body: {
              text: translatedMessages[lang],
            example: {
                body_text: [translatedMessages[lang].replace('{{1}}', 'John')]
            }
          },
          buttons: [{
            type: 'URL',
              text: lang === 'it' ? 'Lascia una recensione' :
                    lang === 'en' ? 'Leave a review' :
                    lang === 'es' ? 'Dejar una reseña' :
                    lang === 'de' ? 'Bewertung abgeben' :
                    'Laisser un avis',
            url: reviewLink
          }]
        }
      };

      // Crea il template nel database
      const template = new WhatsAppTemplate(templateData);
      await template.save();

      // Invia il template a Twilio per approvazione
      await this.submitTemplateToTwilio(template);

      return template;
      }));

      return templates;
    } catch (error) {
      console.error('Errore nella creazione dei template di recensione:', error);
      throw error;
    }
  }

  /**
   * Traduce il messaggio di benvenuto in tutte le lingue specificate usando Claude
   */
  async translateWelcomeMessage(message, languages) {
    try {
      // Sostituisci {customerName} con {{1}} nel messaggio originale
      const messageWithTwilioVar = message.replace(/\{customerName\}/g, '{{1}}');

      const prompt = `Translate this restaurant welcome message into the following languages: ${languages.join(', ')}

Original message:
${messageWithTwilioVar}

Requirements:
1. Keep the same tone and style
2. Preserve all formatting and emojis
3. Keep the {{1}} variable exactly as is - DO NOT translate or modify it
4. Return ONLY a valid JSON object with language codes as keys and translations as values, like this example:
{
  "it": "Ciao {{1}}, benvenuto!",
  "en": "Hi {{1}}, welcome!",
  "es": "¡Hola {{1}}, bienvenido!"
}

DO NOT include any markdown formatting, backticks, or the word "json" in your response. Return ONLY the JSON object.`;

      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 1000,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

      // Estrai solo il JSON dalla risposta
      const responseText = response.content[0].text;
      let jsonStr = responseText;
      
      // Rimuovi eventuali backtick e la parola "json" se presenti
      if (responseText.includes('```')) {
        jsonStr = responseText.replace(/```json\n|\```\n|```/g, '').trim();
      }

      // Sanitizza il JSON per rimuovere caratteri di controllo
      const sanitizedJson = jsonStr
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Rimuove tutti i caratteri di controllo
        .replace(/\n/g, '\\n') // Gestisce correttamente i newline
        .replace(/\r/g, '\\r') // Gestisce correttamente i carriage return
        .replace(/\\"/g, '"') // Ripara eventuali doppi escape di virgolette
        .replace(/\\\\n/g, '\\n'); // Ripara eventuali doppi escape di newline

      console.log('JSON sanitizzato:', sanitizedJson);

      // Parse la risposta JSON
      let translations;
      try {
        translations = JSON.parse(sanitizedJson);
      } catch (parseError) {
        console.error('Errore nel parsing JSON:', parseError);
        console.error('JSON problematico:', sanitizedJson);
        
        // Tentativo di riparazione ulteriore
        const fixedJson = sanitizedJson
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Assicura che le chiavi siano tra virgolette
          .replace(/:\s*'([^']*)'/g, ':"$1"'); // Sostituisce gli apici singoli con doppi per i valori
        
        console.log('JSON riparato:', fixedJson);
        translations = JSON.parse(fixedJson);
      }

      // Verifica che tutte le lingue richieste siano presenti
      languages.forEach(lang => {
        if (!translations[lang]) {
          throw new Error(`Traduzione mancante per la lingua: ${lang}`);
        }
      });

      return translations;
    } catch (error) {
      console.error('Errore nella traduzione del messaggio di benvenuto:', error);
      console.error('Risposta completa:', error.response?.content[0]?.text);
      throw error;
    }
  }

  /**
   * Traduce il messaggio di recensione in tutte le lingue specificate usando Claude
   */
  async translateReviewMessage(message, languages) {
    try {
      // Sostituisci {customerName} con {{1}} nel messaggio originale
      const messageWithTwilioVar = message.replace(/\{customerName\}/g, '{{1}}');

      const prompt = `Translate this restaurant review request message into the following languages: ${languages.join(', ')}

Original message:
${messageWithTwilioVar}

Requirements:
1. Keep the same tone and style
2. Preserve all formatting and emojis
3. Keep the {{1}} variable exactly as is - DO NOT translate or modify it
4. Return ONLY a valid JSON object with language codes as keys and translations as values, like this example:
{
  "it": "Grazie {{1}}!",
  "en": "Thank you {{1}}",
  "es": "¡Gracias {{1}}!"
}

DO NOT include any markdown formatting, backticks, or the word "json" in your response. Return ONLY the JSON object.`;

      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 1000,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

      // Estrai solo il JSON dalla risposta
      const responseText = response.content[0].text;
      let jsonStr = responseText;
      
      // Rimuovi eventuali backtick e la parola "json" se presenti
      if (responseText.includes('```')) {
        jsonStr = responseText.replace(/```json\n|\```\n|```/g, '').trim();
      }

      // Sanitizza il JSON per rimuovere caratteri di controllo
      const sanitizedJson = jsonStr
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Rimuove tutti i caratteri di controllo
        .replace(/\n/g, '\\n') // Gestisce correttamente i newline
        .replace(/\r/g, '\\r') // Gestisce correttamente i carriage return
        .replace(/\\"/g, '"') // Ripara eventuali doppi escape di virgolette
        .replace(/\\\\n/g, '\\n'); // Ripara eventuali doppi escape di newline

      console.log('JSON sanitizzato:', sanitizedJson);

      // Parse la risposta JSON
      let translations;
      try {
        translations = JSON.parse(sanitizedJson);
      } catch (parseError) {
        console.error('Errore nel parsing JSON:', parseError);
        console.error('JSON problematico:', sanitizedJson);
        
        // Tentativo di riparazione ulteriore
        const fixedJson = sanitizedJson
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Assicura che le chiavi siano tra virgolette
          .replace(/:\s*'([^']*)'/g, ':"$1"'); // Sostituisce gli apici singoli con doppi per i valori
        
        console.log('JSON riparato:', fixedJson);
        translations = JSON.parse(fixedJson);
      }

      // Verifica che tutte le lingue richieste siano presenti
      languages.forEach(lang => {
        if (!translations[lang]) {
          throw new Error(`Traduzione mancante per la lingua: ${lang}`);
        }
      });

      return translations;
    } catch (error) {
      console.error('Errore nella traduzione del messaggio di recensione:', error);
      console.error('Risposta completa:', error.response?.content[0]?.text);
      throw error;
    }
  }

  /**
   * Invia il template a Twilio per approvazione usando direttamente l'API REST
   */
  async submitTemplateToTwilio(template) {
    try {
      const twilioTemplate = this.convertToTwilioFormat(template);
      
      // 1. Crea il template
      const contentResponse = await axios({
        method: 'post',
        url: this.contentApiBaseUrl,
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        },
        data: twilioTemplate
      });

      const contentSid = contentResponse.data.sid;

      // 2. Richiedi l'approvazione per WhatsApp
      const approvalResponse = await axios({
        method: 'post',
        url: `${this.contentApiBaseUrl}/${contentSid}/ApprovalRequests/whatsapp`,
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        },
        data: {
          name: template.name.toLowerCase(),
          // Le recensioni sono sempre di tipo UTILITY perché sono una risposta a un'azione dell'utente
          category: template.type === 'REVIEW' ? 'UTILITY' : 
                   template.type === 'MEDIA' ? 'UTILITY' : 'MARKETING'
        }
      });

      // Aggiorna il template con l'ID Twilio e lo stato
      template.twilioTemplateId = contentSid;
      template.status = 'PENDING';
      template.lastSubmissionDate = new Date();
      await template.save();

      return {
        contentSid,
        approvalStatus: approvalResponse.data.status
      };
    } catch (error) {
      console.error('Errore nell\'invio del template a Twilio:', error.response?.data || error);
      template.status = 'REJECTED';
      template.rejectionReason = error.response?.data?.message || error.message;
      await template.save();
      throw error;
    }
  }

  /**
   * Controlla lo stato di approvazione di un template
   */
  async checkTemplateStatus(templateId) {
    try {
      const template = await WhatsAppTemplate.findById(templateId);
      if (!template || !template.twilioTemplateId) {
        throw new Error('Template non trovato o non ancora inviato a Twilio');
      }

      const response = await axios({
        method: 'get',
        url: `${this.contentApiBaseUrl}/${template.twilioTemplateId}/ApprovalRequests`,
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      });

      const approvalStatus = response.data.whatsapp;
      
      // Aggiorna lo stato nel nostro database
      template.status = approvalStatus.status.toUpperCase();
      if (approvalStatus.rejection_reason) {
        template.rejectionReason = approvalStatus.rejection_reason;
      }
      await template.save();

      return template;
    } catch (error) {
      console.error('Errore nel controllo dello stato del template:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Ottiene tutti i template attivi di un ristorante
   */
  async getRestaurantTemplates(restaurantId) {
    return WhatsAppTemplate.find({
      restaurant: restaurantId,
      isActive: true
    }).sort('-createdAt');
  }
}

module.exports = new WhatsAppTemplateService(); 