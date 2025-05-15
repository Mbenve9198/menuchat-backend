const Restaurant = require('../models/Restaurant');
const CampaignTemplate = require('../models/CampaignTemplate');
const BotConfiguration = require('../models/BotConfiguration');
const whatsappTemplateService = require('../services/whatsappTemplateService');
const axios = require('axios');

/**
 * @desc    Ottiene tutti i template di campagna per un ristorante
 * @route   GET /api/campaign-templates
 * @access  Private
 */
const getTemplates = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Opzioni di filtro
    const filter = { restaurant: restaurant._id };
    
    // Filtro per tipo di campagna se specificato
    if (req.query.campaignType) {
      filter.campaignType = req.query.campaignType;
    }
    
    // Filtro per tipo di template se specificato
    if (req.query.type) {
      filter.type = req.query.type;
    }
    
    // Filtro per stato se specificato
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Filtro per lingua se specificato
    if (req.query.language) {
      filter.language = req.query.language;
    }
    
    // Filtro per template attivi/inattivi
    if (req.query.isActive) {
      filter.isActive = req.query.isActive === 'true';
    }

    // Trova tutti i template per questo ristorante, ordinati per data di creazione (più recenti prima)
    const templates = await CampaignTemplate.find(filter)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    console.error('Errore nel recupero dei template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il recupero dei template',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene un singolo template di campagna per ID
 * @route   GET /api/campaign-templates/:id
 * @access  Private
 */
const getTemplateById = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova il template
    const template = await CampaignTemplate.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Errore nel recupero del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il recupero del template',
      error: error.message
    });
  }
};

/**
 * @desc    Crea un nuovo template di campagna
 * @route   POST /api/campaign-templates
 * @access  Private
 */
const createTemplate = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Ottiene dati dal body della richiesta
    const {
      type,
      name,
      language,
      campaignType,
      components,
      variables,
      whatsappCategory,
      preview
    } = req.body;

    // Validazione dei dati
    if (!type || !name || !campaignType || !components || !components.body) {
      return res.status(400).json({
        success: false,
        message: 'Dati mancanti nel template'
      });
    }

    // Crea il nuovo template
    const templateData = {
      restaurant: restaurant._id,
      type,
      name,
      language: language || 'it',
      campaignType,
      components,
      variables,
      isCustom: true,
      whatsappCategory: whatsappCategory || 'MARKETING',
      preview: preview || {}
    };

    const template = new CampaignTemplate(templateData);
    await template.save();

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Errore nella creazione del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la creazione del template',
      error: error.message
    });
  }
};

/**
 * @desc    Aggiorna un template di campagna esistente
 * @route   PUT /api/campaign-templates/:id
 * @access  Private
 */
const updateTemplate = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova il template
    const template = await CampaignTemplate.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Verifica se il template ha già un ID Twilio e lo stato è APPROVED o PENDING
    if (template.twilioTemplateId && ['APPROVED', 'PENDING'].includes(template.status)) {
      // In questo caso, è meglio creare una nuova versione invece di modificare quella esistente
      const newName = req.body.name || `${template.name}_v${template.version + 1}`;
      const newTemplate = await template.createCopy(newName);
      
      // Aggiorna i campi del nuovo template
      Object.keys(req.body).forEach(key => {
        if (key !== '_id' && key !== 'restaurant' && key !== 'twilioTemplateId' && key !== 'status') {
          if (key === 'components' || key === 'preview' || key === 'variables') {
            newTemplate[key] = { ...newTemplate[key], ...req.body[key] };
          } else {
            newTemplate[key] = req.body[key];
          }
        }
      });
      
      await newTemplate.save();
      
      return res.status(200).json({
        success: true,
        data: newTemplate,
        message: 'Nuova versione del template creata poiché la versione precedente era già stata sottomessa a Twilio'
      });
    }

    // Altrimenti, aggiorna il template esistente
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'restaurant' && key !== 'twilioTemplateId' && key !== 'status') {
        if (key === 'components' || key === 'preview' || key === 'variables') {
          template[key] = { ...template[key], ...req.body[key] };
        } else {
          template[key] = req.body[key];
        }
      }
    });

    await template.save();

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'aggiornamento del template',
      error: error.message
    });
  }
};

/**
 * @desc    Elimina un template di campagna
 * @route   DELETE /api/campaign-templates/:id
 * @access  Private
 */
const deleteTemplate = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova il template
    const template = await CampaignTemplate.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Verifica che il template non sia in uso in campagne attive
    if (template.usageStatistics && template.usageStatistics.campaignsUsedIn && template.usageStatistics.campaignsUsedIn.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Non è possibile eliminare un template utilizzato in campagne. Disattivarlo invece.'
      });
    }

    await template.remove();

    res.status(200).json({
      success: true,
      message: 'Template eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'eliminazione del template',
      error: error.message
    });
  }
};

/**
 * @desc    Duplica un template di campagna esistente
 * @route   POST /api/campaign-templates/:id/duplicate
 * @access  Private
 */
const duplicateTemplate = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova il template
    const template = await CampaignTemplate.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Nome personalizzato per la copia, se fornito
    const newName = req.body.name || `Copia di ${template.name}`;
    
    // Crea una copia del template
    const newTemplate = await template.createCopy(newName);

    res.status(201).json({
      success: true,
      data: newTemplate
    });
  } catch (error) {
    console.error('Errore nella duplicazione del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la duplicazione del template',
      error: error.message
    });
  }
};

/**
 * @desc    Crea template predefiniti per un ristorante
 * @route   POST /api/campaign-templates/create-defaults
 * @access  Private
 */
const createDefaultTemplates = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Verifica se ci sono già template predefiniti
    const existingDefaults = await CampaignTemplate.find({
      restaurant: restaurant._id,
      isCustom: false
    });

    // Se ci sono già template predefiniti, restituiscili senza crearne di nuovi
    if (existingDefaults.length > 0) {
      return res.status(200).json({
        success: true,
        data: existingDefaults,
        message: 'Template predefiniti già presenti'
      });
    }

    // Crea template predefiniti
    const templates = await CampaignTemplate.createDefaultTemplates(
      restaurant._id,
      restaurant.name
    );

    res.status(201).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    console.error('Errore nella creazione dei template predefiniti:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la creazione dei template predefiniti',
      error: error.message
    });
  }
};

/**
 * @desc    Invia un template a Twilio per approvazione
 * @route   POST /api/campaign-templates/:id/submit
 * @access  Private
 */
const submitTemplateToTwilio = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova il template
    const template = await CampaignTemplate.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Se il template è già stato inviato e approvato, non serve reinviarlo
    if (template.status === 'APPROVED' && template.twilioTemplateId) {
      return res.status(200).json({
        success: true,
        data: {
          templateId: template._id,
          twilioTemplateId: template.twilioTemplateId,
          status: template.status
        },
        message: 'Template già approvato'
      });
    }

    // Categoria del template (richiesta da WhatsApp)
    const { category } = req.body;
    
    if (!category || !['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Categoria non valida. Utilizzare UTILITY, MARKETING o AUTHENTICATION'
      });
    }

    // Genera un nome univoco per il template di WhatsApp
    const templateName = `${restaurant.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_${
      template.campaignType
    }_${Date.now()}`.substring(0, 64);

    try {
      // Ottieni le credenziali Twilio
      const botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });
      
      if (!botConfig) {
        return res.status(404).json({
          success: false,
          message: 'Configurazione bot non trovata'
        });
      }

      // Prepara la richiesta per Twilio Content API
      const twilioSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;

      if (!twilioSid || !twilioToken) {
        return res.status(400).json({
          success: false,
          message: 'Credenziali Twilio non configurate'
        });
      }

      // Converte il formato del template a quello richiesto da Twilio
      const contentApiBaseUrl = 'https://content.twilio.com/v1/Content';
      
      // Prepara il corpo della richiesta in base al tipo di template
      let requestBody = {
        friendly_name: templateName,
        language: template.language,
        variables: {}
      };
      
      // Aggiungi le variabili se presenti
      if (template.variables && template.variables.length > 0) {
        template.variables.forEach(variable => {
          requestBody.variables[variable.index] = variable.name || "customer_name";
        });
      }
      
      // Aggiungi i tipi di content
      requestBody.types = {};
      
      if (template.type === 'CALL_TO_ACTION') {
        requestBody.types["twilio/call-to-action"] = {
          body: template.components.body.text,
          actions: template.components.buttons.map(button => {
            if (button.type === 'URL') {
              return {
                type: "URL",
                title: button.text,
                url: button.url
              };
            } else if (button.type === 'PHONE') {
              return {
                type: "PHONE_NUMBER",
                title: button.text,
                phone_number: button.phone_number
              };
            }
          }).filter(Boolean)
        };
      } else if (template.type === 'MEDIA') {
        requestBody.types["twilio/media"] = {
          body: template.components.body.text,
          media: [template.components.header.example]
        };
      }
      
      // 1. Crea il template in Twilio
      const contentResponse = await axios({
        method: 'post',
        url: contentApiBaseUrl,
        auth: {
          username: twilioSid,
          password: twilioToken
        },
        data: requestBody
      });

      const contentSid = contentResponse.data.sid;

      // 2. Richiedi l'approvazione per WhatsApp
      const approvalResponse = await axios({
        method: 'post',
        url: `${contentApiBaseUrl}/${contentSid}/ApprovalRequests/whatsapp`,
        auth: {
          username: twilioSid,
          password: twilioToken
        },
        data: {
          name: templateName,
          category: category
        }
      });

      // Aggiorna il template con l'ID Twilio e lo stato
      template.twilioTemplateId = contentSid;
      template.status = 'PENDING';
      template.lastSubmissionDate = new Date();
      template.whatsappCategory = category;
      await template.save();

      return res.status(200).json({
        success: true,
        data: {
          templateId: template._id,
          twilioTemplateId: contentSid,
          name: templateName,
          status: 'PENDING',
          approvalResponse: approvalResponse.data
        }
      });
    } catch (error) {
      console.error('Errore nella sottomissione del template a Twilio:', error.response?.data || error);
      
      return res.status(500).json({
        success: false,
        message: 'Errore durante la sottomissione del template a Twilio',
        error: error.response?.data?.message || error.message
      });
    }
  } catch (error) {
    console.error('Errore generale nella sottomissione del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la sottomissione del template',
      error: error.message
    });
  }
};

/**
 * @desc    Controlla lo stato di un template in Twilio
 * @route   GET /api/campaign-templates/:id/status
 * @access  Private
 */
const checkTemplateStatus = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova il template
    const template = await CampaignTemplate.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Verifica che il template abbia un ID Twilio
    if (!template.twilioTemplateId) {
      return res.status(400).json({
        success: false,
        message: 'Il template non è stato ancora inviato a Twilio'
      });
    }

    // Ottieni le credenziali Twilio
    const botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });
      
    if (!botConfig) {
      return res.status(404).json({
        success: false,
        message: 'Configurazione bot non trovata'
      });
    }

    // Prepara la richiesta per Twilio Content API
    const twilioSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;

    if (!twilioSid || !twilioToken) {
      return res.status(400).json({
        success: false,
        message: 'Credenziali Twilio non configurate'
      });
    }

    // Controlla lo stato del template
    const contentApiBaseUrl = 'https://content.twilio.com/v1/Content';
    const response = await axios({
      method: 'get',
      url: `${contentApiBaseUrl}/${template.twilioTemplateId}/ApprovalRequests`,
      auth: {
        username: twilioSid,
        password: twilioToken
      }
    });

    const approvalStatus = response.data.whatsapp?.status || 'unknown';
    const rejectionReason = response.data.whatsapp?.rejection_reason || '';
    
    // Aggiorna lo stato del template nel database
    if (approvalStatus === 'approved' && template.status !== 'APPROVED') {
      template.status = 'APPROVED';
      await template.save();
    } else if (approvalStatus === 'rejected' && template.status !== 'REJECTED') {
      template.status = 'REJECTED';
      template.rejectionReason = rejectionReason;
      await template.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        templateId: template._id,
        twilioTemplateId: template.twilioTemplateId,
        status: approvalStatus,
        rejectionReason: rejectionReason,
        lastChecked: new Date()
      }
    });
  } catch (error) {
    console.error('Errore nel controllo dello stato del template:', error.response?.data || error);
    
    return res.status(500).json({
      success: false,
      message: 'Errore durante il controllo dello stato del template',
      error: error.response?.data?.message || error.message
    });
  }
};

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  createDefaultTemplates,
  submitTemplateToTwilio,
  checkTemplateStatus
}; 