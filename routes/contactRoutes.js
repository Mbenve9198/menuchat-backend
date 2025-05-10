const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { protect } = require('../middleware/authMiddleware');

// Protezione: tutte le rotte richiedono autenticazione
router.use(protect);

// Rotte principali per i contatti
router.route('/')
  .get(contactController.getContacts)
  .post(contactController.createContact);

// Rotta per importare contatti dalle interazioni
router.post('/import-from-interactions', contactController.importFromInteractions);

// Rotta per esportare contatti in CSV
router.get('/export', contactController.exportContacts);

// Rotte per operazioni su singolo contatto
router.route('/:id')
  .get(contactController.getContactById)
  .put(contactController.updateContact)
  .delete(contactController.deleteContact);

// Rotta specifica per aggiornare lo stato opt-in/out
router.patch('/:id/opt-status', contactController.updateOptStatus);

module.exports = router; 