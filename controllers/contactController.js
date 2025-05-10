const Contact = require('../models/Contact');
const Restaurant = require('../models/Restaurant');
const CustomerInteraction = require('../models/CustomerInteraction');

/**
 * @desc    Ottiene tutti i contatti per il ristorante dell'utente
 * @route   GET /api/contacts
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
    
    // Opzioni di paginazione
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    
    // Costruisci il filtro di query
    const queryFilter = { restaurant: restaurant._id };
    
    // Filtra per opt-in/opt-out se specificato
    if (req.query.optIn === 'true') queryFilter.optIn = true;
    if (req.query.optIn === 'false') queryFilter.optIn = false;
    if (req.query.optOut === 'true') queryFilter.optOut = true;
    if (req.query.optOut === 'false') queryFilter.optOut = false;
    
    // Filtra per review link se specificato
    if (req.query.reviewLinkSent === 'true') queryFilter.reviewLinkSent = true;
    if (req.query.reviewLinkSent === 'false') queryFilter.reviewLinkSent = false;
    
    // Filtra per query di ricerca (nome o numero di telefono)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      queryFilter.$or = [
        { name: searchRegex },
        { phoneNumber: searchRegex }
      ];
    }
    
    // Esegui il conteggio totale per la paginazione
    const total = await Contact.countDocuments(queryFilter);
    
    // Ottieni i contatti con paginazione e ordinamento
    const sortField = req.query.sortBy || 'lastInteractionAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sortOptions = {};
    sortOptions[sortField] = sortOrder;
    
    const contacts = await Contact.find(queryFilter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);
    
    // Prepara la risposta con informazioni di paginazione
    res.status(200).json({
      success: true,
      data: {
        contacts,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei contatti:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero dei contatti',
      error: error.message
    });
  }
};

/**
 * @desc    Ottiene un singolo contatto per ID
 * @route   GET /api/contacts/:id
 * @access  Private
 */
const getContactById = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova il contatto per ID e ristorante
    const contact = await Contact.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contatto non trovato'
      });
    }
    
    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Errore nel recupero del contatto:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero del contatto',
      error: error.message
    });
  }
};

/**
 * @desc    Crea un nuovo contatto
 * @route   POST /api/contacts
 * @access  Private
 */
const createContact = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    const {
      name,
      phoneNumber,
      optIn = true,
      language = 'it',
      notes = '',
      tags = []
    } = req.body;
    
    // Validazione
    if (!name || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Nome e numero di telefono sono obbligatori'
      });
    }
    
    // Controlla se il contatto esiste già
    const phoneHash = Contact.hashPhoneNumber(phoneNumber);
    const existingContact = await Contact.findOne({
      restaurant: restaurant._id,
      phoneHash
    });
    
    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: 'Un contatto con questo numero di telefono esiste già'
      });
    }
    
    // Crea il nuovo contatto
    const contact = await Contact.create({
      restaurant: restaurant._id,
      name,
      phoneNumber,
      phoneHash,
      optIn,
      optInDate: optIn ? new Date() : null,
      language,
      notes,
      tags
    });
    
    res.status(201).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Errore nella creazione del contatto:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella creazione del contatto',
      error: error.message
    });
  }
};

/**
 * @desc    Aggiorna un contatto esistente
 * @route   PUT /api/contacts/:id
 * @access  Private
 */
const updateContact = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Verifica l'esistenza del contatto
    const contact = await Contact.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contatto non trovato'
      });
    }
    
    // Campi aggiornabili
    const {
      name,
      phoneNumber,
      optIn,
      optOut,
      notes,
      tags,
      language
    } = req.body;
    
    // Aggiorna il contatto
    if (name) contact.name = name;
    
    // Se il numero di telefono è cambiato, aggiorna anche l'hash
    if (phoneNumber && phoneNumber !== contact.phoneNumber) {
      contact.phoneNumber = phoneNumber;
      contact.phoneHash = Contact.hashPhoneNumber(phoneNumber);
    }
    
    // Aggiorna lo stato di opt-in/out se specificato
    if (optIn !== undefined) {
      // Se lo stato è cambiato, aggiorna anche la data
      if (optIn !== contact.optIn) {
        contact.optIn = optIn;
        contact.optInDate = optIn ? new Date() : null;
        
        // Se c'è un opt-in, rimuovi l'opt-out
        if (optIn) {
          contact.optOut = false;
          contact.optOutDate = null;
        }
      }
    }
    
    if (optOut !== undefined) {
      // Se lo stato è cambiato, aggiorna anche la data
      if (optOut !== contact.optOut) {
        contact.optOut = optOut;
        contact.optOutDate = optOut ? new Date() : null;
        
        // Se c'è un opt-out, rimuovi l'opt-in
        if (optOut) {
          contact.optIn = false;
          contact.optInDate = null;
        }
      }
    }
    
    if (notes !== undefined) contact.notes = notes;
    if (tags !== undefined) contact.tags = tags;
    if (language) contact.language = language;
    
    // Salva le modifiche
    await contact.save();
    
    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del contatto:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'aggiornamento del contatto',
      error: error.message
    });
  }
};

/**
 * @desc    Elimina un contatto
 * @route   DELETE /api/contacts/:id
 * @access  Private
 */
const deleteContact = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova e elimina il contatto
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      restaurant: restaurant._id
    });
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contatto non trovato'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione del contatto:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'eliminazione del contatto',
      error: error.message
    });
  }
};

/**
 * @desc    Aggiorna lo stato opt-in/out di un contatto
 * @route   PATCH /api/contacts/:id/opt-status
 * @access  Private
 */
const updateOptStatus = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova il contatto
    const contact = await Contact.findOne({
      _id: req.params.id,
      restaurant: restaurant._id
    });
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contatto non trovato'
      });
    }
    
    const { optIn, optOut } = req.body;
    
    if (optIn !== undefined) {
      contact.optIn = optIn;
      contact.optInDate = optIn ? new Date() : null;
      
      // Se c'è un opt-in, rimuovi l'opt-out
      if (optIn) {
        contact.optOut = false;
        contact.optOutDate = null;
      }
    }
    
    if (optOut !== undefined) {
      contact.optOut = optOut;
      contact.optOutDate = optOut ? new Date() : null;
      
      // Se c'è un opt-out, rimuovi l'opt-in
      if (optOut) {
        contact.optIn = false;
        contact.optInDate = null;
      }
    }
    
    await contact.save();
    
    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento dello stato opt:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'aggiornamento dello stato opt',
      error: error.message
    });
  }
};

/**
 * @desc    Importa contatti dalle interazioni esistenti
 * @route   POST /api/contacts/import-from-interactions
 * @access  Private
 */
const importFromInteractions = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Trova tutte le interazioni per questo ristorante
    const interactions = await CustomerInteraction.find({
      restaurant: restaurant._id
    });
    
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const interaction of interactions) {
      if (!interaction.customerPhoneNumber) {
        skippedCount++;
        continue;
      }
      
      // Crea un hash del numero di telefono
      const phoneHash = Contact.hashPhoneNumber(interaction.customerPhoneNumber);
      
      // Controlla se il contatto esiste già
      const existingContact = await Contact.findOne({
        restaurant: restaurant._id,
        phoneHash
      });
      
      if (existingContact) {
        // Aggiorna la data dell'ultima interazione se necessario
        if (interaction.lastActive && 
            new Date(interaction.lastActive) > new Date(existingContact.lastInteractionAt)) {
          existingContact.lastInteractionAt = interaction.lastActive;
          await existingContact.save();
        }
        skippedCount++;
        continue;
      }
      
      // Crea un nuovo contatto
      const newContact = new Contact({
        restaurant: restaurant._id,
        name: interaction.customerName || 'Cliente',
        phoneNumber: interaction.customerPhoneNumber,
        phoneHash,
        // Imposta opt-in a true per default
        optIn: true,
        optInDate: new Date(),
        // Se c'è una recensione completata, tracciamo questo
        reviewLinkSent: interaction.reviewData && interaction.reviewData.requested ? true : false,
        lastReviewLinkSentAt: interaction.reviewData && interaction.reviewData.requestedAt ? 
          interaction.reviewData.requestedAt : null,
        lastInteractionAt: interaction.lastActive || interaction.createdAt,
        createdAt: new Date()
      });
      
      // Aggiungi l'evento di interazione iniziale
      newContact.interactionDates.push({
        date: interaction.firstInteractionAt || interaction.createdAt
      });
      
      // Se ci sono eventi nella interazione, aggiungi date uniche
      if (interaction.events && interaction.events.length > 0) {
        const uniqueDates = new Set();
        uniqueDates.add(new Date(interaction.firstInteractionAt || interaction.createdAt).toDateString());
        
        interaction.events.forEach(event => {
          const eventDate = new Date(event.timestamp).toDateString();
          if (!uniqueDates.has(eventDate)) {
            uniqueDates.add(eventDate);
            newContact.interactionDates.push({
              date: new Date(event.timestamp)
            });
          }
        });
      }
      
      // Imposta il conteggio delle interazioni
      newContact.interactionCount = newContact.interactionDates.length;
      
      await newContact.save();
      importedCount++;
    }
    
    res.status(200).json({
      success: true,
      data: {
        importedCount,
        skippedCount,
        totalProcessed: importedCount + skippedCount
      }
    });
  } catch (error) {
    console.error('Errore nell\'importazione dei contatti:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'importazione dei contatti',
      error: error.message
    });
  }
};

/**
 * @desc    Esporta i contatti in formato CSV
 * @route   GET /api/contacts/export
 * @access  Private
 */
const exportContacts = async (req, res) => {
  try {
    // Trova il ristorante dell'utente
    const restaurant = await Restaurant.findOne({ user: req.user.id });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Ristorante non trovato'
      });
    }
    
    // Filtra per opt-in se specificato
    const filter = { restaurant: restaurant._id };
    if (req.query.optIn === 'true') filter.optIn = true;
    
    // Trova tutti i contatti
    const contacts = await Contact.find(filter);
    
    // Genera intestazioni CSV
    const csvHeader = [
      'Nome',
      'Numero di telefono',
      'Opt-in',
      'Data opt-in',
      'Opt-out',
      'Data opt-out',
      'Recensione inviata',
      'Data ultima recensione',
      'Numero interazioni',
      'Ultima interazione',
      'Data creazione',
      'Lingua',
      'Note',
      'Tag'
    ].join(',');
    
    // Genera righe CSV
    const csvRows = contacts.map(contact => {
      return [
        `"${contact.name.replace(/"/g, '""')}"`, // Gestione virgolette nel nome
        contact.phoneNumber,
        contact.optIn,
        contact.optInDate ? new Date(contact.optInDate).toISOString() : '',
        contact.optOut,
        contact.optOutDate ? new Date(contact.optOutDate).toISOString() : '',
        contact.reviewLinkSent,
        contact.lastReviewLinkSentAt ? new Date(contact.lastReviewLinkSentAt).toISOString() : '',
        contact.interactionCount,
        contact.lastInteractionAt ? new Date(contact.lastInteractionAt).toISOString() : '',
        contact.createdAt ? new Date(contact.createdAt).toISOString() : '',
        contact.language,
        `"${(contact.notes || '').replace(/"/g, '""')}"`, // Gestione virgolette nelle note
        `"${(contact.tags || []).join(', ')}"`
      ].join(',');
    });
    
    // Combine header and rows
    const csv = [csvHeader, ...csvRows].join('\n');
    
    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=contatti-${new Date().toISOString().split('T')[0]}.csv`);
    
    res.status(200).send(csv);
  } catch (error) {
    console.error('Errore nell\'esportazione dei contatti:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'esportazione dei contatti',
      error: error.message
    });
  }
};

module.exports = {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  updateOptStatus,
  importFromInteractions,
  exportContacts
}; 