const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Restaurant = require('../models/Restaurant');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const twilioService = require('../services/twilioService');
const axios = require('axios');

/**
 * @desc    Ottiene tutte le campagne per il ristorante dell'utente
 * @route   GET /api/campaigns
 * @access  Private
 */
const getCampaigns = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Opzioni di paginazione
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    
    // Costruisci il filtro di query
    const queryFilter = { 
      restaurant: restaurant._id,
      isActive: true
    };
    
    // Filtra per status se specificato
    if (req.query.status) {
      queryFilter.status = req.query.status;
    }
    
    // Esegui il conteggio totale per la paginazione
    const total = await Campaign.countDocuments(queryFilter);
    
    // Ottieni le campagne con paginazione e ordinamento
    const campaigns = await Campaign.find(queryFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-recipients'); // Esclude l'array dei destinatari per ridurre le dimensioni
    
    // Prepara la risposta con informazioni di paginazione
    res.status(200).json({
      success: true,
      data: {
        campaigns,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle campagne:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero delle campagne',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene una singola campagna per ID
 * @route   GET /api/campaigns/:id
 * @access  Private
 */
const getCampaignById = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova la campagna per ID e ristorante
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      restaurant: restaurant._id,
      isActive: true
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Errore nel recupero della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Crea una nuova campagna (draft)
 * @route   POST /api/campaigns
 * @access  Private
 */
const createCampaign = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    const { name } = req.body;
    
    // Validazione
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Nome campagna è obbligatorio'
      });
    }
    
    // Crea una nuova campagna in stato draft
    const campaign = await Campaign.create({
      restaurant: restaurant._id,
      name,
      status: 'draft',
      scheduledFor: new Date(Date.now() + 30 * 60 * 1000), // Default a 30 minuti da ora
      content: {
        type: 'text',
        text: 'Questo è un messaggio di prova.', // Testo di default
      }
    });
    
    res.status(201).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Errore nella creazione della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella creazione della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Aggiorna una campagna esistente
 * @route   PUT /api/campaigns/:id
 * @access  Private
 */
const updateCampaign = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova la campagna
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      restaurant: restaurant._id,
      isActive: true
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    // Verifica che la campagna sia modificabile
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Campagna non modificabile in questo stato'
      });
    }
    
    // Campi aggiornabili
    const {
      name,
      scheduledFor,
      content,
      filters
    } = req.body;
    
    // Aggiorna i campi se forniti
    if (name) campaign.name = name;
    
    if (scheduledFor) {
      const scheduledDate = new Date(scheduledFor);
      const minAllowedDate = new Date(Date.now() + 10 * 60 * 1000); // Minimo 10 minuti da ora
      
      if (scheduledDate < minAllowedDate) {
        return res.status(400).json({
          success: false,
          message: 'La data di invio deve essere almeno 10 minuti nel futuro'
        });
      }
      
      campaign.scheduledFor = scheduledDate;
    }
    
    if (content) {
      // Aggiorna i campi del contenuto uno per uno per evitare di sovrascrivere campi non forniti
      if (content.type) campaign.content.type = content.type;
      if (content.text) campaign.content.text = content.text;
      if (content.mediaUrl !== undefined) campaign.content.mediaUrl = content.mediaUrl;
      if (content.mediaType !== undefined) campaign.content.mediaType = content.mediaType;
      if (content.ctaType !== undefined) campaign.content.ctaType = content.ctaType;
      if (content.ctaText !== undefined) campaign.content.ctaText = content.ctaText;
      if (content.ctaValue !== undefined) campaign.content.ctaValue = content.ctaValue;
    }
    
    if (filters) {
      // Aggiorna i filtri uno per uno
      if (filters.countries !== undefined) campaign.filters.countries = filters.countries;
      if (filters.optIn !== undefined) campaign.filters.optIn = filters.optIn;
      if (filters.minInteractions !== undefined) campaign.filters.minInteractions = filters.minInteractions;
      if (filters.tags !== undefined) campaign.filters.tags = filters.tags;
      if (filters.language !== undefined) campaign.filters.language = filters.language;
    }
    
    // Salva le modifiche
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'aggiornamento della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Elimina una campagna
 * @route   DELETE /api/campaigns/:id
 * @access  Private
 */
const deleteCampaign = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Elimina logicamente la campagna (imposta isActive a false)
    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: req.params.id,
        restaurant: restaurant._id,
        isActive: true
      },
      { isActive: false },
      { new: true }
    );
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Campagna eliminata con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'eliminazione della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Seleziona i destinatari per una campagna
 * @route   POST /api/campaigns/:id/recipients
 * @access  Private
 */
const selectRecipients = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova la campagna
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      restaurant: restaurant._id,
      isActive: true
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    // Verifica che la campagna sia in stato draft
    if (campaign.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Impossibile modificare i destinatari in questo stato'
      });
    }
    
    const {
      contactIds,
      filters
    } = req.body;
    
    // Aggiorna i filtri se specificati
    if (filters) {
      campaign.filters = {
        ...campaign.filters,
        ...filters
      };
    }
    
    // Costruisci la query per i contatti in base ai filtri
    const contactQuery = {
      restaurant: restaurant._id,
      optIn: campaign.filters.optIn !== undefined ? campaign.filters.optIn : true,
      optOut: false // Non includere contatti che hanno fatto opt-out
    };
    
    // Filtro per paesi (prefissi telefonici)
    if (campaign.filters.countries && campaign.filters.countries.length > 0) {
      const countryPrefixes = campaign.filters.countries.map(country => {
        switch (country.toLowerCase()) {
          case 'it': return '39';
          case 'en': return ['1', '44']; // USA/Canada e UK
          case 'es': return '34';
          case 'de': return '49';
          case 'fr': return '33';
          default: return country;
        }
      }).flat();
      
      // Crea una regex per cercare numeri che iniziano con i prefissi specificati
      const prefixRegex = new RegExp(`^(whatsapp:)?\\+?(${countryPrefixes.join('|')})`);
      contactQuery.phoneNumber = { $regex: prefixRegex };
    }
    
    // Filtro per lingua
    if (campaign.filters.language) {
      contactQuery.language = campaign.filters.language;
    }
    
    // Filtro per minimo di interazioni
    if (campaign.filters.minInteractions && campaign.filters.minInteractions > 0) {
      contactQuery.interactionCount = { $gte: campaign.filters.minInteractions };
    }
    
    // Filtro per tag
    if (campaign.filters.tags && campaign.filters.tags.length > 0) {
      contactQuery.tags = { $in: campaign.filters.tags };
    }
    
    let selectedContacts;
    
    // Se sono specificati degli ID di contatto, usa quelli
    if (contactIds && contactIds.length > 0) {
      selectedContacts = await Contact.find({
        _id: { $in: contactIds },
        restaurant: restaurant._id,
        optIn: true,
        optOut: false
      }).select('_id');
    } else {
      // Altrimenti usa i filtri
      selectedContacts = await Contact.find(contactQuery).select('_id');
    }
    
    // Aggiorna i destinatari nella campagna
    campaign.recipients = selectedContacts.map(contact => ({
      contact: contact._id,
      sent: false
    }));
    
    campaign.recipientsCount = campaign.recipients.length;
    
    // Salva le modifiche
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: {
        recipientsCount: campaign.recipientsCount,
        filters: campaign.filters
      }
    });
  } catch (error) {
    console.error('Errore nella selezione dei destinatari:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella selezione dei destinatari',
      error: error.message
    });
  }
};

/**
 * @desc    Genera un testo per la campagna con AI
 * @route   POST /api/campaigns/:id/generate-text
 * @access  Private
 */
const generateCampaignText = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova la campagna
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      restaurant: restaurant._id,
      isActive: true
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    const {
      campaignType,
      language = 'it',
      customPrompt
    } = req.body;
    
    if (!campaignType) {
      return res.status(400).json({
        success: false,
        message: 'Tipo di campagna richiesto'
      });
    }
    
    // Prepara il prompt per Claude 3
    let prompt = `Genera un messaggio WhatsApp per una campagna marketing di un ristorante. 
Il messaggio deve essere conciso, accattivante e adatto a WhatsApp. 
Usa un tono amichevole ma professionale.

Tipo di campagna: ${campaignType}
Nome ristorante: ${restaurant.name}
Lingua: ${language}

`;

    if (customPrompt) {
      prompt += `Dettagli aggiuntivi: ${customPrompt}\n\n`;
    }
    
    prompt += `Genera solo il testo del messaggio, senza commenti o spiegazioni.
Il messaggio deve essere breve (massimo 1024 caratteri) ma efficace.
`;
    
    if (language !== 'it') {
      prompt += `Il messaggio deve essere in ${language === 'en' ? 'inglese' : language === 'es' ? 'spagnolo' : language === 'fr' ? 'francese' : language === 'de' ? 'tedesco' : language}.`;
    }
    
    // Chiamata a Claude 3.7 tramite API Anthropic
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1024,
          messages: [
            { 
              role: 'user', 
              content: prompt 
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          }
        }
      );
      
      // Estrai il testo generato
      const generatedText = response.data.content[0].text;
      
      // Aggiorna il testo della campagna
      campaign.content.text = generatedText;
      await campaign.save();
      
      // Genera anche un suggerimento per la CTA
      let ctaSuggestion = '';
      if (campaignType.includes('promozione') || campaignType.includes('sconto') || campaignType.includes('offerta')) {
        ctaSuggestion = language === 'en' ? 'Get Discount' : 'Ottieni Sconto';
      } else if (campaignType.includes('menu') || campaignType.includes('menù')) {
        ctaSuggestion = language === 'en' ? 'View Menu' : 'Vedi Menu';
      } else if (campaignType.includes('prenotazione') || campaignType.includes('reserv')) {
        ctaSuggestion = language === 'en' ? 'Book Now' : 'Prenota Ora';
      } else if (campaignType.includes('evento') || campaignType.includes('event')) {
        ctaSuggestion = language === 'en' ? 'More Info' : 'Maggiori Info';
      } else {
        ctaSuggestion = language === 'en' ? 'Visit Us' : 'Visitaci';
      }
      
      res.status(200).json({
        success: true,
        data: {
          text: generatedText,
          ctaSuggestion
        }
      });
    } catch (aiError) {
      console.error('Errore nella generazione del testo con AI:', aiError);
      res.status(500).json({
        success: false,
        message: 'Errore nella generazione del testo con AI',
        error: aiError.message
      });
    }
  } catch (error) {
    console.error('Errore nella generazione del testo:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella generazione del testo',
      error: error.message
    });
  }
};

/**
 * @desc    Genera un'immagine per la campagna con AI
 * @route   POST /api/campaigns/:id/generate-image
 * @access  Private
 */
const generateCampaignImage = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova la campagna
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      restaurant: restaurant._id,
      isActive: true
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Prompt richiesto per la generazione dell\'immagine'
      });
    }
    
    // Chiama l'API OpenAI per la generazione dell'immagine
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model: "dall-e-3",
          prompt: `${prompt} (Stile professionale per marketing di ristorante)`,
          n: 1,
          size: "1024x1024"
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          }
        }
      );
      
      const imageUrl = response.data.data[0].url;
      
      // Aggiorna la campagna con l'URL dell'immagine
      campaign.content.type = 'media';
      campaign.content.mediaUrl = imageUrl;
      campaign.content.mediaType = 'image';
      await campaign.save();
      
      res.status(200).json({
        success: true,
        data: {
          imageUrl,
          campaignId: campaign._id
        }
      });
    } catch (aiError) {
      console.error('Errore nella generazione dell\'immagine con AI:', aiError);
      res.status(500).json({
        success: false,
        message: 'Errore nella generazione dell\'immagine con AI',
        error: aiError.message
      });
    }
  } catch (error) {
    console.error('Errore nella generazione dell\'immagine:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella generazione dell\'immagine',
      error: error.message
    });
  }
};

/**
 * @desc    Invia il template a Twilio per approvazione
 * @route   POST /api/campaigns/:id/submit-template
 * @access  Private
 */
const submitCampaignTemplate = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova la campagna
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      restaurant: restaurant._id,
      isActive: true
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    // Verifica che la campagna sia in stato draft o scheduled
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Impossibile inviare il template in questo stato'
      });
    }
    
    // Verifica che la campagna abbia un testo
    if (!campaign.content.text) {
      return res.status(400).json({
        success: false,
        message: 'Testo del messaggio richiesto'
      });
    }
    
    // Verifica che ci siano dei destinatari
    if (campaign.recipientsCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Seleziona almeno un destinatario'
      });
    }
    
    // Determina il tipo di template da creare per Twilio
    let templateType;
    if (campaign.content.type === 'media' && campaign.content.mediaUrl) {
      templateType = 'MEDIA';
    } else if (campaign.content.ctaType === 'url' && campaign.content.ctaValue) {
      templateType = 'CALL_TO_ACTION';
    } else {
      templateType = 'TEXT';
    }
    
    // Genera un nome univoco per il template
    const timestamp = Date.now();
    const randomId = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const templateName = `campaign_${restaurant.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${timestamp}_${randomId}`;
    
    // Prepara l'oggetto template
    const templateData = {
      restaurant: restaurant._id,
      name: templateName,
      type: templateType,
      language: campaign.filters.language || 'it',
      status: 'PENDING',
      components: {
        body: {
          text: campaign.content.text
        }
      },
      isActive: true
    };
    
    // Aggiungi header per template MEDIA
    if (templateType === 'MEDIA') {
      templateData.components.header = {
        type: 'IMAGE',
        example: campaign.content.mediaUrl
      };
    }
    
    // Aggiungi pulsanti per template CALL_TO_ACTION
    if (templateType === 'CALL_TO_ACTION') {
      templateData.components.buttons = [{
        type: 'URL',
        text: campaign.content.ctaText || 'Apri',
        url: campaign.content.ctaValue
      }];
      
      // Aggiungi anche un pulsante per opt-out se richiesto
      if (req.body.addOptOutButton) {
        templateData.components.buttons.push({
          type: 'QUICK_REPLY',
          text: 'Disiscriviti'
        });
      }
    }
    
    // Crea il template in database
    const whatsappTemplate = new WhatsAppTemplate(templateData);
    await whatsappTemplate.save();
    
    // Invia il template a Twilio per approvazione
    try {
      const result = await twilioService.submitTemplateToTwilio(whatsappTemplate);
      
      // Aggiorna la campagna con le informazioni del template
      campaign.twilioTemplateId = whatsappTemplate._id;
      campaign.twilioTemplateName = templateName;
      campaign.twilioTemplateStatus = 'pending';
      campaign.status = 'pending_approval';
      await campaign.save();
      
      res.status(200).json({
        success: true,
        data: {
          templateId: whatsappTemplate._id,
          templateName,
          status: 'pending'
        }
      });
    } catch (twilioError) {
      // In caso di errore, elimina il template creato
      await WhatsAppTemplate.findByIdAndDelete(whatsappTemplate._id);
      
      throw new Error(`Errore nell'invio del template a Twilio: ${twilioError.message}`);
    }
  } catch (error) {
    console.error('Errore nella sottomissione del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella sottomissione del template',
      error: error.message
    });
  }
};

/**
 * @desc    Controlla lo stato di approvazione del template della campagna
 * @route   GET /api/campaigns/:id/check-template
 * @access  Private
 */
const checkCampaignTemplate = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova la campagna
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      restaurant: restaurant._id,
      isActive: true
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }
    
    // Verifica che la campagna abbia un template associato
    if (!campaign.twilioTemplateId) {
      return res.status(400).json({
        success: false,
        message: 'Nessun template associato alla campagna'
      });
    }
    
    // Ottieni il template
    const template = await WhatsAppTemplate.findById(campaign.twilioTemplateId);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }
    
    // Controlla lo stato del template su Twilio
    const templateStatus = await twilioService.checkTemplateStatus(template._id);
    
    // Aggiorna lo stato del template nella campagna
    campaign.twilioTemplateStatus = templateStatus.status;
    
    // Se il template è approvato, aggiorna lo stato della campagna
    if (templateStatus.status === 'APPROVED') {
      campaign.status = 'scheduled';
    } else if (templateStatus.status === 'REJECTED') {
      campaign.status = 'draft';
      campaign.error = templateStatus.rejectionReason || 'Template respinto da Twilio';
    }
    
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: {
        status: templateStatus.status,
        name: template.name,
        rejectionReason: templateStatus.rejectionReason || null,
        campaignStatus: campaign.status
      }
    });
  } catch (error) {
    console.error('Errore nel controllo dello stato del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel controllo dello stato del template',
      error: error.message
    });
  }
};

module.exports = {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  selectRecipients,
  generateCampaignText,
  generateCampaignImage,
  submitCampaignTemplate,
  checkCampaignTemplate
}; 