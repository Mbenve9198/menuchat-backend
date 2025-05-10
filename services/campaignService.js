const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const twilioService = require('./twilioService');

/**
 * Service per la gestione delle campagne marketing
 */
class CampaignService {
  /**
   * Controlla e avvia le campagne pianificate pronte per l'invio
   * @returns {Promise<Array>} - Lista delle campagne avviate
   */
  async checkAndRunScheduledCampaigns() {
    try {
      console.log('===== CHECKING SCHEDULED CAMPAIGNS =====');
      const now = new Date();
      
      // Trova le campagne pianificate che devono essere inviate ora
      const campaignsDue = await Campaign.find({
        status: 'scheduled',
        scheduledFor: { $lte: now },
        isActive: true,
        twilioTemplateStatus: 'APPROVED',
        recipientsCount: { $gt: 0 }
      }).populate({
        path: 'twilioTemplateId',
        select: 'twilioTemplateId'
      });
      
      console.log(`Found ${campaignsDue.length} campaigns ready to send`);
      
      if (campaignsDue.length === 0) {
        return [];
      }
      
      const startedCampaigns = [];
      
      // Avvia l'invio di ogni campagna
      for (const campaign of campaignsDue) {
        try {
          campaign.status = 'sending';
          await campaign.save();
          
          // Avvia l'invio in background
          this.sendCampaign(campaign._id).catch(error => {
            console.error(`Error in background sending of campaign ${campaign._id}:`, error);
          });
          
          startedCampaigns.push({
            id: campaign._id,
            name: campaign.name,
            recipientsCount: campaign.recipientsCount
          });
        } catch (error) {
          console.error(`Error starting campaign ${campaign._id}:`, error);
        }
      }
      
      return startedCampaigns;
    } catch (error) {
      console.error('Error checking scheduled campaigns:', error);
      throw error;
    }
  }
  
  /**
   * Invia una campagna ai suoi destinatari
   * @param {string} campaignId - ID della campagna da inviare
   * @returns {Promise<Object>} - Risultato dell'invio
   */
  async sendCampaign(campaignId) {
    try {
      // Carica la campagna con i destinatari
      const campaign = await Campaign.findById(campaignId)
        .populate({
          path: 'twilioTemplateId',
          select: 'twilioTemplateId name isActive'
        });
      
      if (!campaign) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }
      
      if (campaign.status !== 'sending') {
        throw new Error(`Campaign not in sending state: ${campaignId}`);
      }
      
      if (!campaign.twilioTemplateId || !campaign.twilioTemplateId.twilioTemplateId || !campaign.twilioTemplateId.isActive) {
        campaign.status = 'failed';
        campaign.error = 'Template Twilio non trovato o non attivo';
        await campaign.save();
        throw new Error(`Invalid Twilio template for campaign: ${campaignId}`);
      }
      
      console.log(`Starting to send campaign ${campaignId} to ${campaign.recipientsCount} recipients`);
      
      // Recupera i destinatari completi
      const populatedCampaign = await Campaign.findById(campaignId)
        .populate({
          path: 'recipients.contact',
          select: 'phoneNumber name'
        });
      
      let sentCount = 0;
      let errorCount = 0;
      
      for (const recipient of populatedCampaign.recipients) {
        if (recipient.sent) {
          continue; // Skip già inviati
        }
        
        try {
          // Invia il messaggio tramite il template
          const result = await twilioService.sendTemplateMessage(
            recipient.contact.phoneNumber,
            campaign.twilioTemplateId.twilioTemplateId,
            { 1: recipient.contact.name }, // Variabili del template
            campaign.restaurant
          );
          
          // Aggiorna lo stato del destinatario
          const recipientIndex = campaign.recipients.findIndex(r => r.contact.equals(recipient.contact._id));
          if (recipientIndex !== -1) {
            campaign.recipients[recipientIndex].sent = result.success;
            campaign.recipients[recipientIndex].sentAt = new Date();
            campaign.recipients[recipientIndex].error = result.success ? null : (result.error || 'Errore sconosciuto');
            
            if (result.success) {
              sentCount++;
            } else {
              errorCount++;
            }
          }
          
          // Aggiorna la campagna ogni 10 invii o all'ultimo invio
          if (sentCount % 10 === 0 || sentCount + errorCount === campaign.recipientsCount) {
            campaign.sentCount = sentCount;
            campaign.stats.deliveryRate = sentCount / campaign.recipientsCount;
            campaign.stats.errorRate = errorCount / campaign.recipientsCount;
            await campaign.save();
          }
          
          // Piccolo ritardo per non sovraccaricare l'API Twilio
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (sendError) {
          console.error(`Error sending to recipient ${recipient.contact._id}:`, sendError);
          
          // Aggiorna lo stato del destinatario con l'errore
          const recipientIndex = campaign.recipients.findIndex(r => r.contact.equals(recipient.contact._id));
          if (recipientIndex !== -1) {
            campaign.recipients[recipientIndex].sent = false;
            campaign.recipients[recipientIndex].error = sendError.message || 'Errore nell\'invio';
            errorCount++;
          }
        }
      }
      
      // Aggiorna lo stato finale della campagna
      campaign.sentCount = sentCount;
      campaign.stats.deliveryRate = sentCount / campaign.recipientsCount;
      campaign.stats.errorRate = errorCount / campaign.recipientsCount;
      campaign.status = sentCount > 0 ? 'completed' : 'failed';
      
      if (errorCount > 0 && sentCount === 0) {
        campaign.error = `Nessun messaggio inviato. ${errorCount} errori.`;
      } else if (errorCount > 0) {
        campaign.error = `${errorCount} messaggi non inviati.`;
      }
      
      await campaign.save();
      
      console.log(`Campaign ${campaignId} completed: ${sentCount} sent, ${errorCount} errors`);
      
      return {
        campaignId,
        sentCount,
        errorCount,
        status: campaign.status
      };
    } catch (error) {
      console.error(`Error sending campaign ${campaignId}:`, error);
      
      // Aggiorna lo stato della campagna in caso di errore
      try {
        await Campaign.findByIdAndUpdate(campaignId, {
          status: 'failed',
          error: error.message || 'Errore nell\'invio della campagna'
        });
      } catch (updateError) {
        console.error(`Error updating campaign status:`, updateError);
      }
      
      throw error;
    }
  }
}

module.exports = new CampaignService(); 