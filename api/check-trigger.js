// API endpoint per verificare la disponibilità della frase trigger
const BotConfiguration = require('../models/BotConfiguration');

module.exports = async (req, res) => {
  try {
    const { triggerPhrase } = req.body;
    
    if (!triggerPhrase || triggerPhrase.trim() === '') {
      return res.json({ available: false, error: 'Trigger phrase cannot be empty' });
    }
    
    // Check if the trigger phrase already exists in the database
    const existingBot = await BotConfiguration.findOne({
      triggerWord: { $regex: new RegExp(`^${triggerPhrase}$`, 'i') }, // Case-insensitive match
      active: true // Only check against active bot configurations
    });
    
    // Return whether the trigger phrase is available (true if no existing bot found)
    return res.json({ available: !existingBot });
    
  } catch (error) {
    console.error('Error checking trigger availability:', error);
    return res.status(500).json({ available: false, error: 'Server error' });
  }
}; 