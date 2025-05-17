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
          
          // Ottenimento dell'ID pubblico base, senza estensione
          let publicIdBase = "";
          const uploadMatch = path.match(/\/upload\/v\d+\/(.+)$/);
          if (uploadMatch && uploadMatch[1]) {
            publicIdBase = uploadMatch[1].replace(/\.[^/.]+$/, '');
            
            // Genera un nuovo public_id per il file ottimizzato
            const optimizedPublicId = `${publicIdBase}_whatsapp_optimized`;
            
            // SOLUZIONE B: Upload completo del file invece di explicit con eager
            // Questo garantisce che l'URL finale non abbia trasformazioni e termini in .mp4,
            // e che l'header Content-Type sia video/mp4 senza parametri aggiuntivi
            console.log("Esecuzione upload MP4 ottimizzato per WhatsApp...");
            
            // 1️⃣ URL del file sorgente .mov così com'è appena caricato
            const originalUrl = path;    

            // 3️⃣ upload vero e proprio, con transcodifica e salvataggio in MP4
            const uploadRes = await cloudinary.uploader.upload(originalUrl, {
              resource_type: 'video',
              public_id: optimizedPublicId,   // ⚠️ qui funziona perché è un *upload*
              format: 'mp4',
              transformation: 'q_70,vc_h264:baseline:3.1,ac_aac,br_2m,fl_faststart'
            });
            
            if (uploadRes && uploadRes.secure_url) {
              path = uploadRes.secure_url;      // …/upload/<folder>/<public_id>.mp4
              console.log(`Video compatibile WhatsApp: ${path}`);
              
              // Verifica che l'URL finisca effettivamente con .mp4
              if (!path.endsWith('.mp4')) {
                console.warn("ATTENZIONE: L'URL non termina con .mp4");
                // Fallback: modifica l'estensione manualmente se necessario
                path = path.replace(/\.[^/.]+$/, '.mp4');
                console.log(`URL corretto manualmente: ${path}`);
              }
            } else {
              throw new Error("Upload MP4 non riuscito");
            }
          } else {
            console.warn("Impossibile estrarre l'ID pubblico dal path:", path);
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