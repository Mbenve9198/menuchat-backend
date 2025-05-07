const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const whatsappTemplateService = require('../services/whatsappTemplateService');

class TemplateController {
  /**
   * Ottiene tutti i template di un ristorante
   */
  async getTemplates(req, res) {
    try {
      const { restaurantId } = req.params;

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
}

module.exports = new TemplateController(); 