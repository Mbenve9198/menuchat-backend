const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const WhatsAppContact = require('../models/WhatsAppContact');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');
const twilioService = require('../services/twilioService');

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

module.exports = {
  getContacts,
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  cancelCampaign
}; 