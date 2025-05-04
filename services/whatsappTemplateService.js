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
   * Converte il nostro formato template in quello di Twilio
   */
  convertToTwilioFormat(template) {
    // Prepara i tipi di contenuto
    const types = {};

    // Configura il tipo twilio/text per il messaggio base
    types['twilio/text'] = {
      body: template.components.body.text
    };

    // Se c'è un header di tipo documento, aggiungi twilio/document
    if (template.components.header && template.components.header.type === 'DOCUMENT') {
      types['twilio/document'] = {
        media: [template.components.header.example.header_handle[0]]
      };
    }

    // Se ci sono bottoni, aggiungi twilio/button
    if (template.components.buttons && template.components.buttons.length > 0) {
      const button = template.components.buttons[0];
      types['twilio/button'] = {
        type: button.type,
        text: button.text,
        url: button.url
      };
    }

    return {
      friendly_name: template.name,
      types,
      language: template.language,
      variables: {
        "1": "Customer Name",
        "2": "Restaurant Name"
      }
    };
  }

  /**
   * Invia il template a Twilio per approvazione
   */
  async submitTemplateToTwilio(template) {
    try {
      // Converti il nostro formato in quello di Twilio
      const twilioTemplate = this.convertToTwilioFormat(template);

      // 1. Prima crea il template usando l'API Content
      const contentResponse = await this.client.content.v1.contents.create(twilioTemplate);

      // 2. Poi richiedi l'approvazione per WhatsApp
      const approvalResponse = await this.client.content.v1
        .contents(contentResponse.sid)
        .approvalRequests
        .create({
          channel: 'whatsapp',
          name: template.name.toLowerCase(), // WhatsApp richiede nomi in minuscolo
          category: 'MARKETING' // o 'UTILITY' a seconda del caso
        });

      // Aggiorna il template con l'ID Twilio e lo stato
      template.twilioTemplateId = contentResponse.sid;
      template.status = 'PENDING';
      template.lastSubmissionDate = new Date();
      await template.save();

      return {
        contentSid: contentResponse.sid,
        approvalStatus: approvalResponse.status
      };
    } catch (error) {
      console.error('Errore nell\'invio del template a Twilio:', error);
      template.status = 'REJECTED';
      template.rejectionReason = error.message;
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

      // Usa l'API Content per controllare lo stato
      const approvalStatus = await this.client.content.v1
        .contents(template.twilioTemplateId)
        .approvalRequests()
        .fetch();
      
      // Aggiorna lo stato nel nostro database
      template.status = approvalStatus.whatsapp.status.toUpperCase();
      if (approvalStatus.whatsapp.rejection_reason) {
        template.rejectionReason = approvalStatus.whatsapp.rejection_reason;
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