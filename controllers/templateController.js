const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const whatsappTemplateService = require('../services/whatsappTemplateService');
const Restaurant = require('../models/Restaurant');

class TemplateController {
  /**
   * Ottiene tutti i template di un ristorante
   */
  async getTemplates(req, res) {
    try {
      // Accetta sia path parameter che query parameter
      const restaurantId = req.params.restaurantId || req.query.restaurantId;
      
      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant ID is required'
        });
      }

      const templates = await WhatsAppTemplate.find({
        restaurant: restaurantId,
        isActive: true
      }).sort('-createdAt');

      res.json({
        success: true,
        templates
      });
    } catch (error) {
      console.error('Error getting templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get templates'
      });
    }
  }

  /**
   * Aggiorna un template esistente
   */
  async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { message } = req.body;

      // Trova il template esistente
      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      // Aggiorna il messaggio del template
      template.components.body.text = message;
      template.status = 'PENDING'; // Reset status since we're submitting a new version
      await template.save();

      // Invia il template aggiornato a Twilio per approvazione
      await whatsappTemplateService.submitTemplateToTwilio(template);

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Error updating template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update template'
      });
    }
  }

  /**
   * Controlla lo stato di approvazione di un template
   */
  async checkTemplateStatus(req, res) {
    try {
      const { templateId } = req.params;

      const template = await whatsappTemplateService.checkTemplateStatus(templateId);

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Error checking template status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check template status'
      });
    }
  }

  /**
   * Elimina un template
   */
  async deleteTemplate(req, res) {
    try {
      const { templateId } = req.params;

      // Soft delete impostando isActive a false
      const template = await WhatsAppTemplate.findByIdAndUpdate(
        templateId,
        { isActive: false },
        { new: true }
      );

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Error deleting template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete template'
      });
    }
  }

  /**
   * Aggiorna l'URL di recensione e la piattaforma per i template di recensione
   */
  async updateReviewSettings(req, res) {
    try {
      const { restaurantId } = req.params;
      const { reviewLink, reviewPlatform } = req.body;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante richiesto'
        });
      }

      // Valida la piattaforma di recensione
      const validPlatforms = ['google', 'yelp', 'tripadvisor', 'custom'];
      if (reviewPlatform && !validPlatforms.includes(reviewPlatform)) {
        return res.status(400).json({
          success: false,
          error: 'Piattaforma di recensione non valida'
        });
      }

      // Aggiorna il ristorante con i nuovi dati
      const restaurant = await Restaurant.findByIdAndUpdate(
        restaurantId,
        {
          customReviewLink: reviewLink,
          reviewPlatform: reviewPlatform
        },
        { new: true }
      );

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      // Trova tutti i template di recensione per questo ristorante
      const reviewTemplates = await WhatsAppTemplate.find({
        restaurant: restaurantId,
        type: 'REVIEW',
        isActive: true
      });

      // Aggiorna l'URL di recensione in tutti i template di recensione
      if (reviewTemplates.length > 0 && reviewLink) {
        for (const template of reviewTemplates) {
          if (template.components.buttons && template.components.buttons.length > 0) {
            template.components.buttons[0].url = reviewLink;
            template.status = 'PENDING'; // Reset dello stato visto che è stato modificato
            await template.save();

            // Invia il template aggiornato a Twilio per approvazione
            await whatsappTemplateService.submitTemplateToTwilio(template);
          }
        }
      }

      res.json({
        success: true,
        restaurant,
        updatedTemplates: reviewTemplates.length
      });
    } catch (error) {
      console.error('Error updating review settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update review settings'
      });
    }
  }

  /**
   * Ottiene le impostazioni di recensione di un ristorante
   */
  async getReviewSettings(req, res) {
    try {
      const { restaurantId } = req.params;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'ID ristorante richiesto'
        });
      }

      const restaurant = await Restaurant.findById(restaurantId);

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      res.json({
        success: true,
        reviewSettings: {
          reviewLink: restaurant.customReviewLink,
          reviewPlatform: restaurant.reviewPlatform
        }
      });
    } catch (error) {
      console.error('Error getting review settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get review settings'
      });
    }
  }

  /**
   * Aggiorna il testo del pulsante di un template
   */
  async updateButtonText(req, res) {
    try {
      const { templateId } = req.params;
      const { buttonText } = req.body;

      if (!buttonText) {
        return res.status(400).json({
          success: false,
          error: 'Il testo del pulsante è richiesto'
        });
      }

      // Trova il template esistente
      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      // Verifica che il template abbia dei pulsanti
      if (!template.components.buttons || template.components.buttons.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Il template non ha pulsanti'
        });
      }

      // Aggiorna il testo del pulsante
      template.components.buttons[0].text = buttonText;
      template.status = 'PENDING'; // Reset status since we're submitting a new version
      await template.save();

      // Invia il template aggiornato a Twilio per approvazione
      await whatsappTemplateService.submitTemplateToTwilio(template);

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Error updating button text:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update button text'
      });
    }
  }

  /**
   * Ottiene il testo del pulsante di un template
   */
  async getButtonText(req, res) {
    try {
      const { templateId } = req.params;

      // Trova il template
      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      // Verifica che il template abbia dei pulsanti
      if (!template.components.buttons || template.components.buttons.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Il template non ha pulsanti'
        });
      }

      res.json({
        success: true,
        buttonText: template.components.buttons[0].text
      });
    } catch (error) {
      console.error('Error getting button text:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get button text'
      });
    }
  }
}

module.exports = new TemplateController(); 