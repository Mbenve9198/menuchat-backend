const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
  adminLogin,
  getUsersStats,
  refreshAllStats,
  getUserDetails
} = require('../controllers/adminController');

// @route   POST /api/admin/login
// @desc    Login admin
// @access  Public
router.post('/login', adminLogin);

// @route   GET /api/admin/users-stats
// @desc    Ottiene statistiche di tutti gli utenti
// @access  Private (Admin only)
router.get('/users-stats', adminAuth, getUsersStats);

// @route   POST /api/admin/refresh-stats
// @desc    Aggiorna le statistiche per tutti gli utenti
// @access  Private (Admin only)
router.post('/refresh-stats', adminAuth, refreshAllStats);

// @route   GET /api/admin/user/:userId
// @desc    Ottiene dettagli di un singolo utente
// @access  Private (Admin only)
router.get('/user/:userId', adminAuth, getUserDetails);

module.exports = router; 