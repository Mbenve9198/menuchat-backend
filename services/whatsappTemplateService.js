const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');
const twilio = require('twilio');
const crypto = require('crypto');
const axios = require('axios');

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
   * Crea un nuovo template per il menu (PDF o URL)
   */
  async createMenuTemplate(restaurantId, type, welcomeMessage, menuUrl = null) {
    try {
      // Trova il ristorante per ottenere il nome
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        throw new Error('Ristorante non trovato');
      }

      // Genera un nome univoco per il template
      const templateName = await this.generateTemplateUniqueName(restaurant.name, type);

      const templateData = {
        restaurant: restaurantId,
        type: type === 'pdf' ? 'MEDIA' : 'CALL_TO_ACTION',
        name: templateName,
        language: 'it',
        components: {
          body: {
            text: welcomeMessage,
            example: {
              body_text: [welcomeMessage]
            }
          }
        }
      };

      // Aggiungi componenti specifici in base al tipo
      if (type === 'pdf') {
        templateData.components.header = {
          type: 'DOCUMENT',
          format: 'PDF',
          example: menuUrl // Salviamo l'URL del PDF come esempio
        };
      } else if (type === 'url' && menuUrl) {
        templateData.components.buttons = [{
          type: 'URL',
          text: 'Vedi Menu',
          url: menuUrl
        }];
      }

      // Crea il template nel database
      const template = new WhatsAppTemplate(templateData);
      await template.save();

      // Invia il template a Twilio per approvazione
      await this.submitTemplateToTwilio(template);

      return template;
    } catch (error) {
      console.error('Errore nella creazione del template:', error);
      throw error;
    }
  }

  /**
   * Crea un nuovo template per la richiesta di recensione
   */
  async createReviewTemplate(restaurantId, reviewMessage, reviewLink) {
    try {
      // Trova il ristorante per ottenere il nome
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        throw new Error('Ristorante non trovato');
      }

      // Genera un nome univoco per il template
      const templateName = await this.generateTemplateUniqueName(restaurant.name, 'review');

      // Verifica che il messaggio di recensione sia fornito
      if (!reviewMessage) {
        throw new Error('Review message is required');
      }

      const templateData = {
        restaurant: restaurantId,
        type: 'REVIEW',
        name: templateName,
        language: 'it',
        components: {
          body: {
            text: reviewMessage,
            example: {
              body_text: [reviewMessage.replace(restaurant.name, "Esempio Ristorante")]
            }
          },
          buttons: [{
            type: 'URL',
            text: 'Lascia una recensione',
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
    } catch (error) {
      console.error('Errore nella creazione del template di recensione:', error);
      throw error;
    }
  }

  /**
   * Converte il nostro formato template in quello di Twilio
   */
  convertToTwilioFormat(template) {
    const types = {};
    
    switch (template.type) {
      case 'MEDIA':
        // Template per menu PDF
        const pdfUrl = template.components.header?.example;
        if (!pdfUrl) {
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
        }
        break;
    }

    return {
      friendly_name: template.name,
      types,
      language: template.language,
      variables: {}
    };
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