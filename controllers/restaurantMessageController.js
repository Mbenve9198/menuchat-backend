const RestaurantMessage = require('../models/RestaurantMessage');
const Restaurant = require('../models/Restaurant');
const BotConfiguration = require('../models/BotConfiguration');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class RestaurantMessageController {
  /**
   * Ottieni tutti i messaggi per un ristorante
   */
  async getMessages(req, res) {
    try {
      const { restaurantId } = req.query;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant ID is required'
        });
      }

      // Se viene richiesto solo reviewSettings
      if (req.query.reviewSettings === 'true') {
        const restaurant = await Restaurant.findById(restaurantId);
        const botConfig = await BotConfiguration.findOne({ restaurant: restaurantId });
        
        if (!restaurant) {
          return res.status(404).json({
            success: false,
            error: 'Restaurant not found'
          });
        }

        return res.json({
          success: true,
          reviewSettings: {
            reviewLink: restaurant.reviewLink || '',
            reviewPlatform: restaurant.reviewPlatform || 'google',
            reviewTimer: botConfig?.reviewTimer || 120, // Default 2 ore
            messagingHours: {
              enabled: botConfig?.messagingHours?.enabled ?? true,
              startHour: botConfig?.messagingHours?.startHour ?? 9,
              endHour: botConfig?.messagingHours?.endHour ?? 23,
              timezone: botConfig?.messagingHours?.timezone || 'Europe/Rome'
            }
          }
        });
      }

      const messages = await RestaurantMessage.find({ 
        restaurant: restaurantId,
        isActive: true 
      }).populate('restaurant', 'name').sort({ createdAt: -1 });

      res.json({
        success: true,
        messages: messages
      });
    } catch (error) {
      console.error('Error fetching restaurant messages:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch messages'
      });
    }
  }

  /**
   * Aggiorna un messaggio esistente
   */
  async updateMessage(req, res) {
    try {
      const { messageId } = req.params;
      const { 
        messageBody, 
        messageType, 
        menuUrl, 
        mediaUrl, 
        language,
        restaurantId,
        reviewButtonText,
        updateAllLanguages = false
      } = req.body;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          error: 'Message ID is required'
        });
      }

      const message = await RestaurantMessage.findById(messageId);
      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'Message not found'
        });
      }

      // Se updateAllLanguages è true, traduci e aggiorna tutti i messaggi dello stesso tipo
      if (updateAllLanguages) {
        // Trova tutti i messaggi dello stesso tipo per questo ristorante
        const allMessages = await RestaurantMessage.find({
          restaurant: message.restaurant,
          messageType: message.messageType,
          isActive: true
        });

        // Traduci il messaggio per ogni lingua
        for (const msg of allMessages) {
          let translatedMessage = messageBody;
          
          // Se la lingua è diversa da quella originale, traduci
          if (msg.language !== language) {
            try {
              const translationPrompt = `You are a professional translator. Translate the following ${message.messageType === 'review' ? 'review request' : 'restaurant welcome'} message from ${language} to ${msg.language}. 

IMPORTANT: Return ONLY the translated text, no explanations, no quotes, no additional text.

Rules:
- Keep the same tone, style, and formatting
- Preserve any placeholders like {{1}} exactly as they are
- Keep emojis and maintain the same message structure
- Return only the translated message text

Original message (${language}):
${messageBody}

Translated message (${msg.language}):`;

              const response = await anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 500,
                temperature: 0.3,
                messages: [
                  {
                    role: "user",
                    content: translationPrompt
                  }
                ]
              });

              translatedMessage = response.content[0].text.trim();
            } catch (translationError) {
              console.error(`Error translating to ${msg.language}:`, translationError);
              // Se la traduzione fallisce, usa il messaggio originale
              translatedMessage = messageBody;
            }
          }

          // Aggiorna il messaggio con la traduzione
          await RestaurantMessage.findByIdAndUpdate(msg._id, {
            $set: {
              messageBody: translatedMessage,
              lastModified: new Date(),
              modifiedBy: 'claude-translation'
            }
          });
        }

        // Aggiorna anche gli URL/media per tutti i messaggi
        if (messageType === 'media' && mediaUrl) {
          await RestaurantMessage.updateMany(
            {
              restaurant: message.restaurant,
              messageType: 'menu',
              isActive: true
            },
            {
              $set: {
                mediaUrl: mediaUrl,
                mediaType: 'pdf'
              },
              $unset: {
                ctaUrl: "",
                ctaText: ""
              }
            }
          );
        } else if ((messageType === 'menu_url' || messageType === 'menu') && menuUrl) {
          await RestaurantMessage.updateMany(
            {
              restaurant: message.restaurant,
              messageType: 'menu',
              isActive: true
            },
            {
              $set: {
                ctaUrl: menuUrl,
                ctaText: '🔗 Menu'
              },
              $unset: {
                mediaUrl: "",
                mediaType: ""
              }
            }
          );
        }
      } else {
        // Aggiorna solo il messaggio specifico
        message.messageBody = messageBody;
        message.lastModified = new Date();
        message.modifiedBy = 'user';

        // Aggiorna in base al tipo
        if (messageType === 'media' && mediaUrl) {
          message.mediaUrl = mediaUrl;
          message.mediaType = 'pdf';
          message.ctaUrl = undefined;
          message.ctaText = undefined;
        } else if ((messageType === 'menu_url' || messageType === 'menu') && menuUrl) {
          message.ctaUrl = menuUrl;
          message.ctaText = '🔗 Menu';
          message.mediaUrl = undefined;
          message.mediaType = undefined;
        } else if (messageType === 'review') {
          message.ctaText = reviewButtonText || '⭐ Lascia una recensione';
          
          // Ottieni le impostazioni di recensione dal ristorante
          const restaurant = await Restaurant.findById(restaurantId || message.restaurant);
          if (restaurant?.reviewLink) {
            message.ctaUrl = restaurant.reviewLink;
          }
        }

        await message.save();
      }

      res.json({
        success: true,
        message: 'Message updated successfully'
      });
    } catch (error) {
      console.error('Error updating message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update message'
      });
    }
  }

  /**
   * Aggiorna le impostazioni di recensione
   */
  async updateReviewSettings(req, res) {
    try {
      const { 
        restaurantId, 
        reviewLink, 
        reviewPlatform, 
        reviewTimer,
        messagingHours
      } = req.body;

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          error: 'Restaurant ID is required'
        });
      }

      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Restaurant not found'
        });
      }

      // Aggiorna le impostazioni del ristorante
      if (reviewLink !== undefined) restaurant.reviewLink = reviewLink;
      if (reviewPlatform !== undefined) restaurant.reviewPlatform = reviewPlatform;
      await restaurant.save();

      // Aggiorna il reviewTimer e le fasce orarie nella BotConfiguration
      let botConfig = await BotConfiguration.findOne({ restaurant: restaurantId });
      
      if (botConfig) {
        // Aggiorna reviewTimer se fornito
        if (reviewTimer !== undefined) {
          botConfig.reviewTimer = reviewTimer;
        }
        
        // Aggiorna le fasce orarie se fornite
        if (messagingHours !== undefined) {
          if (!botConfig.messagingHours) {
            botConfig.messagingHours = {};
          }
          
          if (messagingHours.enabled !== undefined) {
            botConfig.messagingHours.enabled = messagingHours.enabled;
          }
          if (messagingHours.startHour !== undefined) {
            botConfig.messagingHours.startHour = Math.max(0, Math.min(23, messagingHours.startHour));
          }
          if (messagingHours.endHour !== undefined) {
            botConfig.messagingHours.endHour = Math.max(0, Math.min(23, messagingHours.endHour));
          }
          if (messagingHours.timezone !== undefined) {
            botConfig.messagingHours.timezone = messagingHours.timezone;
          }
        }
        
        await botConfig.save();
      } else {
        console.warn(`BotConfiguration non trovata per il ristorante ${restaurantId}`);
      }

      // Aggiorna tutti i messaggi di recensione con il nuovo URL se fornito
      let updatedMessages = { modifiedCount: 0 };
      if (reviewLink !== undefined) {
        updatedMessages = await RestaurantMessage.updateMany(
          {
            restaurant: restaurantId,
            messageType: 'review',
            isActive: true
          },
          {
            $set: {
              ctaUrl: reviewLink,
              lastModified: new Date(),
              modifiedBy: 'user'
            }
          }
        );
      }

      res.json({
        success: true,
        message: 'Review settings updated successfully',
        updatedTemplates: updatedMessages.modifiedCount
      });
    } catch (error) {
      console.error('Error updating review settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update review settings'
      });
    }
  }

  /**
   * Rigenera un messaggio usando Claude AI
   */
  async regenerateMessage(req, res) {
    try {
      const { messageId } = req.params;
      const { 
        restaurantId, 
        language = 'it', 
        messageType,
        menuPdfUrl,
        menuUrl,
        reviewLink,
        reviewPlatform
      } = req.body;

      const message = await RestaurantMessage.findById(messageId);
      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'Message not found'
        });
      }

      const restaurant = await Restaurant.findById(restaurantId || message.restaurant);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Restaurant not found'
        });
      }

      let newMessage = '';

      if (message.messageType === 'review') {
        // Prompt per messaggi di recensione
        const languageInstructions = {
          it: {
            welcomeText: "Crea un messaggio ottimizzato per richiedere recensioni per un ristorante. Il messaggio deve incoraggiare i clienti a lasciare una recensione cliccando su un pulsante che verrà mostrato sotto il messaggio.",
            requirements: [
              "Sii amichevole e colloquiale",
              "Mantieni il messaggio tra 100-120 caratteri",
              "Non menzionare né includere il link di recensione (sarà in un pulsante sotto)",
              "Concentrati su uno di questi approcci:",
              "   - Ringrazia il cliente per il suo ordine",
              "   - Enfatizza come i feedback aiutano il ristorante a migliorare",
              "   - Evidenzia il valore delle opinioni dei clienti",
              "Usa emoji appropriati (massimo 2)",
              "Non usare frasi generiche come \"lascia una recensione\"",
              "Rendilo personale e coinvolgente",
              "Usa {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}}, non {customerName} o altre variazioni)"
            ],
            example: "Grazie per aver cenato da noi, {{1}}! 🌟 I tuoi commenti ci aiutano a servirti meglio."
          },
          en: {
            welcomeText: "Create an optimized review request message for a restaurant. The message should encourage customers to leave a review by clicking a button that will be shown below the message.",
            requirements: [
              "Be friendly and conversational",
              "Keep the message between 100-120 characters",
              "Don't mention or include the review link (it will be in a button below)",
              "Focus on one of these approaches:",
              "   - Thank the customer for their order",
              "   - Emphasize how feedback helps the restaurant improve",
              "   - Highlight the value of customer opinions",
              "Use appropriate emojis (maximum 2)",
              "Don't use generic phrases like \"leave a review\"",
              "Make it personal and engaging",
              "Use {{1}} as placeholder for customer name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)"
            ],
            example: "Thanks for dining with us, {{1}}! 🌟 Your feedback helps us serve you better."
          }
        };

        const langInstructions = languageInstructions[language] || languageInstructions.en;

        const promptContent = `${langInstructions.welcomeText}

Restaurant Name: ${restaurant.name}
Rating: ${restaurant.googleRating?.rating || 'N/A'}/5 (${restaurant.googleRating?.ratingsTotal || 0} reviews)
Cuisine: ${restaurant.cuisineTypes?.join(', ') || 'Various'}

Requirements:
${langInstructions.requirements.map(req => req).join('\n')}

${language !== 'en' ? `IMPORTANT: The message MUST be in ${language} language.` : ''}

Example:
${langInstructions.example}`;

        const response = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 500,
          temperature: 0.7,
          messages: [
            {
              role: "user",
              content: promptContent
            }
          ]
        });

        newMessage = response.content[0].text.trim();
      } else {
        // Prompt per messaggi di menu
        const languageInstructions = {
          it: {
            welcomeText: "Crea un messaggio di benvenuto molto breve (max. 2-3 righe, 30 parole max.) per questo ristorante:",
            context: "Il menu sarà gestito automaticamente dal sistema - NON menzionare accesso al menu, pulsanti o allegati.",
            requirements: [
              "Massimo 30 parole in totale",
              "Massimo 2-3 righe",
              "Includi {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}})",
              "Includi il nome del ristorante",
              "Aggiungi 1-2 emoji di cibo rilevanti in base alla cucina",
              "Concentrati su un benvenuto caloroso e la specialità del ristorante",
              "NON menzionare menu, pulsanti, link o allegati",
              "Mantienilo semplice e amichevole",
              "IMPORTANTE: Restituisci SOLO il messaggio senza virgolette o spiegazioni"
            ],
            example: "Ciao {{1}}! Benvenuto da Luigi's 🍝\nLa nostra pasta fatta in casa è amata da centinaia di clienti!"
          },
          en: {
            welcomeText: "Create a very brief welcome message (max. 2-3 lines, 30 words max.) for this restaurant:",
            context: "The menu will be handled automatically by the system - DO NOT mention menu access, buttons, or attachments.",
            requirements: [
              "Maximum 30 words total",
              "Maximum 2-3 lines",
              "Include {{1}} as placeholder for customer name (IMPORTANT: use exactly {{1}})",
              "Include the restaurant name",
              "Add 1-2 relevant food emojis based on cuisine",
              "Focus on warm welcome and restaurant specialty",
              "DO NOT mention menu, buttons, links, or attachments",
              "Keep it simple and friendly",
              "IMPORTANT: Return ONLY the message without quotes or explanations"
            ],
            example: "Hi {{1}}! Welcome to Luigi's 🍝\nOur homemade pasta is loved by hundreds of customers!"
          }
        };

        const langInstructions = languageInstructions[language] || languageInstructions.en;

        const promptContent = `${langInstructions.welcomeText}

Restaurant Name: ${restaurant.name}
Rating: ${restaurant.googleRating?.rating || 'N/A'}/5 (${restaurant.googleRating?.ratingsTotal || 0} reviews)
Cuisine: ${restaurant.cuisineTypes?.join(', ') || 'Various'}

Context: ${langInstructions.context}

Requirements:
${langInstructions.requirements.map(req => req).join('\n')}

${language !== 'en' ? `IMPORTANT: The message MUST be in ${language} language.` : ''}

Example:
${langInstructions.example}`;

        const response = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 500,
          temperature: 0.7,
          messages: [
            {
              role: "user",
              content: promptContent
            }
          ]
        });

        newMessage = response.content[0].text.trim();
      }

      // Aggiorna il messaggio
      message.messageBody = newMessage;
      message.lastModified = new Date();
      message.modifiedBy = 'claude';
      await message.save();

      res.json({
        success: true,
        message: 'Message regenerated successfully',
        newMessage: newMessage
      });
    } catch (error) {
      console.error('Error regenerating message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to regenerate message'
      });
    }
  }
}

module.exports = new RestaurantMessageController(); 