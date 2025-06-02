const express = require('express');
const router = express.Router();
const schedulerService = require('../services/schedulerService');
const { protect } = require('../middleware/authMiddleware');

/**
 * GET /api/scheduler/status
 * Ottieni lo status dello scheduler
 */
router.get('/status', protect, async (req, res) => {
  try {
    const status = schedulerService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Errore nel recupero status scheduler:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recupero dello status'
    });
  }
});

/**
 * POST /api/scheduler/run/:jobType
 * Esegui manualmente un job specifico
 */
router.post('/run/:jobType', protect, async (req, res) => {
  try {
    const { jobType } = req.params;
    
    // Verifica che il tipo di job sia valido
    const validJobTypes = ['daily', 'weekly', 'suggestions'];
    if (!validJobTypes.includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: `Tipo di job non valido. Tipi supportati: ${validJobTypes.join(', ')}`
      });
    }

    // Esegui il job in background
    schedulerService.runManually(jobType).catch(error => {
      console.error(`Errore esecuzione manuale job ${jobType}:`, error);
    });

    res.json({
      success: true,
      message: `Job ${jobType} avviato manualmente`
    });

  } catch (error) {
    console.error('Errore esecuzione manuale job:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nell\'esecuzione del job'
    });
  }
});

/**
 * POST /api/scheduler/restart
 * Riavvia lo scheduler
 */
router.post('/restart', protect, async (req, res) => {
  try {
    schedulerService.restart();
    
    res.json({
      success: true,
      message: 'Scheduler riavviato con successo'
    });

  } catch (error) {
    console.error('Errore riavvio scheduler:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel riavvio dello scheduler'
    });
  }
});

/**
 * POST /api/scheduler/stop
 * Ferma lo scheduler
 */
router.post('/stop', protect, async (req, res) => {
  try {
    schedulerService.stopAll();
    
    res.json({
      success: true,
      message: 'Scheduler fermato con successo'
    });

  } catch (error) {
    console.error('Errore stop scheduler:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel fermare lo scheduler'
    });
  }
});

module.exports = router; 