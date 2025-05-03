const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * Service per la gestione degli utenti
 */
class UserService {
  /**
   * Crea un nuovo utente
   * @param {Object} userData - Dati dell'utente
   * @returns {Promise<Object>} - Utente creato
   */
  async createUser(userData) {
    try {
      // Genera salt e hash della password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(userData.password, salt);

      // Crea il nuovo utente
      const user = new User({
        email: userData.email,
        passwordHash: passwordHash,
        salt: salt,
        languagePreference: userData.languagePreference || 'italiano',
        fullName: userData.fullName,
        subscriptionTier: userData.subscriptionTier || 'free',
        isActive: true,
        lastLogin: new Date() // Imposta il primo accesso al momento della creazione
      });

      // Salva l'utente
      await user.save();
      
      // Ritorna l'utente senza i campi sensibili
      const userObj = user.toObject();
      delete userObj.passwordHash;
      delete userObj.salt;
      
      return userObj;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trova un utente per email
   * @param {string} email - Email dell'utente
   * @returns {Promise<Object>} - Utente trovato
   */
  async findUserByEmail(email) {
    try {
      return await User.findOne({ email });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trova un utente per ID
   * @param {string} id - ID dell'utente
   * @returns {Promise<Object>} - Utente trovato
   */
  async findUserById(id) {
    try {
      return await User.findById(id);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Aggiorna un utente
   * @param {string} id - ID dell'utente
   * @param {Object} userData - Dati aggiornati dell'utente
   * @returns {Promise<Object>} - Utente aggiornato
   */
  async updateUser(id, userData) {
    try {
      const user = await User.findById(id);
      
      if (!user) {
        throw new Error('Utente non trovato');
      }

      // Aggiorna i campi
      if (userData.fullName) user.fullName = userData.fullName;
      if (userData.languagePreference) user.languagePreference = userData.languagePreference;
      if (userData.isActive !== undefined) user.isActive = userData.isActive;
      
      // Se la password è stata fornita, aggiorna anche quella
      if (userData.password) {
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(userData.password, salt);
        user.salt = salt;
      }

      // Salva le modifiche
      await user.save();
      
      // Ritorna l'utente senza i campi sensibili
      const userObj = user.toObject();
      delete userObj.passwordHash;
      delete userObj.salt;
      
      return userObj;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Elimina un utente
   * @param {string} id - ID dell'utente
   * @returns {Promise<boolean>} - true se eliminato con successo
   */
  async deleteUser(id) {
    try {
      const result = await User.findByIdAndDelete(id);
      return !!result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verifica le credenziali di un utente
   * @param {string} email - Email dell'utente
   * @param {string} password - Password dell'utente
   * @returns {Promise<Object|null>} - Utente se le credenziali sono valide, null altrimenti
   */
  async verifyCredentials(email, password) {
    try {
      const user = await User.findOne({ email });
      
      if (!user) {
        return null;
      }

      // Verifica la password
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      
      if (!isMatch) {
        return null;
      }

      // Aggiorna l'ultimo accesso
      user.lastLogin = new Date();
      await user.save();
      
      // Ritorna l'utente senza i campi sensibili
      const userObj = user.toObject();
      delete userObj.passwordHash;
      delete userObj.salt;
      
      return userObj;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new UserService(); 