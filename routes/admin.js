const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
  adminLogin,
  getUsersStats,
  refreshAllStats,
  getUserDetails,
  getTemplateStats,
  getMonthlyStats,
  getMonthlyTrends,
  getUserMonthlyStats
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

// @route   GET /api/admin/template-stats
// @desc    Ottiene statistiche dettagliate sui template utilizzati
// @access  Private (Admin only)
router.get('/template-stats', adminAuth, getTemplateStats);

// @route   GET /api/admin/monthly-stats
// @desc    Ottieni statistiche mensili per tutti gli utenti
// @access  Private (Admin only)
router.get('/monthly-stats', adminAuth, getMonthlyStats);

// @route   GET /api/admin/monthly-trends
// @desc    Ottieni trend mensili
// @access  Private (Admin only)
router.get('/monthly-trends', adminAuth, getMonthlyTrends);

// @route   GET /api/admin/user/:userId/monthly-stats
// @desc    Ottieni statistiche mensili per un utente specifico
// @access  Private (Admin only)
router.get('/user/:userId/monthly-stats', adminAuth, getUserMonthlyStats);

module.exports = router; 