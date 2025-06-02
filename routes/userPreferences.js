const express = require('express');
const router = express.Router();
const { User } = require('../models');
const auth = require('../middleware/auth');

/**
 * GET /api/user/preferences
 * Ottieni le preferenze dell'utente corrente
 */
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('languagePreference timezone emailPreferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    res.json({
      success: true,
      data: {
        languagePreference: user.languagePreference || 'italiano',
        timezone: user.timezone || 'Europe/Rome',
        emailPreferences: user.emailPreferences || {
          dailyReports: true,
          weeklyReports: true,
          campaignSuggestions: true,
          marketingEmails: true
        }
      }
    });

  } catch (error) {
    console.error('Errore nel recupero preferenze utente:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero delle preferenze'
    });
  }
});

/**
 * PUT /api/user/preferences
 * Aggiorna le preferenze dell'utente
 */
router.put('/', auth, async (req, res) => {
  try {
    const { languagePreference, timezone, emailPreferences } = req.body;

    const updateData = {};

    // Aggiorna la lingua se fornita
    if (languagePreference) {
      const validLanguages = ['italiano', 'english', 'español'];
      if (!validLanguages.includes(languagePreference)) {
        return res.status(400).json({
          success: false,
          error: `Lingua non supportata: ${languagePreference}`
        });
      }
      updateData.languagePreference = languagePreference;
    }

    // Aggiorna il timezone se fornito
    if (timezone) {
      updateData.timezone = timezone;
    }

    // Aggiorna le preferenze email se fornite
    if (emailPreferences) {
      const validPreferences = ['dailyReports', 'weeklyReports', 'campaignSuggestions', 'marketingEmails'];
      const providedPreferences = Object.keys(emailPreferences);
      
      for (const pref of providedPreferences) {
        if (!validPreferences.includes(pref)) {
          return res.status(400).json({
            success: false,
            error: `Preferenza email non valida: ${pref}`
          });
        }
        
        if (typeof emailPreferences[pref] !== 'boolean') {
          return res.status(400).json({
            success: false,
            error: `Il valore per ${pref} deve essere boolean`
          });
        }
      }

      updateData.emailPreferences = emailPreferences;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('languagePreference timezone emailPreferences');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    res.json({
      success: true,
      message: 'Preferenze aggiornate con successo',
      data: {
        languagePreference: user.languagePreference,
        timezone: user.timezone,
        emailPreferences: user.emailPreferences
      }
    });

  } catch (error) {
    console.error('Errore nell\'aggiornamento preferenze utente:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'aggiornamento delle preferenze'
    });
  }
});

module.exports = router; 