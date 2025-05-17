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
      const isVideo = resource_type === 'video';
      
      console.log('isVideo:', isVideo);
      console.log('optimizeForWhatsApp:', optimizeForWhatsApp);
      
      if (isVideo && optimizeForWhatsApp) {
        try {
          console.log(`Ottimizzazione video per WhatsApp: ${originalname}`);
          
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
          
          /* 2️⃣ Usa sempre quell'URL */
          path = secure_url.replace(/\.(mov|quicktime)$/i, '.mp4');
          console.log('URL MP4 finale:', path);
          
          /* 3️⃣ Ora aggiungiamo fl_attachment per forzare il Content-Type pulito */
          // Modifica l'URL per includere fl_attachment nella trasformazione
          if (!path.includes('fl_attachment')) {
            // Cerca il pattern /upload/ e inserisci fl_attachment
            path = path.replace(/\/upload\//, '/upload/fl_attachment/');
            console.log('URL con fl_attachment:', path);
          }
          
          /* 4️⃣ Verifica dell'header Content-Type con una richiesta HEAD */
          try {
            const axios = require('axios');
            const head = await axios.head(path);
            const contentType = head.headers['content-type'];
            console.log('Content-Type dell\'URL:', contentType);
            
            // Verifica che il Content-Type sia corretto (video/mp4 senza parametri o con mp4a.40.2)
            if (contentType && !(/^video\/mp4(;.*mp4a\.40\.2)?$/i.test(contentType) || contentType === 'video/mp4')) {
              console.warn('⚠️ Content-Type non conforme:', contentType);
              console.log('URL potrebbe causare problemi con Twilio/WhatsApp');
              
              // Se l'header è ancora problematico, possiamo provare con resource_type: 'raw'
              if (contentType.includes('codecs=avc1') && !contentType.includes('mp4a.40.2')) {
                console.log('Tentativo di upload come raw per forzare Content-Type pulito...');
                
                // Download del file MP4
                const tempFile = `/tmp/video_${Date.now()}.mp4`;
                const fs = require('fs');
                const { data } = await axios.get(path, { responseType: 'arraybuffer' });
                fs.writeFileSync(tempFile, data);
                
                // Upload come raw con mime_type forzato
                const rawUploadResult = await cloudinary.uploader.upload(tempFile, {
                  resource_type: 'raw',
                  public_id: `${optimizedPublicId}_raw`,
                  folder: 'campaign-media',
                  access_mode: 'public',
                  type: 'upload',
                  format: 'mp4',
                  mime_type: 'video/mp4'
                });
                
                // Usa l'URL raw
                path = rawUploadResult.secure_url;
                console.log('URL raw con Content-Type forzato:', path);
                
                // Pulizia
                fs.unlinkSync(tempFile);
              }
            }
          } catch (headError) {
            console.error('Errore nella verifica Content-Type:', headError.message);
          }
        } catch (optimizationError) {
          console.error("Errore nell'ottimizzazione del video per WhatsApp:", optimizationError);
          // Continuiamo con l'URL originale se c'è un errore
        }
      } else if (isVideo) {
        // Se è un video ma non stiamo ottimizzando per WhatsApp, loghiamo il motivo
        console.log('Video non ottimizzato per WhatsApp perché:');
        if (!optimizeForWhatsApp) console.log('- Flag optimizeForWhatsApp non è true');
        if (resource_type !== 'video') console.log('- resource_type non è "video"');
      }
      
      /* 5️⃣ PRIMA di fare res.json, assicurati che sia .mp4 */
      if (!path.endsWith('.mp4') && (isVideo || originalname.endsWith('.mp4') || originalname.endsWith('.mov'))) {
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