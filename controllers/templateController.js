const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const whatsappTemplateService = require('../services/whatsappTemplateService');
const Restaurant = require('../models/Restaurant');

/**
 * Aggiorna un template in tutte le lingue disponibili
 */
async function updateTemplatesInAllLanguages(sourceTemplate, newMessage) {
  // Estrai le informazioni necessarie dal template sorgente
  const templateType = sourceTemplate.type;
  const restaurantId = sourceTemplate.restaurant;
  const baseName = sourceTemplate.name.split('_').slice(0, -1).join('_'); // Rimuovi il suffisso lingua
  
  // Trova tutti i template correlati (stesso tipo e ristorante)
  const relatedTemplates = await WhatsAppTemplate.find({
    restaurant: restaurantId,
    type: templateType,
    isActive: true,
    name: { $regex: new RegExp(`^${baseName}`) } // Cerca template con lo stesso nome base
  });
  
  // Se non ci sono template correlati, ritorna un array vuoto
  if (!relatedTemplates || relatedTemplates.length === 0) {
    return [];
  }
  
  // Estrai le lingue disponibili
  const languages = relatedTemplates.map(t => t.language);
  
  // Traduci il messaggio in tutte le lingue
  let translatedMessages;
  if (templateType === 'REVIEW') {
    translatedMessages = await whatsappTemplateService.translateReviewMessage(newMessage, languages);
  } else {
    translatedMessages = await whatsappTemplateService.translateWelcomeMessage(newMessage, languages);
  }
  
  // Aggiorna i template in tutte le lingue e invia a Twilio
  const updatedTemplates = [];
  for (const template of relatedTemplates) {
    const lang = template.language;
    if (translatedMessages[lang]) {
      template.components.body.text = translatedMessages[lang];
      template.status = 'PENDING';
      await template.save();
      
      // Invia il template aggiornato a Twilio
      await whatsappTemplateService.submitTemplateToTwilio(template);
      updatedTemplates.push(template);
    }
  }
  
  return updatedTemplates;
}

/**
 * Aggiorna il testo del pulsante in tutte le lingue disponibili
 */
async function updateButtonTextInAllLanguages(sourceTemplate, newButtonText) {
  // Estrai le informazioni necessarie dal template sorgente
  const templateType = sourceTemplate.type;
  const restaurantId = sourceTemplate.restaurant;
  const baseName = sourceTemplate.name.split('_').slice(0, -1).join('_'); // Rimuovi il suffisso lingua
  
  // Trova tutti i template correlati (stesso tipo e ristorante)
  const relatedTemplates = await WhatsAppTemplate.find({
    restaurant: restaurantId,
    type: templateType,
    isActive: true,
    name: { $regex: new RegExp(`^${baseName}`) } // Cerca template con lo stesso nome base
  });
  
  // Se non ci sono template correlati, ritorna un array vuoto
  if (!relatedTemplates || relatedTemplates.length === 0) {
    return [];
  }
  
  // Mappa dei testi dei pulsanti in base alla lingua
  const buttonTexts = {
    'it': templateType === 'REVIEW' ? 'Lascia una recensione' : 'Vedi Menu',
    'en': templateType === 'REVIEW' ? 'Leave a review' : 'View Menu',
    'es': templateType === 'REVIEW' ? 'Dejar una reseña' : 'Ver Menú',
    'de': templateType === 'REVIEW' ? 'Bewertung abgeben' : 'Menü anzeigen',
    'fr': templateType === 'REVIEW' ? 'Laisser un avis' : 'Voir le Menu'
  };
  
  // Se è stato fornito un testo personalizzato, usa quello come predefinito
  if (newButtonText) {
    Object.keys(buttonTexts).forEach(lang => {
      buttonTexts[lang] = newButtonText;
    });
  }
  
  // Aggiorna i template in tutte le lingue e invia a Twilio
  const updatedTemplates = [];
  for (const template of relatedTemplates) {
    const lang = template.language;
    if (template.components.buttons && template.components.buttons.length > 0 && buttonTexts[lang]) {
      template.components.buttons[0].text = buttonTexts[lang];
      template.status = 'PENDING';
      await template.save();
      
      // Invia il template aggiornato a Twilio
      await whatsappTemplateService.submitTemplateToTwilio(template);
      updatedTemplates.push(template);
    }
  }
  
  return updatedTemplates;
}

/**
 * Crea un nuovo template per sostituirne uno esistente con un tipo diverso
 */
async function createConvertedTemplate(sourceTemplate, newType, updatedMessage, menuUrl, menuPdfUrl) {
  try {
    // Ottieni i dati dal template sorgente
    const restaurantId = sourceTemplate.restaurant;
    const language = sourceTemplate.language;
    
    // Ottieni il nome del ristorante per includere nel nome del template
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      throw new Error('Ristorante non trovato');
    }
    
    // Sanitizza il nome del ristorante per l'uso nel nome del template
    const sanitizedName = restaurant.name
      .toLowerCase()
      .replace(/[']/g, '') // rimuove apostrofi
      .replace(/[^a-z0-9]/g, '_') // sostituisce caratteri speciali e spazi con underscore
      .replace(/_+/g, '_') // rimuove underscore multipli
      .replace(/^_|_$/g, ''); // rimuove underscore iniziali e finali
    
    // Determina il tipo di template in un formato leggibile
    const templateTypeLabel = newType === 'MEDIA' ? 'menu_pdf' : 'menu_url';
    
    // Genera un timestamp e un identificatore univoco
    const timestamp = Date.now();
    const randomId = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    // Formato: {nome_ristorante}_{tipo_template}_{timestamp}_{id}_{lingua}
    const newName = `${sanitizedName}_${templateTypeLabel}_${timestamp}_${randomId}_${language}`;
    
    // Prepara il nuovo oggetto template
    const newTemplateData = {
      restaurant: restaurantId,
      type: newType,
      name: newName,
      language: language,
      status: 'PENDING',
      variables: sourceTemplate.variables || [],
      components: {
        body: {
          text: updatedMessage || sourceTemplate.components.body.text
        }
      },
      isActive: true
    };
    
    // Configura i componenti specifici in base al nuovo tipo
    if (newType === 'MEDIA') {
      if (!menuPdfUrl) {
        throw new Error('Menu PDF URL is required for MEDIA template');
      }
      
      newTemplateData.components.header = {
        type: 'DOCUMENT',
        format: 'PDF',
        example: menuPdfUrl
      };
    } else if (newType === 'CALL_TO_ACTION') {
      if (!menuUrl) {
        throw new Error('Menu URL is required for CALL_TO_ACTION template');
      }
      
      const buttonTexts = {
        'it': 'Vedi Menu',
        'en': 'View Menu',
        'es': 'Ver Menú',
        'de': 'Menü anzeigen',
        'fr': 'Voir le Menu'
      };
      
      newTemplateData.components.buttons = [{
        type: 'URL',
        text: buttonTexts[language] || 'View Menu',
        url: menuUrl
      }];
    }
    
    // Crea il nuovo template nel database
    const newTemplate = new WhatsAppTemplate(newTemplateData);
    await newTemplate.save();
    
    // Invia il nuovo template a Twilio per approvazione
    await whatsappTemplateService.submitTemplateToTwilio(newTemplate);
    
    // Disattiva il vecchio template
    sourceTemplate.isActive = false;
    await sourceTemplate.save();
    
    return newTemplate;
  } catch (error) {
    console.error('Error creating converted template:', error);
    throw error;
  }
}

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
      const { message, updateAllLanguages } = req.body;

      // Trova il template esistente
      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      if (updateAllLanguages) {
        // Se richiesto, aggiorna il template in tutte le lingue
        const updatedTemplates = await updateTemplatesInAllLanguages(template, message);
        
        return res.json({
          success: true,
          templates: updatedTemplates
        });
      } else {
        // Aggiorna solo il template specifico
        template.components.body.text = message;
        template.status = 'PENDING'; // Reset status since we're submitting a new version
        await template.save();

        // Invia il template aggiornato a Twilio per approvazione
        await whatsappTemplateService.submitTemplateToTwilio(template);

        return res.json({
          success: true,
          template
        });
      }
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
      const { buttonText, updateAllLanguages } = req.body;

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

      if (updateAllLanguages) {
        // Se richiesto, aggiorna il testo del pulsante in tutte le lingue
        const updatedTemplates = await updateButtonTextInAllLanguages(template, buttonText);
        
        return res.json({
          success: true,
          templates: updatedTemplates
        });
      } else {
        // Aggiorna solo il testo del pulsante specifico
        template.components.buttons[0].text = buttonText;
        template.status = 'PENDING'; // Reset status since we're submitting a new version
        await template.save();

        // Invia il template aggiornato a Twilio per approvazione
        await whatsappTemplateService.submitTemplateToTwilio(template);

        return res.json({
          success: true,
          template
        });
      }
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

  /**
   * Converte un template da un tipo all'altro (MEDIA <-> CALL_TO_ACTION)
   */
  async convertTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { message, newType, updateAllLanguages, menuUrl, menuPdfUrl } = req.body;

      // Verifica dati obbligatori
      if (!newType || !['MEDIA', 'CALL_TO_ACTION'].includes(newType)) {
        return res.status(400).json({
          success: false,
          error: 'Valid new template type is required'
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

      // Verifica che il tipo sia effettivamente diverso
      if (template.type === newType) {
        return res.status(400).json({
          success: false,
          error: 'New type must be different from current type'
        });
      }

      let convertedTemplates = [];

      if (updateAllLanguages) {
        // Estrai le informazioni necessarie dal template sorgente
        const templateType = template.type;
        const restaurantId = template.restaurant;
        const baseName = template.name.split('_').slice(0, -1).join('_'); // Rimuovi il suffisso lingua
        
        // Trova tutti i template correlati (stesso tipo e ristorante)
        const relatedTemplates = await WhatsAppTemplate.find({
          restaurant: restaurantId,
          type: templateType,
          isActive: true,
          name: { $regex: new RegExp(`^${baseName}`) } // Cerca template con lo stesso nome base
        });
        
        // Estrai le lingue disponibili
        const languages = relatedTemplates.map(t => t.language);
        
        // Traduci il messaggio in tutte le lingue
        const translatedMessages = await whatsappTemplateService.translateWelcomeMessage(message, languages);
        
        // Crea nuovi template per ogni lingua
        for (const template of relatedTemplates) {
          const lang = template.language;
          if (translatedMessages[lang]) {
            const convertedTemplate = await createConvertedTemplate(
              template,
              newType,
              translatedMessages[lang],
              menuUrl,
              menuPdfUrl
            );
            convertedTemplates.push(convertedTemplate);
          }
        }
      } else {
        // Converti solo il template specifico
        const convertedTemplate = await createConvertedTemplate(
          template,
          newType,
          message,
          menuUrl,
          menuPdfUrl
        );
        convertedTemplates.push(convertedTemplate);
      }

      return res.json({
        success: true,
        templates: convertedTemplates
      });
    } catch (error) {
      console.error('Error converting template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to convert template'
      });
    }
  }
}

module.exports = new TemplateController(); 