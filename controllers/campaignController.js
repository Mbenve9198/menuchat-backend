const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const WhatsAppContact = require('../models/WhatsAppContact');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const CampaignTemplate = require('../models/CampaignTemplate');
const Restaurant = require('../models/Restaurant');
const twilioService = require('../services/twilioService');
const Anthropic = require('@anthropic-ai/sdk');
const BotConfiguration = require('../models/BotConfiguration');
const crypto = require('crypto');
const mongoose = require('mongoose');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * @desc    Ottiene tutti i contatti WhatsApp per un ristorante
 * @route   GET /api/campaign/contacts
 * @access  Private
 */
const getContacts = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova tutti i contatti per questo ristorante con opt-in attivo
    const contacts = await WhatsAppContact.find({ 
      restaurant: restaurant._id,
      'marketingConsent.status': true
    }).sort({ lastContactDate: -1 });

    // Organizza il prefisso internazionale per il filtraggio con emoji flags
    const processedContacts = contacts.map(contact => {
      const phoneNumber = contact.phoneNumber;
      
      // Identifica il prefisso internazionale (funzione semplificata)
      const getCountryPrefix = (phone) => {
        // Rimuovi eventuali prefissi 'whatsapp:' o spazi
        const cleanNumber = phone.replace(/\s+/g, '');
        
        // Controlla i prefissi più comuni
        if (cleanNumber.startsWith('+1') || cleanNumber.startsWith('1')) return '+1'; // USA/Canada
        if (cleanNumber.startsWith('+44') || cleanNumber.startsWith('44')) return '+44'; // UK
        if (cleanNumber.startsWith('+39') || cleanNumber.startsWith('39')) return '+39'; // Italia
        if (cleanNumber.startsWith('+34') || cleanNumber.startsWith('34')) return '+34'; // Spagna
        if (cleanNumber.startsWith('+49') || cleanNumber.startsWith('49')) return '+49'; // Germania
        if (cleanNumber.startsWith('+33') || cleanNumber.startsWith('33')) return '+33'; // Francia
        if (cleanNumber.startsWith('+86') || cleanNumber.startsWith('86')) return '+86'; // Cina
        if (cleanNumber.startsWith('+91') || cleanNumber.startsWith('91')) return '+91'; // India
        if (cleanNumber.startsWith('+52') || cleanNumber.startsWith('52')) return '+52'; // Messico
        if (cleanNumber.startsWith('+55') || cleanNumber.startsWith('55')) return '+55'; // Brasile
        
        // Default: assume che sia italiano se non riconosciuto
        return '+39';
      };

      const prefix = getCountryPrefix(phoneNumber);
      
      return {
        id: contact._id,
        name: contact.name,
        phone: phoneNumber,
        countryCode: prefix,
        lastOrder: `${Math.round((Date.now() - contact.lastContactDate) / (24 * 60 * 60 * 1000))} giorni fa`,
        language: contact.language,
        interactionCount: contact.interactionCount,
        selected: false, // Stato iniziale per la UI
        isOptedIn: contact.marketingConsent.status
      };
    });

    // Recupera la lista dei country codes per il frontend
    const countryCodesMap = getCountryCodes();

    res.status(200).json({
      success: true,
      contacts: processedContacts,
      countryCodes: countryCodesMap
    });
  } catch (error) {
    console.error('Errore nel recupero dei contatti:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il recupero dei contatti',
      error: error.message
    });
  }
};

/**
 * @desc    Restituisce le informazioni sui country codes per i filtri del frontend
 * @access  Private
 */
const getCountryCodes = () => {
  // Definizione dei country codes con emoji flags
  return [
    { code: "+1", name: "United States/Canada", flag: "🇺🇸" },
    { code: "+34", name: "Spain", flag: "🇪🇸" },
    { code: "+39", name: "Italy", flag: "🇮🇹" },
    { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
    { code: "+49", name: "Germany", flag: "🇩🇪" },
    { code: "+33", name: "France", flag: "🇫🇷" },
    { code: "+86", name: "China", flag: "🇨🇳" },
    { code: "+52", name: "Mexico", flag: "🇲🇽" },
    { code: "+91", name: "India", flag: "🇮🇳" },
    { code: "+55", name: "Brazil", flag: "🇧🇷" },
  ];
};

/**
 * @desc    Crea una nuova campagna WhatsApp
 * @route   POST /api/campaign
 * @access  Private
 */
const createCampaign = async (req, res) => {
  try {
    const {
      name,
      description,
      templateId,
      scheduledDate,
      targetAudience,
      templateParameters
    } = req.body;

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Verifica che il template esista (ora usando CampaignTemplate)
    const template = await CampaignTemplate.findById(templateId);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template non trovato'
      });
    }

    // Calcola il numero totale di contatti
    let totalContacts = 0;
    let contactIds = [];

    switch (targetAudience.selectionMethod) {
      case 'all':
        // Includi tutti i contatti con consenso marketing se richiesto
        const filter = targetAudience.onlyWithConsent 
          ? { restaurant: restaurant._id, 'marketingConsent.status': true }
          : { restaurant: restaurant._id };
        
        totalContacts = await WhatsAppContact.countDocuments(filter);
        
        // Ottieni gli ID di tutti i contatti per la campagna
        const allContacts = await WhatsAppContact.find(filter).select('_id');
        contactIds = allContacts.map(contact => contact._id);
        break;

      case 'tags':
        // Filtra per tag
        if (targetAudience.tags && targetAudience.tags.length > 0) {
          const tagFilter = {
            restaurant: restaurant._id,
            tags: { $in: targetAudience.tags }
          };
          
          if (targetAudience.onlyWithConsent) {
            tagFilter['marketingConsent.status'] = true;
          }
          
          totalContacts = await WhatsAppContact.countDocuments(tagFilter);
          
          // Ottieni gli ID dei contatti per tag
          const taggedContacts = await WhatsAppContact.find(tagFilter).select('_id');
          contactIds = taggedContacts.map(contact => contact._id);
        }
        break;

      case 'manual':
        // Usa i contatti selezionati manualmente
        if (targetAudience.manualContacts && targetAudience.manualContacts.length > 0) {
          const manualFilter = {
            _id: { $in: targetAudience.manualContacts },
            restaurant: restaurant._id
          };
          
          if (targetAudience.onlyWithConsent) {
            manualFilter['marketingConsent.status'] = true;
          }
          
          totalContacts = await WhatsAppContact.countDocuments(manualFilter);
          contactIds = targetAudience.manualContacts;
        }
        break;

      case 'filter':
        // Implementa filtri personalizzati
        let customFilter = { restaurant: restaurant._id };
        
        // Aggiungi filtri personalizzati basati su targetAudience.customFilters
        if (targetAudience.customFilters) {
          // Esempi di filtri possibili:
          if (targetAudience.customFilters.language) {
            customFilter.language = targetAudience.customFilters.language;
          }
          
          if (targetAudience.customFilters.minInteractions) {
            customFilter.interactionCount = { $gte: targetAudience.customFilters.minInteractions };
          }
          
          if (targetAudience.customFilters.lastContact) {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - targetAudience.customFilters.lastContact);
            customFilter.lastContactDate = { $gte: daysAgo };
          }
        }
        
        if (targetAudience.onlyWithConsent) {
          customFilter['marketingConsent.status'] = true;
        }
        
        totalContacts = await WhatsAppContact.countDocuments(customFilter);
        
        // Ottieni gli ID dei contatti filtrati
        const filteredContacts = await WhatsAppContact.find(customFilter).select('_id');
        contactIds = filteredContacts.map(contact => contact._id);
        break;
    }

    // Se impostata come scheduledDate 'now', imposta a 10 minuti nel futuro
    let scheduledTime = scheduledDate === 'now' 
      ? new Date(Date.now() + 10 * 60 * 1000) // 10 minuti da ora
      : new Date(scheduledDate);

    // Crea la campagna
    const campaign = new WhatsAppCampaign({
      restaurant: restaurant._id,
      name,
      description,
      template: templateId,
      scheduledDate: scheduledTime,
      status: 'scheduled',
      targetAudience: {
        ...targetAudience,
        totalContacts,
        manualContacts: contactIds
      },
      templateParameters: templateParameters || {}
    });

    await campaign.save();

    // Se la campagna è programmata ora o nel futuro prossimo, la imposta nel job di invio
    if (scheduledTime < new Date(Date.now() + 30 * 60 * 1000)) { // Meno di 30 minuti nel futuro
      // Qui eventualmente si potrebbe richiamare un job scheduler per invio campagne
      // oppure impostare uno stato che il job scheduler controllerà periodicamente
    }

    res.status(201).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Errore nella creazione della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la creazione della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene tutte le campagne WhatsApp di un ristorante
 * @route   GET /api/campaign
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

    // Trova tutte le campagne per questo ristorante
    const campaigns = await WhatsAppCampaign.find({ restaurant: restaurant._id })
      .populate('template', 'name type language')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error('Errore nel recupero delle campagne:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il recupero delle campagne',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene una singola campagna WhatsApp
 * @route   GET /api/campaign/:id
 * @access  Private
 */
const getCampaignById = async (req, res) => {
  try {
    const campaignId = req.params.id;

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la campagna
    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      restaurant: restaurant._id
    }).populate('template', 'name type language');

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
      message: 'Errore durante il recupero della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Aggiorna una campagna WhatsApp
 * @route   PUT /api/campaign/:id
 * @access  Private
 */
const updateCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const updateData = req.body;

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova e aggiorna la campagna
    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      restaurant: restaurant._id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }

    // Impedisci la modifica di campagne già in corso
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Non è possibile modificare una campagna già avviata o completata'
      });
    }

    // Aggiorna i campi
    Object.keys(updateData).forEach(key => {
      // Previeni l'aggiornamento di campi sensibili
      if (!['_id', 'restaurant', 'createdAt', 'statistics'].includes(key)) {
        campaign[key] = updateData[key];
      }
    });

    await campaign.save();

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'aggiornamento della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Cancella una campagna WhatsApp
 * @route   DELETE /api/campaign/:id
 * @access  Private
 */
const deleteCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la campagna
    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      restaurant: restaurant._id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }

    // Impedisci l'eliminazione di campagne già in corso
    if (campaign.status === 'sending') {
      return res.status(400).json({
        success: false,
        message: 'Non è possibile eliminare una campagna in fase di invio'
      });
    }

    // Se la campagna è programmata e ha un ID Twilio, cancella anche su Twilio
    if (campaign.status === 'scheduled' && campaign.twilioScheduledMessageId) {
      try {
        await twilioService.cancelScheduledMessage(campaign.twilioScheduledMessageId);
      } catch (twilioError) {
        console.error('Errore nella cancellazione del messaggio programmato su Twilio:', twilioError);
        // Procedi comunque con l'eliminazione della campagna
      }
    }

    await campaign.remove();

    res.status(200).json({
      success: true,
      message: 'Campagna eliminata con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'eliminazione della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Annulla una campagna programmata
 * @route   PUT /api/campaign/:id/cancel
 * @access  Private
 */
const cancelCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la campagna
    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      restaurant: restaurant._id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }

    // Verifica se la campagna può essere annullata
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Solo le campagne in stato di bozza o programmate possono essere annullate'
      });
    }

    // Se la campagna è programmata e ha un ID Twilio, cancella anche su Twilio
    if (campaign.twilioScheduledMessageId) {
      try {
        await twilioService.cancelScheduledMessage(campaign.twilioScheduledMessageId);
      } catch (twilioError) {
        console.error('Errore nella cancellazione del messaggio programmato su Twilio:', twilioError);
        // Procedi comunque con l'annullamento della campagna
      }
    }

    // Aggiorna lo stato della campagna
    campaign.status = 'cancelled';
    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campagna annullata con successo',
      data: campaign
    });
  } catch (error) {
    console.error('Errore nell\'annullamento della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'annullamento della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Genera il contenuto di una campagna WhatsApp con AI
 * @route   POST /api/campaign/generate-content
 * @access  Private
 */
const generateCampaignContent = async (req, res) => {
  try {
    const {
      campaignType,
      language = "en",
      campaignObjective,
      modelId = "claude-3-7-sonnet-20250219",
      restaurantId
    } = req.body;

    // Validazione degli input
    if (!campaignType || !campaignObjective) {
      return res.status(400).json({
        success: false,
        message: 'Tipo di campagna e obiettivo sono obbligatori'
      });
    }

    // Trova il ristorante
    const restaurant = await Restaurant.findById(restaurantId || req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Ottieni dati del ristorante per migliorare il messaggio
    const restaurantName = restaurant.name;
    const cuisineTypes = restaurant.cuisineTypes || [];
    
    // Mappa i tipi di campagna per il prompt
    const campaignTypeMap = {
      promo: {
        en: {
          description: "Promotional offer or discount",
          ctaExamples: [
            { text: "Order Now", type: "url" },
            { text: "Get Discount", type: "url" },
            { text: "Call Now", type: "phone" }
          ]
        },
        it: {
          description: "Offerta promozionale o sconto",
          ctaExamples: [
            { text: "Ordina Ora", type: "url" },
            { text: "Ottieni Sconto", type: "url" },
            { text: "Chiama Ora", type: "phone" }
          ]
        }
      },
      event: {
        en: {
          description: "Event invitation",
          ctaExamples: [
            { text: "RSVP", type: "url" },
            { text: "Reserve a Spot", type: "url" },
            { text: "Call to Book", type: "phone" }
          ]
        },
        it: {
          description: "Invito a un evento",
          ctaExamples: [
            { text: "Conferma Partecipazione", type: "url" },
            { text: "Prenota un Posto", type: "url" },
            { text: "Chiama per Prenotare", type: "phone" }
          ]
        }
      },
      update: {
        en: {
          description: "Menu update or restaurant news",
          ctaExamples: [
            { text: "View Menu", type: "url" },
            { text: "Learn More", type: "url" },
            { text: "Call for Info", type: "phone" }
          ]
        },
        it: {
          description: "Aggiornamento menu o novità del ristorante",
          ctaExamples: [
            { text: "Vedi Menu", type: "url" },
            { text: "Scopri di Più", type: "url" },
            { text: "Chiama per Informazioni", type: "phone" }
          ]
        }
      },
      feedback: {
        en: {
          description: "Request for customer feedback or reviews",
          ctaExamples: [
            { text: "Leave a Review", type: "url" },
            { text: "Take Survey", type: "url" },
            { text: "Call Us", type: "phone" }
          ]
        },
        it: {
          description: "Richiesta di feedback o recensioni dai clienti",
          ctaExamples: [
            { text: "Lascia una Recensione", type: "url" },
            { text: "Partecipa al Sondaggio", type: "url" },
            { text: "Chiamaci", type: "phone" }
          ]
        }
      }
    };

    // Ottieni i dettagli del tipo di campagna in base alla lingua
    const campaignDetails = campaignTypeMap[campaignType]?.[language] || campaignTypeMap[campaignType]?.en;
    if (!campaignDetails) {
      return res.status(400).json({
        success: false,
        message: 'Tipo di campagna non valido'
      });
    }

    // Crea prompt per Claude in base alla lingua
    let promptContent;
    if (language === 'it') {
      promptContent = `Genera il contenuto per una campagna marketing WhatsApp per un ristorante:

Ristorante: ${restaurantName}
Tipo di cucina: ${cuisineTypes.join(', ')}
Tipo di campagna: ${campaignDetails.description}
Obiettivo della campagna: ${campaignObjective}

Requisiti:
1. Crea un messaggio WhatsApp breve e accattivante (80-120 caratteri)
2. Includi {{1}} come segnaposto per il nome del cliente (utilizza ESATTAMENTE {{1}}, non altre varianti)
3. Aggiungi 1-2 emoji appropriate per il tipo di campagna
4. Il messaggio deve essere personalizzato in base all'obiettivo specificato
5. Scrivi in lingua italiana
6. NON includere URL diretti nel messaggio

Inoltre, suggerisci un'appropriata Call-to-Action (CTA) per un pulsante sotto il messaggio.
Il testo della CTA deve essere breve (2-3 parole) e convincente.
Specifica anche se la CTA dovrebbe collegarsi a un URL o a un numero di telefono.

Restituisci la risposta in formato JSON esattamente così:
{
  "messageText": "Il testo del messaggio con {{1}} per il nome",
  "cta": {
    "text": "Testo della CTA",
    "type": "url" o "phone"
  }
}

NON fornire spiegazioni o testo aggiuntivo. Restituisci solo l'oggetto JSON.`;
    } else {
      promptContent = `Generate content for a WhatsApp marketing campaign for a restaurant:

Restaurant: ${restaurantName}
Cuisine: ${cuisineTypes.join(', ')}
Campaign type: ${campaignDetails.description} 
Campaign objective: ${campaignObjective}

Requirements:
1. Create a short, engaging WhatsApp message (80-120 characters)
2. Include {{1}} as a placeholder for customer name (use EXACTLY {{1}}, not other variations)
3. Add 1-2 appropriate emojis for the campaign type
4. Tailor the message to the specified objective
5. Write in ${language === 'en' ? 'English' : language} language
6. DO NOT include direct URLs in the message

Also, suggest an appropriate Call-to-Action (CTA) for a button below the message.
The CTA text should be short (2-3 words) and compelling.
Also specify if the CTA should link to a URL or a phone number.

Return the response in JSON format exactly like this:
{
  "messageText": "The message text with {{1}} for name",
  "cta": {
    "text": "CTA text",
    "type": "url" or "phone"
  }
}

DO NOT provide explanations or additional text. Return only the JSON object.`;
    }

    console.log(`Generating campaign content for ${campaignType} in ${language}`);
    console.log(`Using Claude model: ${modelId}`);

    // Genera il contenuto usando Claude
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: promptContent
        }
      ]
    });

    // Estrai il messaggio dalla risposta
    const rawResponse = response.content[0].text;
    console.log("Claude raw response:", rawResponse);
    
    // Estrai oggetto JSON dalla risposta
    let contentData;
    try {
      // Trova l'oggetto JSON nella risposta utilizzando una regex
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        contentData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Formato JSON non trovato nella risposta');
      }
    } catch (error) {
      console.error('Errore nel parsing della risposta JSON:', error);
      return res.status(500).json({
        success: false,
        message: 'Errore nel processing della risposta AI',
        error: error.message
      });
    }

    // Verifica che contentData abbia la struttura corretta
    if (!contentData.messageText || !contentData.cta || !contentData.cta.text || !contentData.cta.type) {
      return res.status(500).json({
        success: false,
        message: 'Risposta AI mancante di campi necessari'
      });
    }

    // Verifica che contentData.cta.type sia "url" o "phone"
    if (contentData.cta.type !== 'url' && contentData.cta.type !== 'phone') {
      contentData.cta.type = 'url'; // Default a URL se non valido
    }

    return res.status(200).json({
      success: true,
      data: contentData
    });

  } catch (error) {
    console.error('Errore nella generazione del contenuto della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la generazione del contenuto',
      error: error.message
    });
  }
};

/**
 * @desc    Genera un prompt per immagini DALL-E basato sul tipo di campagna
 * @route   POST /api/campaign/generate-image-prompt
 * @access  Private
 */
const generateImagePrompt = async (req, res) => {
  try {
    const {
      campaignType,
      messageText,
      restaurantName = 'Restaurant',
      language = "en",
      modelId = "claude-3-7-sonnet-20250219",
      restaurantId
    } = req.body;

    // Validazione degli input
    if (!campaignType || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Tipo di campagna e testo del messaggio sono obbligatori'
      });
    }

    // Trova il ristorante (opzionale)
    let cuisineTypes = [];
    if (restaurantId) {
      const restaurant = await Restaurant.findById(restaurantId);
      if (restaurant) {
        cuisineTypes = restaurant.cuisineTypes || [];
      }
    }

    // Mappa i tipi di campagna per il prompt
    const campaignTypeMap = {
      promo: {
        en: "promotional offer or discount for a restaurant",
        it: "offerta promozionale o sconto per un ristorante"
      },
      event: {
        en: "restaurant event or special occasion",
        it: "evento o occasione speciale del ristorante"
      },
      update: {
        en: "menu update or new dishes announcement",
        it: "aggiornamento del menu o annuncio di nuovi piatti"
      },
      feedback: {
        en: "customer feedback or review request",
        it: "richiesta di feedback o recensione dai clienti"
      }
    };

    // Ottieni descrizione del tipo di campagna nella lingua appropriata
    const campaignDesc = campaignTypeMap[campaignType]?.[language] || campaignTypeMap[campaignType]?.en;
    if (!campaignDesc) {
      return res.status(400).json({
        success: false,
        message: 'Tipo di campagna non valido'
      });
    }

    // Crea prompt per Claude in base alla lingua
    let promptContent;
    if (language === 'it') {
      promptContent = `Crea un prompt dettagliato per generare un'immagine con DALL-E da utilizzare in una campagna WhatsApp per un ristorante.

CONTESTO:
- Nome ristorante: ${restaurantName}
- Tipo di cucina: ${cuisineTypes.join(', ') || 'Varia'}
- Tipo di campagna: ${campaignDesc}
- Testo del messaggio: "${messageText}"

ISTRUZIONI:
1. Crea un prompt di 2-3 frasi (massimo 300 caratteri) che descriva una SINGOLA immagine chiara e accattivante che accompagni il messaggio
2. L'immagine deve essere coerente con il tipo di campagna e il testo del messaggio
3. Descrivi una scena con cibo/ristorante realistica, evitando testo o persone in primo piano
4. Includi dettagli su illuminazione, composizione e stile per un risultato professionale
5. NON includere testo nell'immagine
6. NON includere tratti stilistici specifici come "digital art", "photo-realistic", "hyperrealistic", ecc.
7. Usa un linguaggio diretto, senza introduzioni come "un'immagine di" o "una foto di"

Fornisci SOLO il prompt, senza spiegazioni o commenti addizionali.`;
    } else {
      promptContent = `Create a detailed prompt for generating an image with DALL-E to be used in a WhatsApp campaign for a restaurant.

CONTEXT:
- Restaurant name: ${restaurantName}
- Cuisine type: ${cuisineTypes.join(', ') || 'Various'}
- Campaign type: ${campaignDesc}
- Message text: "${messageText}"

INSTRUCTIONS:
1. Create a 2-3 sentence prompt (maximum 300 characters) describing a SINGLE clear and engaging image to accompany the message
2. The image should align with the campaign type and message text
3. Describe a realistic food/restaurant scene, avoiding text or close-up people
4. Include details on lighting, composition, and style for a professional result
5. DO NOT include text in the image
6. DO NOT include specific style traits like "digital art", "photo-realistic", "hyperrealistic", etc.
7. Use direct language, without introductions like "an image of" or "a photo of"

Provide ONLY the prompt, with no additional explanations or comments.`;
    }

    console.log(`Generating image prompt for ${campaignType} campaign`);
    console.log(`Using Claude model: ${modelId}`);

    // Genera il prompt usando Claude
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: promptContent
        }
      ]
    });

    // Estrai il prompt dalla risposta
    const rawResponse = response.content[0].text;
    console.log("Claude raw response for image prompt:", rawResponse);
    
    // Elimina eventuali virgolette o spazi in eccesso
    const prompt = rawResponse.trim().replace(/^["']|["']$/g, "");
    
    // Verifica la lunghezza del prompt
    if (prompt.length > 1000) {
      console.warn(`Prompt generato troppo lungo: ${prompt.length} caratteri. Troncato a 1000.`);
      const truncatedPrompt = prompt.substring(0, 997) + "...";
      
      return res.status(200).json({
        success: true,
        data: {
          prompt: truncatedPrompt,
          originalPrompt: prompt,
          truncated: true
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        prompt: prompt
      }
    });

  } catch (error) {
    console.error('Errore nella generazione del prompt per immagine:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la generazione del prompt',
      error: error.message
    });
  }
};

/**
 * @desc    Genera un'immagine usando OpenAI DALL-E 3
 * @route   POST /api/campaign/generate-image
 * @access  Private
 */
const generateImage = async (req, res) => {
  console.log('📷 generateImage: Inizio funzione');
  try {
    const {
      prompt,
      messageText,
      campaignType,
      restaurantName = 'Restaurant',
      modelType = 'dall-e-3' // Cambio default a dall-e-3
    } = req.body;

    console.log('📷 generateImage: Parametri ricevuti:', JSON.stringify({
      promptLength: prompt?.length,
      campaignType,
      restaurantName,
      modelType
    }));

    // Validazione degli input
    if (!prompt) {
      console.log('📷 generateImage: Errore - Prompt mancante');
      return res.status(400).json({
        success: false,
        message: 'Prompt richiesto per la generazione dell\'immagine'
      });
    }

    // Verifica che l'API key di OpenAI sia configurata
    if (!process.env.OPENAI_API_KEY) {
      console.log('📷 generateImage: Errore - OpenAI API key non configurata');
      return res.status(500).json({
        success: false,
        message: 'OpenAI API key non configurata'
      });
    }

    console.log(`📷 generateImage: Prompt da utilizzare: ${prompt.substring(0, 100)}...`);
    console.log(`📷 generateImage: Modello: ${modelType}`);

    try {
      // Importa la libreria OpenAI
      console.log('📷 generateImage: Inizializzazione OpenAI client');
      const { OpenAI } = require('openai');
      
      // Inizializza il client OpenAI
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      console.log('📷 generateImage: Client OpenAI inizializzato correttamente');

      // Aggiungo prefisso per evitare riscritture del prompt
      const enhancedPrompt = `I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS: ${prompt}`;
      console.log(`📷 generateImage: Prompt migliorato creato (${enhancedPrompt.length} caratteri)`);

      // Prepara i parametri per la richiesta
      const requestParams = {
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard', // DALL-E 3 supporta 'standard' o 'hd'
        style: 'vivid' // DALL-E 3 supporta 'vivid' o 'natural'
      };
      console.log('📷 generateImage: Parametri richiesta:', JSON.stringify(requestParams, null, 2));

      // Genera l'immagine usando DALL-E 3
      console.log('📷 generateImage: Invio richiesta a OpenAI per generazione immagine...');
      console.time('openai_request_time');
      const response = await openai.images.generate(requestParams);
      console.timeEnd('openai_request_time');
      
      console.log('📷 generateImage: Risposta OpenAI ricevuta:', JSON.stringify({
        responseKeys: Object.keys(response),
        dataLength: response.data?.length,
        dataTypes: response.data ? response.data.map(item => Object.keys(item)) : []
      }));

      // Estrai l'URL dell'immagine
      const imageUrl = response.data && response.data[0] ? response.data[0].url : null;
      
      if (!imageUrl) {
        console.log('📷 generateImage: Errore - Nessuna URL immagine nella risposta');
        throw new Error('Nessuna immagine generata');
      }
      
      console.log('📷 generateImage: URL immagine generata con successo:', imageUrl.substring(0, 50) + '...');

      return res.status(200).json({
        success: true,
        data: {
          imageUrl,
          prompt
        }
      });
    } catch (openaiError) {
      console.error('📷 generateImage: OpenAI error:', openaiError);
      console.log('📷 generateImage: Dettagli errore OpenAI:', {
        name: openaiError.name,
        message: openaiError.message,
        stack: openaiError.stack?.split('\n').slice(0, 3),
        status: openaiError.status,
        headers: openaiError.headers,
        type: openaiError.type,
        code: openaiError.code
      });
      
      return res.status(500).json({
        success: false,
        message: 'Errore durante la generazione dell\'immagine con OpenAI',
        error: openaiError.message || String(openaiError)
      });
    }
  } catch (error) {
    console.error('📷 generateImage: Errore generale:', error);
    console.log('📷 generateImage: Dettagli errore generale:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
    
    res.status(500).json({
      success: false,
      message: 'Errore durante la generazione dell\'immagine',
      error: error.message || String(error)
    });
  } finally {
    console.log('📷 generateImage: Fine funzione');
  }
};

/**
 * Genera un token sicuro per l'unsubscribe
 * @param {String} contactId - ID del contatto
 * @param {String} phoneNumber - Numero di telefono del contatto
 * @returns {String} - Token crittografato
 */
const generateUnsubscribeToken = (contactId, phoneNumber) => {
  // Crea una stringa segreta basata sull'ID del contatto e sul numero di telefono
  const secret = `${contactId}-${phoneNumber}-${process.env.JWT_SECRET || 'menuchat-secret-key'}`;
  
  // Genera un hash SHA-256 come token
  return crypto
    .createHash('sha256')
    .update(secret)
    .digest('hex');
};

/**
 * Verifica la validità di un token unsubscribe
 * @param {String} contactId - ID del contatto
 * @param {String} phoneNumber - Numero di telefono del contatto
 * @param {String} token - Token da verificare
 * @returns {Boolean} - True se il token è valido
 */
const verifyUnsubscribeToken = (contactId, phoneNumber, token) => {
  const expectedToken = generateUnsubscribeToken(contactId, phoneNumber);
  return expectedToken === token;
};

/**
 * @desc    Cambia un contatto in opt-out tramite URL di unsubscribe
 * @route   GET /api/campaign/unsubscribe/:contactId/:token
 * @access  Public
 */
const handleUnsubscribe = async (req, res) => {
  try {
    console.log('Richiesta di unsubscribe ricevuta:', {
      contactId: req.params.contactId,
      token: req.params.token ? req.params.token.substring(0, 10) + '...' : 'vuoto'
    });
    
    const { contactId, token } = req.params;
    
    // Verifica che contactId sia un ObjectId valido
    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      console.log('ObjectId non valido:', contactId);
      
      return res.status(400).send(`
        <html>
          <head><title>Errore</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>Link non valido</h1>
            <p>Il link che hai seguito non è valido.</p>
          </body>
        </html>
      `.trim());
    }
    
    // Trova il contatto
    const contact = await WhatsAppContact.findById(contactId);
    
    if (!contact) {
      console.log('Contatto non trovato con ID:', contactId);
      
      return res.status(404).send(`
        <html>
          <head><title>Errore</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>Contatto non trovato</h1>
            <p>Non è stato possibile trovare il tuo contatto.</p>
          </body>
        </html>
      `.trim());
    }
    
    console.log('Contatto trovato:', {
      id: contact._id,
      phone: contact.phoneNumber,
      name: contact.name,
      lang: contact.language
    });
    
    // Verifica il token
    const isTokenValid = verifyUnsubscribeToken(contactId, contact.phoneNumber, token);
    console.log('Verifica token:', isTokenValid ? 'Valido' : 'Non valido');
    
    if (!isTokenValid) {
      return res.status(403).send(`
        <html>
          <head><title>Errore</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>Link non valido</h1>
            <p>Il link di disiscrizione non è valido o è scaduto.</p>
          </body>
        </html>
      `.trim());
    }
    
    // Aggiorna il contatto in opt-out
    await contact.optOut('manual_import');
    console.log('Contatto aggiornato a opt-out:', contact._id);
    
    // Determina la lingua del contatto per la risposta
    const lang = contact.language || 'it';
    console.log('Lingua risposta:', lang);
    
    // Prepara messaggi in varie lingue
    const messages = {
      it: {
        title: 'Disiscrizione completata',
        message: 'Non riceverai più messaggi promozionali da questa attività.',
        thanks: 'Grazie per la tua preferenza.'
      },
      en: {
        title: 'Unsubscribe Successful',
        message: 'You will no longer receive promotional messages from this business.',
        thanks: 'Thank you for your preference.'
      },
      es: {
        title: 'Cancelación de suscripción completada',
        message: 'Ya no recibirás mensajes promocionales de este negocio.',
        thanks: 'Gracias por tu preferencia.'
      },
      fr: {
        title: 'Désinscription terminée',
        message: 'Vous ne recevrez plus de messages promotionnels de cette entreprise.',
        thanks: 'Merci pour votre préférence.'
      },
      de: {
        title: 'Abmeldung abgeschlossen',
        message: 'Sie erhalten keine Werbenachrichten mehr von diesem Unternehmen.',
        thanks: 'Danke für Ihre Präferenz.'
      }
    };
    
    // Usa lingua italiana come fallback
    const responseText = messages[lang] || messages.it;
    
    // Crea una pagina HTML più semplice che dovrebbe funzionare in tutti i browser
    const htmlResponse = `<!DOCTYPE html>
<html>
  <head>
    <title>${responseText.title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        font-family: Arial, sans-serif;
        text-align: center;
        padding: 50px;
        background-color: #f7f7f7;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: white;
        padding: 30px;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      }
      h1 {
        color: #4CAF50;
        margin-bottom: 20px;
      }
      p {
        font-size: 18px;
        line-height: 1.6;
        margin-bottom: 15px;
      }
      .emoji {
        font-size: 50px;
        margin: 20px 0;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="emoji">✅</div>
      <h1>${responseText.title}</h1>
      <p>${responseText.message}</p>
      <p>${responseText.thanks}</p>
    </div>
  </body>
</html>`;
    
    // Imposta esplicitamente l'header Content-Type per HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(htmlResponse);
    
    console.log('Risposta di unsubscribe inviata con successo');
  } catch (error) {
    console.error('Errore nella gestione dell\'unsubscribe:', error);
    
    // Pagina di errore generica più semplice
    const errorHtml = `<!DOCTYPE html>
<html>
  <head><title>Errore</title></head>
  <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
    <h1>Si è verificato un errore</h1>
    <p>Non è stato possibile completare la tua richiesta. Riprova più tardi.</p>
    <p>Dettagli errore: ${error.message || 'Errore sconosciuto'}</p>
  </body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(500).send(errorHtml);
  }
};

/**
 * @desc    Invia un template di campagna a Twilio per approvazione
 * @route   POST /api/campaign/:id/submit-template
 * @access  Private
 */
const submitCampaignTemplate = async (req, res) => {
  try {
    const campaignId = req.params.id;
    console.log(`Sottomissione template per campagna ${campaignId}`);

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la campagna
    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      restaurant: restaurant._id
    }).populate('template');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }

    // Verifica che il template sia valido
    if (!campaign.template) {
      return res.status(400).json({
        success: false,
        message: 'La campagna non ha un template associato'
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

    try {
      // Ottieni le credenziali Twilio dal BotConfiguration o dalle variabili d'ambiente
      const botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });
      
      if (!botConfig) {
        return res.status(404).json({
          success: false,
          message: 'Configurazione bot non trovata'
        });
      }

      // Utilizza le credenziali personalizzate se disponibili, altrimenti usa le variabili d'ambiente
      const accountSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const authToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;

      if (!accountSid || !authToken) {
        return res.status(400).json({
          success: false,
          message: 'Credenziali Twilio non configurate'
        });
      }

      const axios = require('axios');
      const contentApiBaseUrl = 'https://content.twilio.com/v1/Content';
      
      // Primo passo: creare un template su Twilio se non esiste già
      console.log('Creazione/verifica template su Twilio...');
      
      // Genera un nome univoco per il template (per quando lo creeremo su Twilio)
      const sanitizedRestaurantName = restaurant.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
      const sanitizedCampaignName = campaign.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
      const templateName = `${sanitizedRestaurantName}_${sanitizedCampaignName}_${Date.now()}`.substring(0, 64);
      console.log(`Nome template: ${templateName}`);
      
      // Prepara i dati per creare un template Twilio
      const twilioTemplateData = {
        friendly_name: templateName,
        language: campaign.templateParameters?.language || campaign.template.language || 'it',
        variables: {},
        types: {}
      };
      
      console.log('Lingua del template:', twilioTemplateData.language);
      
      // Aggiungi variabili al template
      if (campaign.template.variables && campaign.template.variables.length > 0) {
        campaign.template.variables.forEach(variable => {
          twilioTemplateData.variables[variable.index] = variable.name || 'customerName';
        });
      } else {
        // Default variable
        twilioTemplateData.variables = { "1": "customerName" };
      }
      
      // Utilizza i dati effettivi della campagna se disponibili
      if (campaign.templateParameters && Object.keys(campaign.templateParameters).length > 0) {
        console.log('Utilizzando parametri template personalizzati:', JSON.stringify(campaign.templateParameters));
        
        // Prepara gli eventuali bottoni di azione
        const actions = [];
        
        // Aggiungi il bottone primario se specificato nei parametri
        if (campaign.templateParameters.cta && campaign.templateParameters.ctaValue) {
          if (campaign.templateParameters.ctaType === 'phone') {
            actions.push({
              type: "PHONE_NUMBER",
              title: campaign.templateParameters.cta,
              phone: campaign.templateParameters.ctaValue
            });
          } else {
            actions.push({
              type: "URL",
              title: campaign.templateParameters.cta,
              url: campaign.templateParameters.ctaValue
            });
          }
        }
        
        // Aggiungi sempre il bottone di unsubscribe come URL
        if (campaign.templateParameters.unsubscribe !== false) {
          // Prepara l'URL base per unsubscribe
          const backendUrl = 'https://menuchat-backend.onrender.com';
          
          // Crea titoli per pulsante unsubscribe in varie lingue
          const unsubscribeText = {
            it: "Disiscriviti",
            en: "Unsubscribe",
            es: "Cancelar suscripción",
            fr: "Se désinscrire",
            de: "Abmelden"
          };
          
          // Seleziona testo in base alla lingua del template
          const buttonText = unsubscribeText[campaign.templateParameters.language || campaign.template.language || 'it'] || "Unsubscribe";
          
          // Utilizziamo la variabile {{2}} che verrà sostituita
          // dal servizio twilioService.js con il path effettivo di unsubscribe
          actions.push({
            type: "URL",
            title: buttonText,
            url: `${backendUrl}/{{2}}`
          });
          
          // Definiamo la variabile 2 come segnaposto per il path di unsubscribe
          twilioTemplateData.variables["2"] = "api/campaign/unsubscribe/ID/TOKEN";
          
          // Passiamo anche l'ID della campagna nei parametri
          // per registrare correttamente il contatto
          if (!campaign.templateParameters.campaignId) {
            campaign.templateParameters.campaignId = campaign._id.toString();
          }
        }
        
        // Costruisci il template in base al tipo e ai parametri della campagna
        if (campaign.templateParameters.useImage && campaign.templateParameters.imageUrl) {
          // Per template con immagine, usiamo twilio/card che supporta media e bottoni
          twilioTemplateData.types['twilio/card'] = {
            title: campaign.templateParameters.message || campaign.template.components.body.text,
            media: [ensureMediaCompatibility(campaign.templateParameters.imageUrl)],
            actions: actions
          };
        } else if (actions.length > 0) {
          // Per template con CTA ma senza immagine, usiamo twilio/call-to-action
          twilioTemplateData.types['twilio/call-to-action'] = {
            body: campaign.templateParameters.message || campaign.template.components.body.text,
            actions: actions
          };
        } else if (campaign.templateParameters.useImage && campaign.templateParameters.imageUrl) {
          // Se è un template di tipo MEDIA senza CTA
          twilioTemplateData.types['twilio/media'] = {
            body: campaign.templateParameters.message || campaign.template.components.body.text,
            media: [ensureMediaCompatibility(campaign.templateParameters.imageUrl)]
          };
        } else {
          // Fallback a text template
          twilioTemplateData.types['twilio/text'] = {
            body: campaign.templateParameters.message || campaign.template.components.body.text
          };
        }
        
        // Tipo sempre impostato come marketing, come richiesto
        if (campaign.templateParameters.type === 'marketing' || true) {
          twilioTemplateData.marketingType = "marketing";
        }
      } else {
        // Fallback al comportamento originale se non ci sono parametri personalizzati
      if (campaign.template.type === 'MEDIA' && campaign.template.components.header?.example) {
        twilioTemplateData.types['twilio/media'] = {
          body: campaign.template.components.body.text,
          media: [campaign.template.components.header.example]
        };
      } else if (campaign.template.type === 'CALL_TO_ACTION' && campaign.template.components.buttons?.length > 0) {
        const actions = campaign.template.components.buttons.map(button => {
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
                phone: button.phone_number
            };
          }
          return null;
        }).filter(Boolean);
        
        twilioTemplateData.types['twilio/call-to-action'] = {
          body: campaign.template.components.body.text,
          actions
        };
      } else {
        // Fallback a text template
        twilioTemplateData.types['twilio/text'] = {
          body: campaign.template.components.body.text
        };
        }
      }
      
      console.log('Dati template Twilio:', JSON.stringify(twilioTemplateData, null, 2));
      
      // Crea il template su Twilio
      const contentResponse = await axios({
        method: 'post',
        url: contentApiBaseUrl,
        auth: {
          username: accountSid,
          password: authToken
        },
        data: twilioTemplateData
      });
      
      // Salva l'ID Twilio nel template
      const twilioTemplateId = contentResponse.data.sid;
      campaign.template.twilioTemplateId = twilioTemplateId;
      await campaign.template.save();
      
      console.log(`Template creato su Twilio con ID: ${twilioTemplateId}`);
      
      // Secondo passo: richiedi l'approvazione per WhatsApp
      console.log(`Richiedo approvazione WhatsApp per il template ${twilioTemplateId}...`);
      
      const approvalResponse = await axios({
        method: 'post',
        url: `${contentApiBaseUrl}/${twilioTemplateId}/ApprovalRequests/whatsapp`,
        auth: {
          username: accountSid,
          password: authToken
        },
        data: {
          name: templateName,
          category: category
        }
      });
      
      // Aggiorna lo stato del template
      campaign.template.status = 'PENDING';
      campaign.template.lastSubmissionDate = new Date();
      campaign.template.whatsappCategory = category;
      await campaign.template.save();
      
      console.log(`Richiesta di approvazione inviata con successo per ${templateName}`);

      return res.status(200).json({
        success: true,
        data: {
          templateId: campaign.template._id,
          twilioTemplateId,
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
 * @desc    Schedula l'invio di una campagna per una data futura
 * @route   POST /api/campaign/:id/schedule
 * @access  Private
 */
const scheduleCampaignSending = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { scheduledDate } = req.body;
    console.log(`Schedulazione invio campagna ${campaignId} per ${scheduledDate}`);

    // Valida la data programmata
    if (!scheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'Data di invio programmata non fornita'
      });
    }

    // Converti in oggetto Date
    const scheduledTime = new Date(scheduledDate);
    
    // Verifica che la data sia valida
    if (isNaN(scheduledTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Formato data non valido'
      });
    }

    // Verifica che la data sia nel futuro (almeno 5 minuti dopo)
    const minScheduleTime = new Date(Date.now() + 5 * 60 * 1000);
    if (scheduledTime < minScheduleTime) {
      return res.status(400).json({
        success: false,
        message: 'La data di invio deve essere almeno 5 minuti nel futuro'
      });
    }

    // Verifica che la data non sia troppo lontana (max 35 giorni)
    const maxScheduleTime = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
    if (scheduledTime > maxScheduleTime) {
      return res.status(400).json({
        success: false,
        message: 'La data di invio non può essere oltre 35 giorni nel futuro'
      });
    }

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la campagna
    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      restaurant: restaurant._id
    }).populate('template').populate('targetAudience.manualContacts');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }

    // Verifica che il template sia valido e che abbia un ID Twilio
    if (!campaign.template) {
      return res.status(400).json({
        success: false,
        message: 'La campagna non ha un template associato'
      });
    }

    // Verifica che ci siano contatti target
    if (!campaign.targetAudience.manualContacts || campaign.targetAudience.manualContacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Non ci sono contatti selezionati per questa campagna'
      });
    }

    // Aggiorna la data programmata della campagna
    campaign.scheduledDate = scheduledTime;
    campaign.status = 'scheduled';
    await campaign.save();

    // Verifico se il template ha un ID Twilio, altrimenti non posso programmare l'invio
    if (!campaign.template.twilioTemplateId) {
      console.warn(`Template senza ID Twilio. La campagna è stata schedulata nel database ma non su Twilio.`);
      return res.status(200).json({
        success: true,
        data: {
          campaignId: campaign._id,
          scheduledDate: scheduledTime,
          targetContacts: campaign.targetAudience.totalContacts,
          status: 'scheduled',
          warning: 'Template senza ID Twilio. Sottomettere il template a Twilio prima dell\'invio.'
        }
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

    // Programma l'invio per il primo contatto (esempio)
    // In un'applicazione reale, dovremmo usare un job queue per programmare tutti i contatti
    const firstContact = campaign.targetAudience.manualContacts[0];
    
    if (firstContact) {
      console.log(`Programmazione invio a ${firstContact.phoneNumber} tramite template ${campaign.template.twilioTemplateId}`);
      const result = await twilioService.scheduleTemplateMessage(
        firstContact.phoneNumber,
        campaign.template.twilioTemplateId,
        campaign.templateParameters || {}, // Variabili del template
        restaurant._id,
        scheduledTime
      );
      
      if (result.success) {
        // Salva l'ID del messaggio programmato
        campaign.twilioScheduledMessageId = result.messageId;
        await campaign.save();
        
        return res.status(200).json({
          success: true,
          data: {
            campaignId: campaign._id,
            scheduledDate: scheduledTime,
            targetContacts: campaign.targetAudience.totalContacts,
            twilioMessageId: result.messageId,
            status: 'scheduled'
          }
        });
      } else {
        console.error('Errore nella programmazione del messaggio:', result.error);
        return res.status(500).json({
          success: false,
          message: 'Errore durante la programmazione del messaggio con Twilio',
          error: result.error
        });
      }
    } else {
      return res.status(200).json({
        success: true,
        data: {
          campaignId: campaign._id,
          scheduledDate: scheduledTime,
          targetContacts: 0,
          warning: 'Nessun contatto trovato per l\'invio programmato'
        }
      });
    }
  } catch (error) {
    console.error('Errore nella programmazione della campagna:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la programmazione della campagna',
      error: error.message
    });
  }
};

/**
 * @desc    Controllo dello stato di approvazione di un template
 * @route   GET /api/campaign/:id/template-status
 * @access  Private
 */
const checkTemplateStatus = async (req, res) => {
  try {
    const campaignId = req.params.id;

    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova la campagna
    const campaign = await WhatsAppCampaign.findOne({
      _id: campaignId,
      restaurant: restaurant._id
    }).populate('template');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campagna non trovata'
      });
    }

    // Verifica che il template sia valido
    if (!campaign.template || !campaign.template.twilioTemplateId) {
      return res.status(400).json({
        success: false,
        message: 'La campagna non ha un template Twilio associato'
      });
    }

    // Ottieni le credenziali Twilio dal BotConfiguration o dalle variabili d'ambiente
    const botConfig = await BotConfiguration.findOne({ restaurant: restaurant._id });
    
    if (!botConfig) {
      return res.status(404).json({
        success: false,
        message: 'Configurazione bot non trovata'
      });
    }

    // Utilizza le credenziali personalizzate se disponibili, altrimenti usa le variabili d'ambiente
    const accountSid = botConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = botConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return res.status(400).json({
        success: false,
        message: 'Credenziali Twilio non configurate'
      });
    }

    // Controlla lo stato del template in Twilio
    const axios = require('axios');
    const contentApiBaseUrl = 'https://content.twilio.com/v1/Content';
    
    try {
      const response = await axios({
        method: 'get',
        url: `${contentApiBaseUrl}/${campaign.template.twilioTemplateId}/ApprovalRequests`,
        auth: {
          username: accountSid,
          password: authToken
        }
      });

      const approvalStatus = response.data.whatsapp?.status || 'unknown';
      const rejectionReason = response.data.whatsapp?.rejection_reason || '';
      
      // Aggiorna lo stato del template nel database
      if (approvalStatus === 'approved' && campaign.template.status !== 'APPROVED') {
        campaign.template.status = 'APPROVED';
        await campaign.template.save();
      } else if (approvalStatus === 'rejected' && campaign.template.status !== 'REJECTED') {
        campaign.template.status = 'REJECTED';
        campaign.template.rejectionReason = rejectionReason;
        await campaign.template.save();
      }

      return res.status(200).json({
        success: true,
        data: {
          templateId: campaign.template._id,
          twilioTemplateId: campaign.template.twilioTemplateId,
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
  } catch (error) {
    console.error('Errore generale nel controllo dello stato del template:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il controllo dello stato del template',
      error: error.message
    });
  }
};

/**
 * @desc    Test della funzionalità di unsubscribe
 * @route   GET /api/campaign/test-unsubscribe
 * @access  Private
 */
const testUnsubscribe = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }

    // Trova un contatto del ristorante
    const contact = await WhatsAppContact.findOne({ restaurant: restaurant._id });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Nessun contatto trovato per questo ristorante'
      });
    }

    // Genera un token per questo contatto
    const contactId = contact._id.toString();
    const token = generateUnsubscribeToken(contactId, contact.phoneNumber);

    // Costruisci l'URL di unsubscribe per la verifica
    const backendUrl = 'https://menuchat-backend.onrender.com';
    const unsubscribeUrl = `${backendUrl}/api/campaign/unsubscribe/${contactId}/${token}`;
    
    // Costruisci l'URL con il segnaposto Twilio per test
    const twilioPlaceholderUrl = `${backendUrl}/{{2}}`;
    
    // Variabile Twilio che dovrebbe essere sostituita
    const twilioVariable = `api/campaign/unsubscribe/${contactId}/${token}`;

    res.status(200).json({
      success: true,
      data: {
        contactId,
        contactName: contact.name,
        contactPhone: contact.phoneNumber,
        token,
        unsubscribeUrl,
        twilioInfo: {
          placeholderUrl: twilioPlaceholderUrl,
          variableValue: twilioVariable,
          description: "Questo è come appare il segnaposto nell'URL e come dovrebbe essere sostituito"
        }
      }
    });
  } catch (error) {
    console.error('Errore nel test di unsubscribe:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il test di unsubscribe',
      error: error.message
    });
  }
};

/**
 * Verifica e modifica un URL di media per garantire la compatibilità con Twilio/WhatsApp
 * @param {string} mediaUrl - URL originale del media
 * @returns {string} - URL compatibile con Twilio/WhatsApp
 */
const ensureMediaCompatibility = (mediaUrl) => {
  if (!mediaUrl) return mediaUrl;
  
  // Verifica se è un URL Cloudinary
  const isCloudinaryUrl = mediaUrl.includes('cloudinary.com');
  
  // Verifica se è un video
  const isVideo = mediaUrl.includes('/video/') || 
                  mediaUrl.includes('.mp4') || 
                  mediaUrl.includes('.mov') || 
                  mediaUrl.includes('.avi') ||
                  mediaUrl.includes('.webm');
  
  // Se non è Cloudinary o non è un video, restituisci l'URL originale
  if (!isCloudinaryUrl || !isVideo) {
    return mediaUrl;
  }
  
  // Per i video Cloudinary, controlla se l'URL contiene _whatsapp_optimized
  if (mediaUrl.includes('_whatsapp_optimized')) {
    // È già un URL ottimizzato senza trasformazioni, usalo così com'è
    console.log(`L'URL video è già ottimizzato per WhatsApp: ${mediaUrl}`);
    return mediaUrl;
  }
  
  // L'URL contiene trasformazioni che possono causare problemi con Twilio?
  const hasTransformations = mediaUrl.match(/\/upload\/([^\/]+)\//);
  
  if (hasTransformations) {
    console.log(`ATTENZIONE: L'URL video contiene trasformazioni nell'URL che potrebbero causare problemi con Twilio/WhatsApp: ${mediaUrl}`);
    console.log(`Considera di caricare il video senza trasformazioni nell'URL.`);
    
    // Non tentiamo di modificare l'URL poiché il problema è che Cloudinary serve 
    // Content-Type: video/mp4; codecs=avc1 quando ci sono trasformazioni nell'URL
    return mediaUrl;
  }
  
  return mediaUrl;
};

module.exports = {
  getContacts,
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  cancelCampaign,
  generateCampaignContent,
  generateImagePrompt,
  generateImage,
  submitCampaignTemplate,
  scheduleCampaignSending,
  checkTemplateStatus,
  handleUnsubscribe,
  testUnsubscribe
}; 