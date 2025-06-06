const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

// Inizializza Stripe con la secret key (sicura nel backend)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Funzione per calcolare il prezzo per contatto
function getPricePerContact(contactCount) {
  if (contactCount <= 999) return 0.15;
  if (contactCount <= 1999) return 0.14;
  if (contactCount <= 2999) return 0.13;
  if (contactCount <= 3999) return 0.12;
  if (contactCount <= 4999) return 0.11;
  return 0.10; // 5000+
}

// POST /api/payment/create-intent
router.post('/create-intent', async (req, res) => {
  try {
    const { contactCount, campaignName, restaurantName } = req.body;

    if (!contactCount || contactCount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Numero di contatti non valido'
      });
    }

    // Calcola il prezzo totale
    const pricePerContact = getPricePerContact(contactCount);
    let totalAmount = Math.round(contactCount * pricePerContact * 100); // Stripe usa centesimi

    // Stripe richiede un minimo di €0.50 (50 centesimi) per EUR
    const minimumAmount = 50; // 50 centesimi = €0.50
    if (totalAmount < minimumAmount) {
      totalAmount = minimumAmount;
    }

    // Crea il Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'eur',
      payment_method_types: ['card'],
      metadata: {
        contactCount: contactCount.toString(),
        pricePerContact: pricePerContact.toString(),
        campaignName: campaignName || 'Campaign',
        restaurantName: restaurantName || 'Restaurant',
        type: 'campaign_payment',
        originalAmount: Math.round(contactCount * pricePerContact * 100).toString(),
        adjustedForMinimum: totalAmount > Math.round(contactCount * pricePerContact * 100) ? 'true' : 'false'
      },
      description: `Pagamento campagna: ${campaignName || 'Campaign'} - ${contactCount} contatti`
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        pricePerContact,
        contactCount,
        originalAmount: Math.round(contactCount * pricePerContact * 100),
        wasAdjustedForMinimum: totalAmount > Math.round(contactCount * pricePerContact * 100)
      }
    });

  } catch (error) {
    console.error('Errore nella creazione del Payment Intent:', error);
    res.status(500).json({
      success: false,
      error: 'Errore interno del server',
      details: error.message
    });
  }
});

// POST /api/payment/verify
router.post('/verify', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment Intent ID richiesto'
      });
    }

    // Recupera il Payment Intent da Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const isSuccessful = paymentIntent.status === 'succeeded';

    res.json({
      success: true,
      data: {
        paymentStatus: paymentIntent.status,
        isSuccessful,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata
      }
    });

  } catch (error) {
    console.error('Errore nella verifica del pagamento:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella verifica del pagamento',
      details: error.message
    });
  }
});

module.exports = router; 