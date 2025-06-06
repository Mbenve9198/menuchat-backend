const { cloudinary } = require('../config/cloudinary');
const menuService = require('../services/menuService');

/**
 * Controller per gestire gli upload di file
 */
class UploadController {
  /**
   * Gestisce l'upload di un file menu PDF
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async uploadMenuPdf(req, res) {
    try {
      // Il file è stato caricato da multer su Cloudinary
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nessun file caricato'
        });
      }

      // Estrai l'ID del ristorante e il codice della lingua dai parametri
      const { restaurantId, menuId, languageCode } = req.body;
      
      // Estrai i dati del file caricato
      const { path, originalname, size, filename, public_id } = req.file;
      
      // Se abbiamo un ID del menu, aggiorniamo il PDF del menu esistente
      if (menuId) {
        await menuService.updateMenuPdf(menuId, {
          menuPdfUrl: path,
          menuPdfName: originalname,
          cloudinaryPublicId: public_id || filename,
        });
      }
      
      // Restituisci l'URL del file caricato e altre informazioni
      res.status(200).json({
        success: true,
        file: {
          url: path,
          originalName: originalname,
          size: size,
          languageCode: languageCode || 'it',
          fileName: filename,
          publicId: public_id || filename
        }
      });
    } catch (error) {
      console.error('Errore durante l\'upload del file:', error);
      res.status(500).json({
        success: false,
        error: 'Errore durante l\'upload del file',
        details: error.message
      });
    }
  }

  /**
   * Gestisce l'upload di media per una campagna (immagine, video, pdf)
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async uploadCampaignMedia(req, res) {
    try {
      // Verifica se il file è presente
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nessun file caricato'
        });
      }

      let { path, originalname, size, format, resource_type, public_id } = req.file;
      
      console.log('🎬 Upload media - Dati iniziali:', {
        originalname,
        resource_type,
        format,
        path: path.substring(0, 100) + '...',
        public_id
      });
      
      // Verifica se è un video
      const isVideo = resource_type === 'video' || 
                     originalname.toLowerCase().endsWith('.mp4') || 
                     originalname.toLowerCase().endsWith('.mov') ||
                     originalname.toLowerCase().endsWith('.avi') ||
                     originalname.toLowerCase().endsWith('.webm');
      
      const optimizeForWhatsApp = req.body.optimizeForWhatsApp === 'true';
      
      console.log('🎬 Analisi file:', { isVideo, optimizeForWhatsApp });
      
      if (isVideo && optimizeForWhatsApp) {
        try {
          console.log('🎬 Inizio ottimizzazione video per WhatsApp');
          
          // Estrai il public_id base senza estensione
          let basePublicId = public_id;
          if (basePublicId.includes('.')) {
            basePublicId = basePublicId.split('.')[0];
          }
          
          // Crea un nuovo public_id per la versione WhatsApp
          const whatsappPublicId = `${basePublicId}_whatsapp`;
          
          console.log('🎬 Public IDs:', { original: public_id, whatsapp: whatsappPublicId });
          
          // Strategia 1: Crea una versione ottimizzata del video
          console.log('🎬 Creazione versione ottimizzata...');
          const optimizedResult = await cloudinary.uploader.upload(path, {
            resource_type: 'video',
            public_id: whatsappPublicId,
            format: 'mp4',
            overwrite: true,
            transformation: [
              { quality: 'auto:good' },
              { video_codec: 'h264' },
              { audio_codec: 'aac' },
              { flags: 'streaming_attachment' }
            ]
          });
          
          console.log('🎬 Video ottimizzato creato:', optimizedResult.secure_url);
          
          // Verifica se l'URL funziona correttamente
          const axios = require('axios');
          try {
            const headResponse = await axios.head(optimizedResult.secure_url, { timeout: 10000 });
            const contentType = headResponse.headers['content-type'];
            console.log('🎬 Content-Type video ottimizzato:', contentType);
            
            // Se il Content-Type è pulito, usa questo URL
            if (contentType && contentType.startsWith('video/mp4') && !contentType.includes('codecs=')) {
              path = optimizedResult.secure_url;
              console.log('🎬 URL finale (ottimizzato):', path);
            } else {
              console.log('🎬 Content-Type ancora problematico, provo strategia alternativa');
              
              // Strategia 2: Carica come raw per evitare problemi di Content-Type
              const fs = require('fs');
              const tempFilePath = `/tmp/${whatsappPublicId}.mp4`;
              
              // Scarica il video ottimizzato
              const videoResponse = await axios.get(optimizedResult.secure_url, { 
                responseType: 'stream',
                timeout: 30000
              });
              
              // Salva temporaneamente
              const writer = fs.createWriteStream(tempFilePath);
              videoResponse.data.pipe(writer);
              
              await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
              });
              
              console.log('🎬 Video scaricato temporaneamente, carico come raw...');
              
              // Carica come raw
              const rawResult = await cloudinary.uploader.upload(tempFilePath, {
                resource_type: 'raw',
                public_id: `${whatsappPublicId}_raw`,
                folder: 'campaign-media',
                overwrite: true
              });
              
              // Elimina il file temporaneo
              fs.unlinkSync(tempFilePath);
              
              path = rawResult.secure_url;
              console.log('🎬 URL finale (raw):', path);
            }
          } catch (verifyError) {
            console.warn('🎬 Errore nella verifica del video ottimizzato:', verifyError.message);
            // Fallback all'URL originale
            console.log('🎬 Fallback all\'URL originale');
          }
          
        } catch (optimizationError) {
          console.error('🎬 Errore nell\'ottimizzazione video:', optimizationError);
          console.log('🎬 Uso URL originale come fallback');
        }
      }
      
      // Assicurati che i video abbiano estensione .mp4
      if (isVideo && !path.endsWith('.mp4')) {
        // Rimuovi estensioni multiple e forza .mp4
        path = path.replace(/\.[^.]+$/, '.mp4');
        console.log('🎬 URL corretto con estensione .mp4:', path);
      }
      
      // Verifica finale dell'URL
      if (isVideo) {
        console.log('🎬 URL finale del video:', path);
        
        // Test rapido dell'URL
        try {
          const axios = require('axios');
          const testResponse = await axios.head(path, { timeout: 5000 });
          console.log('🎬 Test URL - Status:', testResponse.status);
          console.log('🎬 Test URL - Content-Type:', testResponse.headers['content-type']);
        } catch (testError) {
          console.warn('🎬 Attenzione: URL potrebbe non essere accessibile:', testError.message);
        }
      }
      
      // Restituisci l'URL del file caricato e altre informazioni
      res.status(200).json({
        success: true,
        file: {
          url: path,
          originalName: originalname,
          size: size,
          format: isVideo ? 'mp4' : format,
          resourceType: isVideo ? 'video' : resource_type,
          fileName: public_id || originalname,
          publicId: public_id,
          optimizedForWhatsApp: isVideo && optimizeForWhatsApp
        }
      });
    } catch (error) {
      console.error('Errore durante l\'upload del media:', error);
      res.status(500).json({
        success: false,
        error: 'Errore durante l\'upload del media',
        details: error.message
      });
    }
  }

  /**
   * Elimina un file menu PDF
   * @param {Object} req - Richiesta HTTP
   * @param {Object} res - Risposta HTTP
   * @returns {Promise<void>}
   */
  async deleteMenuPdf(req, res) {
    try {
      const { publicId, menuId } = req.params;

      if (!publicId) {
        return res.status(400).json({
          success: false,
          error: 'ID pubblico del file non fornito'
        });
      }

      // Elimina il file da Cloudinary
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'raw'
      });

      if (result.result !== 'ok') {
        return res.status(400).json({
          success: false,
          error: 'Impossibile eliminare il file',
          details: result
        });
      }

      // Se abbiamo un ID del menu, aggiorniamo anche il record del menu
      if (menuId) {
        await menuService.updateMenuPdf(menuId, {
          menuPdfUrl: '',
          menuPdfName: '',
          cloudinaryPublicId: '',
        });
      }

      res.status(200).json({
        success: true,
        message: 'File eliminato con successo'
      });
    } catch (error) {
      console.error('Errore durante l\'eliminazione del file:', error);
      res.status(500).json({
        success: false,
        error: 'Errore durante l\'eliminazione del file',
        details: error.message
      });
    }
  }
}

module.exports = new UploadController(); 