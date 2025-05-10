const { Contact } = require('../models');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

/**
 * Lista tutti i contatti di un ristorante
 */
exports.getContactsByRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { search, sort, page = 1, limit = 50, optIn } = req.query;

    if (!restaurantId || !ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ success: false, message: 'ID ristorante non valido' });
    }

    // Costruisci il filtro di base
    const filter = { restaurant: new ObjectId(restaurantId) };
    
    // Aggiungi filtro per opt-in se specificato
    if (optIn !== undefined) {
      filter.optIn = optIn === 'true';
    }
    
    // Aggiungi filtro di ricerca se fornito
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Costruisci l'ordinamento
    let sortOptions = { lastContact: -1 }; // Default: contatti più recenti
    if (sort) {
      switch(sort) {
        case 'name':
          sortOptions = { name: 1 };
          break;
        case 'interactions':
          sortOptions = { totalInteractions: -1 };
          break;
        case 'uniqueDays':
          sortOptions = { uniqueDayInteractions: -1 };
          break;
        case 'oldest':
          sortOptions = { lastContact: 1 };
          break;
      }
    }
    
    // Esegui la query paginata
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const contacts = await Contact.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Conta il totale dei risultati per la paginazione
    const totalContacts = await Contact.countDocuments(filter);
    
    res.json({
      success: true,
      contacts: contacts.map(contact => ({
        _id: contact._id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        countryCode: contact.countryCode,
        optIn: contact.optIn,
        firstContact: contact.firstContact,
        lastContact: contact.lastContact,
        totalInteractions: contact.totalInteractions,
        uniqueDayInteractions: contact.uniqueDayInteractions,
      })),
      pagination: {
        total: totalContacts,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalContacts / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Errore nella ricerca dei contatti:', error);
    res.status(500).json({ success: false, message: 'Errore del server', error: error.message });
  }
};

/**
 * Ottieni un singolo contatto per ID
 */
exports.getContactById = async (req, res) => {
  try {
    const { contactId } = req.params;
    
    if (!contactId || !ObjectId.isValid(contactId)) {
      return res.status(400).json({ success: false, message: 'ID contatto non valido' });
    }
    
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contatto non trovato' });
    }
    
    res.json({
      success: true,
      contact: {
        _id: contact._id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        countryCode: contact.countryCode,
        optIn: contact.optIn,
        firstContact: contact.firstContact,
        lastContact: contact.lastContact,
        totalInteractions: contact.totalInteractions,
        uniqueDayInteractions: contact.uniqueDayInteractions,
        interactionDates: contact.interactionDates
      }
    });
  } catch (error) {
    console.error('Errore nel recupero del contatto:', error);
    res.status(500).json({ success: false, message: 'Errore del server', error: error.message });
  }
};

/**
 * Aggiorna lo stato opt-in/opt-out di un contatto
 */
exports.updateContactOptInStatus = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { optIn } = req.body;
    
    if (!contactId || !ObjectId.isValid(contactId)) {
      return res.status(400).json({ success: false, message: 'ID contatto non valido' });
    }
    
    if (optIn === undefined) {
      return res.status(400).json({ success: false, message: 'Stato opt-in richiesto' });
    }
    
    const contact = await Contact.findByIdAndUpdate(
      contactId,
      { $set: { optIn: !!optIn } },
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contatto non trovato' });
    }
    
    res.json({
      success: true,
      message: `Contatto aggiornato a ${optIn ? 'opt-in' : 'opt-out'}`,
      contact: {
        _id: contact._id,
        name: contact.name,
        optIn: contact.optIn
      }
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del contatto:', error);
    res.status(500).json({ success: false, message: 'Errore del server', error: error.message });
  }
};

/**
 * Elimina un contatto
 */
exports.deleteContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    
    if (!contactId || !ObjectId.isValid(contactId)) {
      return res.status(400).json({ success: false, message: 'ID contatto non valido' });
    }
    
    const result = await Contact.findByIdAndDelete(contactId);
    
    if (!result) {
      return res.status(404).json({ success: false, message: 'Contatto non trovato' });
    }
    
    res.json({
      success: true,
      message: 'Contatto eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione del contatto:', error);
    res.status(500).json({ success: false, message: 'Errore del server', error: error.message });
  }
};

/**
 * Aggiorna le informazioni di un contatto
 */
exports.updateContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { name, countryCode } = req.body;
    
    if (!contactId || !ObjectId.isValid(contactId)) {
      return res.status(400).json({ success: false, message: 'ID contatto non valido' });
    }
    
    // Controlla che i dati da aggiornare siano validi
    const updateData = {};
    if (name) updateData.name = name;
    if (countryCode) updateData.countryCode = countryCode;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'Nessun dato da aggiornare' });
    }
    
    const contact = await Contact.findByIdAndUpdate(
      contactId,
      { $set: updateData },
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contatto non trovato' });
    }
    
    res.json({
      success: true,
      message: 'Contatto aggiornato con successo',
      contact: {
        _id: contact._id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        countryCode: contact.countryCode,
        optIn: contact.optIn
      }
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del contatto:', error);
    res.status(500).json({ success: false, message: 'Errore del server', error: error.message });
  }
};

/**
 * Ottieni le statistiche dei contatti per un ristorante
 */
exports.getContactStats = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    if (!restaurantId || !ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ success: false, message: 'ID ristorante non valido' });
    }
    
    // Calcola statistiche di base
    const totalContacts = await Contact.countDocuments({ restaurant: new ObjectId(restaurantId) });
    const optInContacts = await Contact.countDocuments({ 
      restaurant: new ObjectId(restaurantId),
      optIn: true
    });
    
    // Trova i contatti con più interazioni
    const topContacts = await Contact.find({ restaurant: new ObjectId(restaurantId) })
      .sort({ totalInteractions: -1 })
      .limit(5)
      .select('name phoneNumber totalInteractions uniqueDayInteractions');
    
    // Trova i contatti con più giorni unici di interazione
    const loyalContacts = await Contact.find({ restaurant: new ObjectId(restaurantId) })
      .sort({ uniqueDayInteractions: -1 })
      .limit(5)
      .select('name phoneNumber totalInteractions uniqueDayInteractions');
    
    // Statistiche per paese
    const countriesStats = await Contact.aggregate([
      { $match: { restaurant: new ObjectId(restaurantId) } },
      { $group: { 
        _id: '$countryCode', 
        count: { $sum: 1 },
        optIn: { $sum: { $cond: [{ $eq: ['$optIn', true] }, 1, 0] } }
      }},
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalContacts,
        optInContacts,
        optOutContacts: totalContacts - optInContacts,
        topContacts,
        loyalContacts,
        countries: countriesStats.map(country => ({
          code: country._id,
          count: country.count,
          optIn: country.optIn
        }))
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle statistiche dei contatti:', error);
    res.status(500).json({ success: false, message: 'Errore del server', error: error.message });
  }
}; 