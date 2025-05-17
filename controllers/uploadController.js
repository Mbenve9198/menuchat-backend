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
      
      // Verifica parametri richiesta
      console.log('DEBUG - Parametri richiesta:');
      console.log('body:', req.body);
      console.log('resource_type:', resource_type);
      console.log('originalname:', originalname);
      console.log('URL iniziale:', path);
      
      // Verifica se è un video e se è richiesta l'ottimizzazione per WhatsApp
      const noTransformations = req.body.noTransformations === 'true';
      const optimizeForWhatsApp = req.body.optimizeForWhatsApp === 'true';
      const isVideo = resource_type === 'video' || originalname.endsWith('.mp4') || originalname.endsWith('.mov');
      
      console.log('isVideo:', isVideo);
      console.log('optimizeForWhatsApp:', optimizeForWhatsApp);
      
      if (isVideo && optimizeForWhatsApp) {
        try {
          console.log(`Ottimizzazione video per WhatsApp: ${originalname}`);
          
          // Verifica con una richiesta HEAD se il Content-Type è già pulito
          const axios = require('axios');
          
          try {
            const headResponse = await axios.head(path);
            const contentType = headResponse.headers['content-type'];
            console.log('Content-Type dell\'URL originale:', contentType);
            
            // Se il Content-Type contiene il parametro codecs, dobbiamo creare un nuovo asset
            if (contentType && contentType.includes('codecs=')) {
              console.log('Content-Type contiene parametri codec, è necessario creare un nuovo asset');
              
              // Estrai il public_id originale dall'URL
              const match = path.match(/\/upload\/v\d+\/(.+)\.\w+$/);
              if (!match) {
                console.warn("Impossibile estrarre l'ID pubblico dal path:", path);
                throw new Error("Formato URL non riconosciuto");
              }
              
              const originalPublicId = match[1];
              const optimizedPublicId = `${originalPublicId}_whatsapp_optimized`;
              
              console.log("Creazione asset MP4 per WhatsApp:", optimizedPublicId);
              
              /* 1️⃣ UNICO upload: crea davvero l'asset .mp4 */
              const { secure_url } = await cloudinary.uploader.upload(path, {
                resource_type: 'video',
                public_id: optimizedPublicId,
                format: 'mp4',
                overwrite: true,
                transformation: 'q_70,vc_h264:baseline:3.1,ac_aac,br_2m,fl_faststart'
              });
              
              // Verifica il Content-Type del nuovo URL
              const newHeadResponse = await axios.head(secure_url);
              const newContentType = newHeadResponse.headers['content-type'];
              console.log('Content-Type del nuovo asset:', newContentType);
              
              // Se contiene ancora codecs, dobbiamo creare un raw asset
              if (newContentType && newContentType.includes('codecs=')) {
                console.log('Ancora problemi di Content-Type, creiamo un asset raw');
                
                // Scarica il file
                const fileResponse = await axios.get(secure_url, { responseType: 'arraybuffer' });
                const tempFilePath = `/tmp/${optimizedPublicId}.mp4`;
                require('fs').writeFileSync(tempFilePath, Buffer.from(fileResponse.data));
                
                // Carica come raw
                const rawResult = await cloudinary.uploader.upload(tempFilePath, {
                  resource_type: 'raw',
                  public_id: `${optimizedPublicId}_raw`,
                  folder: 'campaign-media',
                  type: 'upload'
                });
                
                // Elimina il file temporaneo
                require('fs').unlinkSync(tempFilePath);
                
                // Usa l'URL raw
                path = rawResult.secure_url;
                console.log('URL raw per WhatsApp:', path);
              } else {
                // Usa l'URL trascodificato
                path = secure_url;
                console.log('URL trascodificato per WhatsApp:', path);
              }
            } else {
              console.log('Content-Type già pulito, non serve ricaricare');
            }
          } catch (headError) {
            console.warn('Errore nella verifica del Content-Type:', headError.message);
            // Continuiamo con l'approccio standard
          }
              
          /* 2️⃣ Assicurati che termini con .mp4 */
          if (!path.endsWith('.mp4')) {
            path = path.replace(/\.\w+$/, '.mp4');
            console.log('URL corretto con estensione .mp4:', path);
          }
          
          /* 3️⃣ Verifica finale */
          console.log('URL MP4 finale:', path);
        } catch (err) {
          console.error('Ottimizzazione WhatsApp fallita:', err);
        }
      } else if (isVideo) {
        // Se è un video ma non stiamo ottimizzando per WhatsApp, loghiamo il motivo
        console.log('Video non ottimizzato per WhatsApp perché:');
        if (!optimizeForWhatsApp) console.log('- Flag optimizeForWhatsApp non è true');
      }
      
      /* 4️⃣ Assicurati che sia .mp4 */
      if (isVideo && !path.endsWith('.mp4')) {
        path = path.replace(/\.\w+$/, '.mp4');
        console.log('URL corretto a .mp4:', path);
      }
      
      console.log('URL restituito al client:', path);
      
      // Restituisci l'URL del file caricato e altre informazioni
      res.status(200).json({
        success: true,
        file: {
          url: path,
          originalName: originalname,
          size: size,
          format: isVideo ? 'mp4' : format, // Forza formato mp4 per i video
          resourceType: isVideo ? 'video' : resource_type,
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