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
      const isVideo = resource_type === 'video' || resource_type === 'raw' && (
                     originalname.toLowerCase().endsWith('.mp4') || 
                     originalname.toLowerCase().endsWith('.mov') ||
                     originalname.toLowerCase().endsWith('.avi') ||
                     originalname.toLowerCase().endsWith('.webm'));
      
      const optimizeForWhatsApp = req.body.optimizeForWhatsApp === 'true';
      
      console.log('🎬 Analisi file:', { isVideo, optimizeForWhatsApp, resource_type });
      
      // Verifica finale dell'URL - SEMPRE per i video
      if (isVideo) {
        console.log('🎬 Verifica finale URL video:', path);
        
        // Test dell'URL
        try {
          const axios = require('axios');
          const finalTestResponse = await axios.head(path, { timeout: 10000 });
          console.log('🎬 ✅ URL video accessibile - Status:', finalTestResponse.status);
          console.log('🎬 ✅ Content-Type:', finalTestResponse.headers['content-type']);
          console.log('🎬 ✅ Content-Length:', finalTestResponse.headers['content-length']);
          
          // Log del tipo di caricamento
          if (path.includes('/raw/')) {
            console.log('🎬 ✅ Video caricato come RAW - compatibile con WhatsApp');
          } else if (path.includes('/video/')) {
            console.log('🎬 ⚠️ Video caricato come VIDEO - potrebbe avere problemi di Content-Type');
          }
          
        } catch (finalTestError) {
          console.error('🎬 ❌ ERRORE CRITICO: URL video finale non accessibile!', finalTestError.message);
          
          // Restituisci un errore dettagliato
          return res.status(500).json({
            success: false,
            error: 'URL video non accessibile dopo l\'upload',
            details: {
              url: path,
              error: finalTestError.message,
              public_id: public_id,
              resource_type: resource_type
            }
          });
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
          resourceType: resource_type,
          fileName: public_id || originalname,
          publicId: public_id,
          optimizedForWhatsApp: isVideo && optimizeForWhatsApp,
          isVideo: isVideo
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