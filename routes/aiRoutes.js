const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

router.post('/generate-template', aiController.generateTemplate);
router.post('/generate-image-prompt', aiController.generateImagePrompt);
router.post('/generate-image', aiController.generateImage);

module.exports = router; 