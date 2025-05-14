const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const WhatsAppContact = require('../models/WhatsAppContact');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');
const twilioService = require('../services/twilioService');
const Anthropic = require('@anthropic-ai/sdk');

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

    // Verifica che il template esista
    const template = await WhatsAppTemplate.findById(templateId);
    
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

module.exports = {
  getContacts,
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  cancelCampaign,
  generateCampaignContent
}; 