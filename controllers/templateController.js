const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const whatsappTemplateService = require('../services/whatsappTemplateService');
const Restaurant = require('../models/Restaurant');

/**
 * Aggiorna un template in tutte le lingue disponibili
 */
async function updateTemplatesInAllLanguages(sourceTemplate, newMessage, menuUrl = null, menuPdfUrl = null) {
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
      
      // Aggiorna l'URL del menu per template CALL_TO_ACTION
      if (menuUrl && template.type === 'CALL_TO_ACTION') {
        if (template.components.buttons && template.components.buttons.length > 0) {
          template.components.buttons[0].url = menuUrl;
        }
      }
      
      // Aggiorna il PDF del menu per template MEDIA
      if (menuPdfUrl && template.type === 'MEDIA') {
        if (!template.components.header) {
          template.components.header = {};
        }
        template.components.header.example = menuPdfUrl;
      }
      
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
    'it': templateType === 'REVIEW' ? 'Lascia Recensione' : 'Menu',
    'en': templateType === 'REVIEW' ? 'Leave Review' : 'Menu',
    'es': templateType === 'REVIEW' ? 'Dejar Reseña' : 'Menú',
    'de': templateType === 'REVIEW' ? 'Bewertung abgeben' : 'Menü',
    'fr': templateType === 'REVIEW' ? 'Laisser Avis' : 'Menu'
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
        'it': 'Menu',
        'en': 'Menu',
        'es': 'Menú',
        'de': 'Menü',
        'fr': 'Menu'
      };
      
      newTemplateData.components.buttons = [{
        type: 'URL',
        text: buttonTexts[language] || 'Menu',
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
      const { message, updateAllLanguages, menuUrl, menuPdfUrl, buttonText } = req.body;

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
        const updatedTemplates = await updateTemplatesInAllLanguages(template, message, menuUrl, menuPdfUrl);
        
        // Se è stato fornito un buttonText, aggiorna anche quello in tutte le lingue
        if (buttonText && template.type === 'REVIEW') {
          await updateButtonTextInAllLanguages(template, buttonText);
        }
        
        return res.json({
          success: true,
          templates: updatedTemplates
        });
      } else {
        // Aggiorna solo il template specifico
        template.components.body.text = message;
        
        // Gestisci l'aggiornamento dell'URL del menu per template CALL_TO_ACTION
        if (menuUrl && template.type === 'CALL_TO_ACTION') {
          if (template.components.buttons && template.components.buttons.length > 0) {
            template.components.buttons[0].url = menuUrl;
          }
        }
        
        // Gestisci l'aggiornamento del PDF del menu per template MEDIA
        if (menuPdfUrl && template.type === 'MEDIA') {
          if (!template.components.header) {
            template.components.header = {};
          }
          template.components.header.example = menuPdfUrl;
        }
        
        // Gestisci l'aggiornamento del testo del pulsante per template REVIEW
        if (buttonText && template.type === 'REVIEW') {
          if (template.components.buttons && template.components.buttons.length > 0) {
            template.components.buttons[0].text = buttonText;
          }
        }
        
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

  // @desc    Rigenera un messaggio con IA
  // @route   POST /api/templates/:templateId/regenerate
  // @access  Private
  async regenerateMessage(req, res) {
    try {
      const { templateId } = req.params;
      const { restaurantId, language, messageType, menuUrl, menuPdfUrl, reviewLink, reviewPlatform } = req.body;

      // Trova il template
      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template non trovato'
        });
      }

      // Trova il ristorante
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Ristorante non trovato'
        });
      }

      let newMessage = '';

      // Rigenera il messaggio in base al tipo
      if (messageType === 'review') {
        // Rigenera messaggio di recensione usando la logica del setupController
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });

        // Mappatura delle lingue con le istruzioni corrispondenti per recensioni
        const languageInstructions = {
          en: {
            welcomeText: "Create an optimized review request message for a restaurant. The message should encourage customers to leave a review by clicking a button that will be shown below the message.",
            requirements: [
              "Be friendly and conversational",
              "Keep the message between 100-120 characters",
              "Don't mention or include the review link (it will be in a button below)",
              "Focus on one of these approaches:",
              "   - Thank the customer for their order",
              "   - Emphasize how feedback helps the restaurant improve",
              "   - Highlight the value of customer opinions",
              "Use appropriate emojis (max 2)",
              "Don't use generic phrases like \"leave a review\"",
              "Make it personal and engaging",
              "Use {{1}} as a placeholder for the customer's name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)"
            ],
            example: "Thanks for dining with us, {{1}}! 🌟 Your feedback helps us serve you better."
          },
          it: {
            welcomeText: "Crea un messaggio ottimizzato per richiedere recensioni a un ristorante. Il messaggio dovrebbe incoraggiare i clienti a lasciare una recensione cliccando su un pulsante che verrà mostrato sotto il messaggio.",
            requirements: [
              "Sii amichevole e conversazionale",
              "Mantieni il messaggio tra 100-120 caratteri",
              "Non menzionare o includere il link alla recensione (sarà in un pulsante sotto)",
              "Concentrati su uno di questi approcci:",
              "   - Ringrazia il cliente per il suo ordine",
              "   - Enfatizza come il feedback aiuta il ristorante a migliorare",
              "   - Sottolinea il valore delle opinioni dei clienti",
              "Usa emoji appropriate (massimo 2)",
              "Non usare frasi generiche come \"lascia una recensione\"",
              "Rendilo personale e coinvolgente",
              "Usa {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}}, non {customerName} o altre variazioni)"
            ],
            example: "Grazie per aver cenato da noi, {{1}}! 🌟 Il tuo feedback ci aiuta a servirti meglio."
          },
          fr: {
            welcomeText: "Créez un message optimisé pour demander un avis sur un restaurant. Le message devrait encourager les clients à laisser un avis en cliquant sur un bouton qui sera affiché sous le message.",
            requirements: [
              "Soyez amical et conversationnel",
              "Gardez le message entre 100 et 120 caractères",
              "Ne mentionnez pas et n'incluez pas le lien d'avis (il sera dans un bouton ci-dessous)",
              "Concentrez-vous sur l'une de ces approches :",
              "   - Remerciez le client pour sa commande",
              "   - Soulignez comment les commentaires aident le restaurant à s'améliorer",
              "   - Mettez en valeur l'importance des opinions des clients",
              "Utilisez des émojis appropriés (maximum 2)",
              "N'utilisez pas de phrases génériques comme \"laissez un avis\"",
              "Rendez-le personnel et engageant",
              "Utilisez {{1}} comme espace réservé pour le nom du client (IMPORTANT : utilisez exactement {{1}}, pas {customerName} ou autres variations)"
            ],
            example: "Merci d'avoir dîné chez nous, {{1}} ! 🌟 Vos commentaires nous aident à mieux vous servir."
          },
          de: {
            welcomeText: "Erstellen Sie eine optimierte Bewertungsanfrage für ein Restaurant. Die Nachricht sollte Kunden ermutigen, eine Bewertung abzugeben, indem sie auf eine Schaltfläche klicken, die unter der Nachricht angezeigt wird.",
            requirements: [
              "Seien Sie freundlich und gesprächig",
              "Halten Sie die Nachricht zwischen 100-120 Zeichen",
              "Erwähnen oder fügen Sie den Bewertungslink nicht ein (er wird in einer Schaltfläche unten angezeigt)",
              "Konzentrieren Sie sich auf einen dieser Ansätze:",
              "   - Danken Sie dem Kunden für seine Bestellung",
              "   - Betonen Sie, wie Feedback dem Restaurant hilft, sich zu verbessern",
              "   - Heben Sie den Wert der Kundenmeinungen hervor",
              "Verwenden Sie passende Emojis (maximal 2)",
              "Verwenden Sie keine generischen Phrasen wie \"Bewertung abgeben\"",
              "Machen Sie es persönlich und ansprechend",
              "Verwenden Sie {{1}} als Platzhalter für den Namen des Kunden (WICHTIG: Verwenden Sie genau {{1}}, nicht {customerName} oder andere Variationen)"
            ],
            example: "Danke für Ihren Besuch bei uns, {{1}}! 🌟 Ihr Feedback hilft uns, Sie besser zu bedienen."
          },
          es: {
            welcomeText: "Crea un mensaje optimizado para solicitar reseñas para un restaurante. El mensaje debe animar a los clientes a dejar una reseña haciendo clic en un botón que se mostrará debajo del mensaje.",
            requirements: [
              "Sé amigable y conversacional",
              "Mantén el mensaje entre 100-120 caracteres",
              "No menciones ni incluyas el enlace de reseña (estará en un botón debajo)",
              "Concéntrate en uno de estos enfoques:",
              "   - Agradece al cliente por su pedido",
              "   - Enfatiza cómo los comentarios ayudan al restaurante a mejorar",
              "   - Destaca el valor de las opiniones de los clientes",
              "Usa emojis apropiados (máximo 2)",
              "No uses frases genéricas como \"deja una reseña\"",
              "Hazlo personal y atractivo",
              "Usa {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}}, no {customerName} u otras variaciones)"
            ],
            example: "¡Gracias por cenar con nosotros, {{1}}! 🌟 Tus comentarios nos ayudan a servirte mejor."
          }
        };

        const langInstructions = languageInstructions[language] || languageInstructions.en;

        const promptContent = `${langInstructions.welcomeText}

Restaurant Name: ${restaurant.name}
Rating: ${restaurant.googleRating?.rating || 'N/A'}/5 (${restaurant.googleRating?.ratingsTotal || 0} reviews)
Cuisine: ${restaurant.cuisineTypes?.join(', ') || 'Various'}

Requirements:
${langInstructions.requirements.map(req => req).join('\n')}

${language !== 'en' ? `IMPORTANT: The message MUST be in ${language} language.` : ''}

Response format:
Return ONLY the message text, without quotes or any additional explanation.

Example:
${langInstructions.example}`;

        const response = await anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 500,
          temperature: 0.7,
          messages: [
            {
              role: "user",
              content: promptContent
            }
          ]
        });

        const rawResponse = response.content[0].text;
        newMessage = rawResponse.trim().replace(/^["']|["']$/g, "");

      } else if (messageType === 'media' || messageType === 'menu_url') {
        // Rigenera messaggio di menu usando la logica del setupController
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });

        // Mappatura delle lingue con le istruzioni corrispondenti per messaggi di benvenuto
        const languageInstructions = {
          en: {
            welcomeText: "Create a very brief welcome message (max 2-3 lines, 30 words max) for this restaurant:",
            context: "The menu will be automatically handled by the system - do NOT mention menu access, buttons, or attachments.",
            requirements: [
              "Maximum 30 words total",
              "Maximum 2-3 lines",
              "Include {{1}} as placeholder for customer's name (IMPORTANT: use exactly {{1}})",
              "Include restaurant name",
              "Add 1-2 relevant food emojis based on cuisine",
              "Focus on warm welcome and restaurant's specialty",
              "DO NOT mention menu, buttons, links, or attachments",
              "Keep it simple and friendly",
              "IMPORTANT: Return ONLY the message without quotes or explanations"
            ],
            example: "Hi {{1}}! Welcome to Luigi's 🍝\nOur homemade pasta is loved by hundreds of customers!"
          },
          it: {
            welcomeText: "Crea un messaggio di benvenuto molto breve (max 2-3 righe, 30 parole max) per questo ristorante:",
            context: "Il menu sarà gestito automaticamente dal sistema - NON menzionare accesso al menu, pulsanti o allegati.",
            requirements: [
              "Massimo 30 parole totali",
              "Massimo 2-3 righe",
              "Includi {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}})",
              "Includi il nome del ristorante",
              "Aggiungi 1-2 emoji di cibo pertinenti in base alla cucina",
              "Concentrati su un caloroso benvenuto e la specialità del ristorante",
              "NON menzionare menu, pulsanti, link o allegati",
              "Mantieni semplice e amichevole",
              "IMPORTANTE: Restituisci SOLO il messaggio senza virgolette o spiegazioni"
            ],
            example: "Ciao {{1}}! Benvenuto da Luigi's 🍝\nLa nostra pasta fatta in casa è amata da centinaia di clienti!"
          },
          fr: {
            welcomeText: "Créez un message d'accueil très bref (max 2-3 lignes, 30 mots max) pour ce restaurant :",
            context: "Le menu sera géré automatiquement par le système - NE PAS mentionner l'accès au menu, boutons ou pièces jointes.",
            requirements: [
              "Maximum 30 mots au total",
              "Maximum 2-3 lignes",
              "Incluez {{1}} comme espace réservé pour le nom du client (IMPORTANT : utilisez exactement {{1}})",
              "Incluez le nom du restaurant",
              "Ajoutez 1-2 émojis d'aliments pertinents selon la cuisine",
              "Concentrez-vous sur un accueil chaleureux et la spécialité du restaurant",
              "NE PAS mentionner menu, boutons, liens ou pièces jointes",
              "Restez simple et amical",
              "IMPORTANT : Retournez UNIQUEMENT le message sans guillemets ou explications"
            ],
            example: "Bonjour {{1}} ! Bienvenue chez Luigi's 🍝\nNos pâtes maison sont adorées par des centaines de clients !"
          },
          de: {
            welcomeText: "Erstellen Sie eine sehr kurze Willkommensnachricht (max. 2-3 Zeilen, 30 Wörter max) für dieses Restaurant:",
            context: "Das Menü wird automatisch vom System verwaltet - NICHT Menüzugang, Schaltflächen oder Anhänge erwähnen.",
            requirements: [
              "Maximal 30 Wörter insgesamt",
              "Maximal 2-3 Zeilen",
              "Fügen Sie {{1}} als Platzhalter für den Namen des Kunden ein (WICHTIG: Verwenden Sie genau {{1}})",
              "Nennen Sie den Namen des Restaurants",
              "Fügen Sie 1-2 relevante Lebensmittel-Emojis basierend auf der Küche hinzu",
              "Konzentrieren Sie sich auf einen warmen Empfang und die Spezialität des Restaurants",
              "NICHT Menü, Schaltflächen, Links oder Anhänge erwähnen",
              "Halten Sie es einfach und freundlich",
              "WICHTIG: Geben Sie NUR die Nachricht ohne Anführungszeichen oder Erklärungen zurück"
            ],
            example: "Hallo {{1}}! Willkommen bei Luigi's 🍝\nUnsere hausgemachte Pasta wird von Hunderten von Kunden geliebt!"
          },
          es: {
            welcomeText: "Crea un mensaje de bienvenida muy breve (máx. 2-3 líneas, 30 palabras máx.) para este restaurante:",
            context: "El menú será manejado automáticamente por el sistema - NO mencionar acceso al menú, botones o archivos adjuntos.",
            requirements: [
              "Máximo 30 palabras en total",
              "Máximo 2-3 líneas",
              "Incluye {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}})",
              "Incluye el nombre del restaurante",
              "Agrega 1-2 emojis de comida relevantes según la cocina",
              "Enfócate en una bienvenida cálida y la especialidad del restaurante",
              "NO mencionar menú, botones, enlaces o archivos adjuntos",
              "Mantenlo simple y amigable",
              "IMPORTANTE: Devuelve SOLO el mensaje sin comillas o explicaciones"
            ],
            example: "¡Hola {{1}}! Bienvenido a Luigi's 🍝\n¡Nuestra pasta casera es amada por cientos de clientes!"
          }
        };

        const langInstructions = languageInstructions[language] || languageInstructions.en;

        const promptContent = `${langInstructions.welcomeText}

Restaurant Name: ${restaurant.name}
Rating: ${restaurant.googleRating?.rating || 'N/A'}/5 (${restaurant.googleRating?.ratingsTotal || 0} reviews)
Cuisine: ${restaurant.cuisineTypes?.join(', ') || 'Various'}

Context: ${langInstructions.context}

Requirements:
${langInstructions.requirements.map(req => req).join('\n')}

${language !== 'en' ? `IMPORTANT: The message MUST be in ${language} language.` : ''}

Example:
${langInstructions.example}`;

        const response = await anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 500,
          temperature: 0.7,
          messages: [
            {
              role: "user",
              content: promptContent
            }
          ]
        });

        const fullText = response.content[0].text;
        let generatedMessage = fullText;
        
        if (fullText.includes("\n\n")) {
          const parts = fullText.split("\n\n");
          if (parts.length === 2 && 
              (parts[1].startsWith("This welcome message") || 
               parts[1].startsWith("I've created") || 
               parts[1].startsWith("This message"))) {
            generatedMessage = parts[0];
          } else {
            generatedMessage = fullText.replace(/\n\n/g, "\n");
          }
        }
        
        newMessage = generatedMessage.replace(/^["']|["']$/g, "");

      } else {
        return res.status(400).json({
          success: false,
          error: 'Tipo di messaggio non supportato'
        });
      }

      // Aggiorna il template con il nuovo messaggio
      template.components.body.text = newMessage;
      template.status = 'PENDING'; // Reset status since we're submitting a new version
      template.updatedAt = new Date();
      await template.save();

      // Invia il template aggiornato a Twilio per approvazione
      await whatsappTemplateService.submitTemplateToTwilio(template);

      res.json({
        success: true,
        message: 'Messaggio rigenerato con successo',
        newMessage: newMessage
      });

    } catch (error) {
      console.error('Errore nella rigenerazione del messaggio:', error);
      res.status(500).json({
        success: false,
        error: 'Errore interno del server',
        details: error.message
      });
    }
  }
}

module.exports = new TemplateController(); 