const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');
const twilio = require('twilio');
const crypto = require('crypto');

class WhatsAppTemplateService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
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
    const templateType = type === 'pdf' ? 'menu_pdf' : 'menu_url';
    
    // Formato: nomeristorante_menutype_timestamp_random
    // Esempio: pizzeria_italia_menu_pdf_1684847576_a1b2c3d4
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
              body_text: [["Marco", restaurant.name]]
            }
          }
        }
      };

      // Aggiungi componenti specifici in base al tipo
      if (type === 'pdf') {
        templateData.components.header = {
          type: 'DOCUMENT',
          format: 'DOCUMENT',
          example: {
            header_handle: ["menu.pdf"]
          }
        };
      } else {
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
   * Invia il template a Twilio per approvazione
   */
  async submitTemplateToTwilio(template) {
    try {
      // Converti il nostro formato in quello di Twilio
      const twilioTemplate = this.convertToTwilioFormat(template);

      // Invia la richiesta a Twilio usando l'endpoint corretto per i Content Templates
      const response = await this.client.messaging.v1.contentTemplates.create({
        contentSid: process.env.TWILIO_CONTENT_SID,
        contentVariables: twilioTemplate.components,
        friendlyName: twilioTemplate.name,
        language: twilioTemplate.language,
        category: 'MARKETING', // o altra categoria appropriata
        channels: ['whatsapp']
      });

      // Aggiorna il template con l'ID Twilio e lo stato
      template.twilioTemplateId = response.sid;
      template.status = 'PENDING';
      template.lastSubmissionDate = new Date();
      await template.save();

      return response;
    } catch (error) {
      console.error('Errore nell\'invio del template a Twilio:', error);
      template.status = 'REJECTED';
      template.rejectionReason = error.message;
      await template.save();
      throw error;
    }
  }

  /**
   * Converte il nostro formato template in quello di Twilio
   */
  convertToTwilioFormat(template) {
    const twilioTemplate = {
      name: template.name,
      language: template.language,
      components: []
    };

    // Prepara le variabili del contenuto
    const contentVariables = [];

    // Aggiungi header se presente
    if (template.components.header && template.components.header.type !== 'NONE') {
      contentVariables.push({
        type: 'HEADER',
        mediaType: template.components.header.format.toUpperCase(),
        text: null,
        example: template.components.header.example.header_handle[0]
      });
    }

    // Aggiungi body
    contentVariables.push({
      type: 'BODY',
      text: template.components.body.text,
      example: template.components.body.example.body_text.join(' ')
    });

    // Aggiungi buttons se presenti
    if (template.components.buttons && template.components.buttons.length > 0) {
      template.components.buttons.forEach(button => {
        contentVariables.push({
          type: 'BUTTON',
          buttonType: button.type,
          text: button.text,
          url: button.url,
          phoneNumber: button.phone_number
        });
      });
    }

    twilioTemplate.components = contentVariables;
    return twilioTemplate;
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

      const twilioTemplate = await this.client.messaging.v1.contentTemplates(template.twilioTemplateId).fetch();
      
      // Aggiorna lo stato nel nostro database
      template.status = twilioTemplate.status === 'approved' ? 'APPROVED' : 
                       twilioTemplate.status === 'rejected' ? 'REJECTED' : 'PENDING';
      if (twilioTemplate.status === 'rejected') {
        template.rejectionReason = twilioTemplate.rejection_reason;
      }
      await template.save();

      return template;
    } catch (error) {
      console.error('Errore nel controllo dello stato del template:', error);
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