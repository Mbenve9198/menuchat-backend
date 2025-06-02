const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { protect } = require('../middleware/authMiddleware');

/**
 * GET /api/email-preferences
 * Ottieni le preferenze email dell'utente corrente
 */
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('emailPreferences timezone languagePreference');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    res.json({
      success: true,
      data: {
        emailPreferences: user.emailPreferences,
        timezone: user.timezone,
        languagePreference: user.languagePreference
      }
    });

  } catch (error) {
    console.error('Errore nel recupero preferenze email:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero delle preferenze'
    });
  }
});

/**
 * PUT /api/email-preferences
 * Aggiorna le preferenze email dell'utente
 */
router.put('/', protect, async (req, res) => {
  try {
    const { emailPreferences, timezone, languagePreference } = req.body;

    const updateData = {};

    // Aggiorna le preferenze email se fornite
    if (emailPreferences) {
      // Valida le preferenze email
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

    // Aggiorna il timezone se fornito
    if (timezone) {
      updateData.timezone = timezone;
    }

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

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('emailPreferences timezone languagePreference');

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
        emailPreferences: user.emailPreferences,
        timezone: user.timezone,
        languagePreference: user.languagePreference
      }
    });

  } catch (error) {
    console.error('Errore nell\'aggiornamento preferenze email:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'aggiornamento delle preferenze'
    });
  }
});

/**
 * POST /api/email-preferences/unsubscribe/:type
 * Disabilita un tipo specifico di email (per link di unsubscribe)
 */
router.post('/unsubscribe/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { email, token } = req.body;

    // Valida il tipo di email
    const validTypes = ['dailyReports', 'weeklyReports', 'campaignSuggestions', 'marketingEmails'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo di email non valido'
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email richiesta'
      });
    }

    // Trova l'utente per email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utente non trovato'
      });
    }

    // Disabilita il tipo di email specifico
    const updateField = `emailPreferences.${type}`;
    await User.findByIdAndUpdate(user._id, {
      $set: { [updateField]: false }
    });

    res.json({
      success: true,
      message: `Disiscrizione da ${type} completata con successo`
    });

  } catch (error) {
    console.error('Errore nella disiscrizione:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella disiscrizione'
    });
  }
});

/**
 * GET /api/email-preferences/unsubscribe-page/:type
 * Pagina di disiscrizione (per link nelle email)
 */
router.get('/unsubscribe-page/:type', async (req, res) => {
  const { type } = req.params;
  const { email } = req.query;

  const typeLabels = {
    dailyReports: 'Report Giornalieri',
    weeklyReports: 'Report Settimanali', 
    campaignSuggestions: 'Suggerimenti Campagne',
    marketingEmails: 'Email Marketing'
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Disiscrizione - MenuChat</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; background: #f8fffe; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #1B9AAA; margin-bottom: 10px; }
        .title { font-size: 20px; color: #333; margin-bottom: 20px; }
        .form { margin: 20px 0; }
        .button { background: #EF476F; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; width: 100%; }
        .button:hover { background: #d63859; }
        .success { color: #06D6A0; text-align: center; margin: 20px 0; }
        .error { color: #EF476F; text-align: center; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MenuChat</div>
            <div class="title">Disiscrizione da ${typeLabels[type] || type}</div>
        </div>
        
        <div id="form" class="form">
            <p>Confermi di voler disiscriverti da: <strong>${typeLabels[type] || type}</strong>?</p>
            <button class="button" onclick="unsubscribe()">Conferma Disiscrizione</button>
        </div>
        
        <div id="message" style="display: none;"></div>
    </div>

    <script>
        async function unsubscribe() {
            try {
                const response = await fetch('/api/email-preferences/unsubscribe/${type}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: '${email}' })
                });
                
                const result = await response.json();
                
                document.getElementById('form').style.display = 'none';
                const messageDiv = document.getElementById('message');
                messageDiv.style.display = 'block';
                
                if (result.success) {
                    messageDiv.innerHTML = '<div class="success">✅ Disiscrizione completata con successo!</div>';
                } else {
                    messageDiv.innerHTML = '<div class="error">❌ Errore: ' + result.error + '</div>';
                }
            } catch (error) {
                document.getElementById('form').style.display = 'none';
                document.getElementById('message').innerHTML = '<div class="error">❌ Errore di connessione</div>';
                document.getElementById('message').style.display = 'block';
            }
        }
    </script>
</body>
</html>`;

  res.send(html);
});

module.exports = router; 