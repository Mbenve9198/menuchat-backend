const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Interaction = require('../models/CustomerInteraction');
const Restaurant = require('../models/Restaurant');

// @desc    Ottieni le recensioni programmate per un ristorante
// @route   GET /api/scheduler/reviews/:restaurantId
// @access  Private
exports.getScheduledReviews = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    res.status(400);
    throw new Error('ID ristorante non valido');
  }

  // Verifica che il ristorante appartenga all'utente
  const restaurant = await Restaurant.findOne({
    _id: restaurantId,
    user: req.user.id
  });

  if (!restaurant) {
    res.status(404);
    throw new Error('Ristorante non trovato');
  }

  // Trova tutte le interazioni con recensioni programmate
  const scheduledReviews = await Interaction.find({
    restaurant: restaurantId,
    reviewRequested: true,
    'reviewData.completed': false
  }).sort({ reviewRequestedAt: 1 });

  res.status(200).json(scheduledReviews);
});

// @desc    Forza l'invio di una recensione specifica
// @route   POST /api/scheduler/reviews/force/:interactionId
// @access  Private
exports.forceSendReview = asyncHandler(async (req, res) => {
  const { interactionId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(interactionId)) {
    res.status(400);
    throw new Error('ID interazione non valido');
  }

  // Trova l'interazione
  const interaction = await Interaction.findById(interactionId).populate('restaurant');

  if (!interaction) {
    res.status(404);
    throw new Error('Interazione non trovata');
  }

  // Verifica che il ristorante appartenga all'utente
  if (interaction.restaurant.user.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Non autorizzato');
  }

  // Aggiorna i dati per indicare che la recensione è stata inviata
  interaction.reviewData.completed = true;
  interaction.reviewData.completedAt = new Date();
  
  // Aggiungi un evento per tracciare l'invio forzato della recensione
  interaction.addEvent('review_requested', { forcedByUser: true });
  
  await interaction.save();

  res.status(200).json({ success: true, message: 'Richiesta recensione inviata con successo' });
}); 