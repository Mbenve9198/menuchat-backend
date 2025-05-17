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
      
      // Verifica se è un video e se è richiesta l'ottimizzazione per WhatsApp
      const noTransformations = req.body.noTransformations === 'true';
      const optimizeForWhatsApp = req.body.optimizeForWhatsApp === 'true';
      const isVideo = resource_type === 'video';
      
      if (isVideo && optimizeForWhatsApp) {
        try {
          console.log(`Ottimizzazione video per WhatsApp: ${originalname}`);
          
          // Utilizziamo Cloudinary per generare un video compatibile
          // ma senza includere trasformazioni nell'URL finale
          
          // 1. Ottieni l'ID pubblico del file caricato
          let publicId = "";
          const uploadMatch = path.match(/\/upload\/v\d+\/(.+)$/);
          if (uploadMatch && uploadMatch[1]) {
            const originalPublicId = uploadMatch[1].replace(/\.[^/.]+$/, '');
            
            // 2. Genera un nuovo public_id per il file ottimizzato
            const optimizedPublicId = `${originalPublicId}_whatsapp_optimized`;
            
            // 3. Esegui la trascodifica con Cloudinary ma salva come risorsa derivata
            // con un nuovo public_id, così l'URL finale sarà "pulito"
            const transformationOptions = {
              resource_type: 'video',
              type: 'upload',
              public_id: optimizedPublicId,
              overwrite: true,
              transformation: [
                {
                  quality: 70,
                  video_codec: 'h264:baseline:3.1',
                  audio_codec: 'aac',
                  bit_rate: '2m',
                  format: 'mp4',
                  flags: 'faststart'
                }
              ]
            };
            
            // Esegui la trasformazione e crea una nuova risorsa
            const result = await cloudinary.uploader.explicit(
              originalPublicId,
              transformationOptions
            );
            
            if (result && result.secure_url) {
              // Usa l'URL "pulito" della nuova risorsa generata
              // senza parametri di trasformazione nell'URL
              path = result.secure_url;
              console.log(`Video ottimizzato per WhatsApp: ${path}`);
            } else {
              console.warn("Impossibile ottimizzare il video per WhatsApp, uso l'originale");
            }
          }
        } catch (optimizationError) {
          console.error("Errore nell'ottimizzazione del video per WhatsApp:", optimizationError);
          // Continuiamo con l'URL originale se c'è un errore
        }
      } else if (isVideo && !noTransformations) {
        // Comportamento precedente con trasformazioni nell'URL
        console.log(`Conversione video richiesta: ${originalname} in formato MP4`);
        
        try {
          // URL originale
          const originalUrl = path;
          
          // Estrai l'ID pubblico per aggiungere trasformazioni
          let publicId = "";
          
          // Cerca l'ID pubblico nell'URL
          const uploadMatch = originalUrl.match(/\/upload\/v\d+\/(.+)$/);
          if (uploadMatch && uploadMatch[1]) {
            publicId = uploadMatch[1];
            
            // Rimuovi l'estensione dal public_id se presente
            const extIndex = publicId.lastIndexOf('.');
            if (extIndex !== -1) {
              publicId = publicId.substring(0, extIndex);
            }
            
            // Costruisci il nuovo URL con le trasformazioni per la conversione
            // Utilizza trasformazioni specifiche con:
            // vc_h264:baseline:3.1 - Codifica video H.264 con profilo baseline e livello 3.1
            // ac_aac - Codec audio AAC LC esplicitamente richiesto da WhatsApp
            // br_2m - Bitrate massimo di 2 Mbps
            // q_70 - Qualità del 70%
            const transformations = `q_70,vc_h264:baseline:3.1,ac_aac,br_2m,f_mp4`;
            
            // Costruisce l'URL con trasformazioni
            path = originalUrl.replace(/\/upload\//, `/upload/${transformations}/`);
            
            // Assicurati che l'estensione finale sia corretta
            if (!path.endsWith('.mp4')) {
              path = path.replace(/\.[^/.]+$/, '') + '.mp4';
            }
            
            console.log(`Video convertito: ${path}`);
          }
        } catch (conversionError) {
          console.error("Errore nella conversione del video:", conversionError);
          // Continuiamo con l'URL originale se c'è un errore nella conversione
        }
      }
      
      // Restituisci l'URL del file caricato e altre informazioni
      res.status(200).json({
        success: true,
        file: {
          url: path,
          originalName: originalname,
          size: size,
          format: format,
          resourceType: resource_type,
          fileName: public_id || originalname,
          publicId: public_id
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