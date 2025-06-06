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
      
      // Per i video destinati a WhatsApp, verifichiamo prima se l'URL originale funziona
      if (isVideo && optimizeForWhatsApp) {
        console.log('🎬 Video per WhatsApp - verifica URL originale:', path);
        
        const axios = require('axios');
        let urlFunziona = false;
        let contentTypeProblematico = false;
        
        try {
          const testResponse = await axios.head(path, { timeout: 10000 });
          urlFunziona = true;
          const contentType = testResponse.headers['content-type'];
          console.log('🎬 URL originale accessibile - Content-Type:', contentType);
          
          // Controlla se il Content-Type è problematico per WhatsApp
          if (contentType && contentType.includes('codecs=')) {
            contentTypeProblematico = true;
            console.log('🎬 Content-Type contiene parametri codec - serve ottimizzazione');
          }
        } catch (testError) {
          console.log('🎬 URL originale non accessibile:', testError.message);
        }
        
        // Se l'URL originale funziona e non ha problemi di Content-Type, usalo
        if (urlFunziona && !contentTypeProblematico) {
          console.log('🎬 URL originale OK per WhatsApp, nessuna ottimizzazione necessaria');
        } else {
          // Solo se necessario, crea una versione ottimizzata
          console.log('🎬 Creazione versione ottimizzata necessaria...');
          
          try {
            // Estrai il public_id base senza estensione
            let basePublicId = public_id;
            if (basePublicId.includes('.')) {
              basePublicId = basePublicId.split('.')[0];
            }
            
            // Strategia semplificata: carica direttamente come raw con estensione .mp4
            const whatsappPublicId = `${basePublicId}_whatsapp_raw`;
            
            console.log('🎬 Creazione asset raw per WhatsApp:', whatsappPublicId);
            
            // Scarica il video originale
            const videoResponse = await axios.get(path, { 
              responseType: 'arraybuffer',
              timeout: 30000
            });
            
            // Salva temporaneamente
            const fs = require('fs');
            const tempFilePath = `/tmp/${whatsappPublicId}.mp4`;
            fs.writeFileSync(tempFilePath, Buffer.from(videoResponse.data));
            
            console.log('🎬 Video scaricato, carico come raw...');
            
            // Carica come raw per evitare problemi di Content-Type
            const rawResult = await cloudinary.uploader.upload(tempFilePath, {
              resource_type: 'raw',
              public_id: whatsappPublicId,
              folder: 'campaign-media',
              overwrite: true
            });
            
            // Elimina il file temporaneo
            fs.unlinkSync(tempFilePath);
            
            // Verifica che il nuovo URL funzioni
            const verifyResponse = await axios.head(rawResult.secure_url, { timeout: 10000 });
            console.log('🎬 Asset raw creato e verificato:', rawResult.secure_url);
            console.log('🎬 Content-Type raw:', verifyResponse.headers['content-type']);
            
            // Usa il nuovo URL
            path = rawResult.secure_url;
            
          } catch (optimizationError) {
            console.error('🎬 Errore nell\'ottimizzazione:', optimizationError);
            console.log('🎬 Mantengo URL originale come fallback');
            // Mantieni l'URL originale anche se l'ottimizzazione fallisce
          }
        }
      }
      
      // Assicurati che i video abbiano estensione .mp4 (solo correzione URL, non ricaricamento)
      if (isVideo && !path.endsWith('.mp4')) {
        // Rimuovi estensioni multiple e forza .mp4
        const correctedPath = path.replace(/\.[^.]+$/, '.mp4');
        console.log('🎬 URL corretto con estensione .mp4:', correctedPath);
        
        // Verifica che l'URL corretto funzioni
        try {
          const axios = require('axios');
          await axios.head(correctedPath, { timeout: 5000 });
          path = correctedPath;
          console.log('🎬 URL corretto verificato e utilizzato');
        } catch (correctionError) {
          console.warn('🎬 URL corretto non funziona, mantengo originale:', correctionError.message);
        }
      }
      
      // Verifica finale dell'URL
      if (isVideo) {
        console.log('🎬 URL finale del video:', path);
        
        // Test finale dell'URL
        try {
          const axios = require('axios');
          const finalTestResponse = await axios.head(path, { timeout: 5000 });
          console.log('🎬 ✅ Test finale URL - Status:', finalTestResponse.status);
          console.log('🎬 ✅ Test finale URL - Content-Type:', finalTestResponse.headers['content-type']);
        } catch (finalTestError) {
          console.error('🎬 ❌ ATTENZIONE: URL finale non accessibile!', finalTestError.message);
          // In questo caso, dovremmo restituire un errore
          return res.status(500).json({
            success: false,
            error: 'URL video finale non accessibile',
            details: finalTestError.message
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