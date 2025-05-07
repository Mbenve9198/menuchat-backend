const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');
const twilio = require('twilio');
const crypto = require('crypto');
const axios = require('axios');
const anthropic = require('../services/anthropic');

class WhatsAppTemplateService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.client = twilio(this.accountSid, this.authToken);
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
        variables[variable.index] = {
          type: "text",
          example: variable.example
        };
      });
    }
    
    switch (template.type) {
      case 'MEDIA':
        // Template per menu PDF
        const pdfUrl = template.components.header?.example;
        console.log('PDF URL for MEDIA template:', pdfUrl);
        
        if (!pdfUrl) {
          console.error('ERRORE: PDF URL mancante per il template MEDIA');
          throw new Error('PDF URL is required for MEDIA template');
        }
        
        // Per i template MEDIA, utilizziamo SOLO il tipo twilio/media
        types['twilio/media'] = {
          body: template.components.body.text,
          media: [pdfUrl]
        };
        break;

      case 'CALL_TO_ACTION':
      case 'REVIEW':
        // Template per menu URL o recensioni
        console.log('Buttons:', JSON.stringify(template.components.buttons, null, 2));
        
        if (template.components.buttons && template.components.buttons.length > 0) {
          const button = template.components.buttons[0];
          const buttonTitle = button.text.length > 25 ? button.text.substring(0, 25) : button.text;
          
          // Utilizziamo SOLO twilio/call-to-action per CTA e Review
          types['twilio/call-to-action'] = {
            body: template.components.body.text,
            actions: [{
              type: "URL",
              title: buttonTitle,
              url: button.url
            }]
          };
        } else {
          console.error('ERRORE: Bottoni mancanti per il template CALL_TO_ACTION o REVIEW');
          throw new Error('CALL_TO_ACTION or REVIEW templates must have buttons');
        }
        break;
        
      default:
        console.error(`ERRORE: Tipo di template non supportato: ${template.type}`);
        throw new Error(`Unsupported template type: ${template.type}`);
    }
    
    // Controlla che ci sia almeno un tipo
    if (Object.keys(types).length === 0) {
      console.error('ERRORE: Nessun tipo definito nel template');
      throw new Error('At least one content type is required');
    }

    console.log('Final Twilio template types:', JSON.stringify(types, null, 2));
    
    return {
      friendly_name: template.name,
      types,
      language: template.language,
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
4. Return ONLY the translations in a JSON format like this:
{
  "it": "Italian translation",
  "en": "English translation",
  ...
}`;

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

      // Parse la risposta JSON
      const translations = JSON.parse(response.content[0].text);

      // Verifica che tutte le lingue richieste siano presenti
      languages.forEach(lang => {
        if (!translations[lang]) {
          throw new Error(`Traduzione mancante per la lingua: ${lang}`);
        }
      });

      return translations;
    } catch (error) {
      console.error('Errore nella traduzione del messaggio di benvenuto:', error);
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
4. Return ONLY the translations in a JSON format like this:
{
  "it": "Italian translation",
  "en": "English translation",
  ...
}`;

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

      // Parse la risposta JSON
      const translations = JSON.parse(response.content[0].text);

      // Verifica che tutte le lingue richieste siano presenti
      languages.forEach(lang => {
        if (!translations[lang]) {
          throw new Error(`Traduzione mancante per la lingua: ${lang}`);
        }
      });

      return translations;
    } catch (error) {
      console.error('Errore nella traduzione del messaggio di recensione:', error);
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
          username: this.accountSid,
          password: this.authToken
        },
        data: twilioTemplate
      });

      const contentSid = contentResponse.data.sid;

      // 2. Richiedi l'approvazione per WhatsApp
      const approvalResponse = await axios({
        method: 'post',
        url: `${this.contentApiBaseUrl}/${contentSid}/ApprovalRequests/whatsapp`,
        auth: {
          username: this.accountSid,
          password: this.authToken
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
          username: this.accountSid,
          password: this.authToken
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