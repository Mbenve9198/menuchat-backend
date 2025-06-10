const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Restaurant = require('../models/Restaurant');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class TemplateController {
  /**
   * Ottieni tutti i template per un ristorante
   */
  async getTemplates(req, res) {
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
            reviewPlatform: restaurant.reviewPlatform || 'google'
          }
        });
      }

      const templates = await WhatsAppTemplate.find({ 
        restaurant: restaurantId,
        isActive: true 
      }).sort({ createdAt: -1 });

      res.json({
        success: true,
        templates
      });
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch templates'
      });
    }
  }

  /**
   * Aggiorna un template esistente
   */
  async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
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

      if (!templateId) {
        return res.status(400).json({
          success: false,
          error: 'Template ID is required'
        });
      }

      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      // Aggiorna il messaggio
      template.components.body.text = messageBody;

      // Aggiorna i componenti in base al tipo
      if (messageType === 'media' && mediaUrl) {
        template.type = 'MEDIA';
        template.components.header = {
          type: 'DOCUMENT',
          format: 'DOCUMENT',
          example: mediaUrl
        };
        template.components.buttons = [];
      } else if (messageType === 'menu_url' && menuUrl) {
        template.type = 'CALL_TO_ACTION';
        template.components.header = { type: 'NONE' };
        template.components.buttons = [{
          type: 'URL',
          text: 'Menu',
          url: menuUrl
        }];
      } else if (messageType === 'review') {
        template.type = 'REVIEW';
        template.components.header = { type: 'NONE' };
        
        // Ottieni le impostazioni di recensione dal ristorante
        const restaurant = await Restaurant.findById(restaurantId);
        const reviewUrl = restaurant?.reviewLink || '';
        
        template.components.buttons = [{
          type: 'URL',
          text: reviewButtonText || 'Leave Review',
          url: reviewUrl
        }];
      }

      await template.save();

      // Se richiesto, aggiorna tutti i template nelle altre lingue
      if (updateAllLanguages) {
        const otherTemplates = await WhatsAppTemplate.find({
          restaurant: restaurantId,
          type: template.type,
          language: { $ne: language },
          isActive: true
        });

        for (const otherTemplate of otherTemplates) {
          // Traduci il messaggio per le altre lingue usando Claude
          const translatedMessage = await this.translateMessage(messageBody, otherTemplate.language);
          otherTemplate.components.body.text = translatedMessage;
          
          // Copia la stessa struttura
          otherTemplate.components.header = template.components.header;
          otherTemplate.components.buttons = template.components.buttons;
          
          await otherTemplate.save();
        }
      }

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Error updating template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update template'
      });
    }
  }

  /**
   * Aggiorna le impostazioni di recensione
   */
  async updateReviewSettings(req, res) {
    try {
      const { restaurantId, reviewLink, reviewPlatform } = req.body;

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

      restaurant.reviewLink = reviewLink;
      restaurant.reviewPlatform = reviewPlatform;
      await restaurant.save();

      // Aggiorna tutti i template di recensione con il nuovo URL
      const reviewTemplates = await WhatsAppTemplate.find({
        restaurant: restaurantId,
        type: 'REVIEW',
        isActive: true
      });

      let updatedTemplates = 0;
      for (const template of reviewTemplates) {
        if (template.components.buttons && template.components.buttons.length > 0) {
          template.components.buttons[0].url = reviewLink;
          await template.save();
          updatedTemplates++;
        }
      }

      res.json({
        success: true,
        message: 'Review settings updated successfully',
        updatedTemplates
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
      const { templateId } = req.params;
      const { 
        restaurantId, 
        language = 'en', 
        messageType,
        menuPdfUrl,
        menuUrl,
        reviewLink,
        reviewPlatform
      } = req.body;

      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          error: 'Restaurant not found'
        });
      }

      let newMessage = '';

      if (messageType === 'review') {
        // Rigenera messaggio di recensione
        const languageInstructions = {
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
              "Use appropriate emojis (max 2)",
              "Don't use generic phrases like \"leave a review\"",
              "Make it personal and engaging",
              "Use {{1}} as a placeholder for the customer's name (IMPORTANT: use exactly {{1}}, not {customerName} or other variations)"
            ],
            example: "Thanks for dining with us, {{1}}! 🌟 Your feedback helps us serve you better."
          },
          it: {
            welcomeText: "Crea un messaggio ottimizzato per richiedere recensioni a un ristorante. Il messaggio dovrebbe incoraggiare i clienti a lasciare una recensione cliccando su un pulsante che verrà mostrato sotto il messaggio.",
            requirements: [
              "Sii amichevole e conversazionale",
              "Mantieni il messaggio tra 100-120 caratteri",
              "Non menzionare o includere il link alla recensione (sarà in un pulsante sotto)",
              "Concentrati su uno di questi approcci:",
              "   - Ringrazia il cliente per il suo ordine",
              "   - Enfatizza come il feedback aiuta il ristorante a migliorare",
              "   - Sottolinea il valore delle opinioni dei clienti",
              "Usa emoji appropriate (massimo 2)",
              "Non usare frasi generiche come \"lascia una recensione\"",
              "Rendilo personale e coinvolgente",
              "Usa {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}}, non {customerName} o altre variazioni)"
            ],
            example: "Grazie per aver cenato da noi, {{1}}! 🌟 Il tuo feedback ci aiuta a servirti meglio."
          },
          fr: {
            welcomeText: "Créez un message optimisé pour demander un avis sur un restaurant. Le message devrait encourager les clients à laisser un avis en cliquant sur un bouton qui sera affiché sous le message.",
            requirements: [
              "Soyez amical et conversationnel",
              "Gardez le message entre 100 et 120 caractères",
              "Ne mentionnez pas et n'incluez pas le lien d'avis (il sera dans un bouton ci-dessous)",
              "Concentrez-vous sur l'une de ces approches :",
              "   - Remerciez le client pour sa commande",
              "   - Soulignez comment les commentaires aident le restaurant à s'améliorer",
              "   - Mettez en valeur l'importance des opinions des clients",
              "Utilisez des émojis appropriés (maximum 2)",
              "N'utilisez pas de phrases génériques comme \"laissez un avis\"",
              "Rendez-le personnel et engageant",
              "Utilisez {{1}} comme espace réservé pour le nom du client (IMPORTANT : utilisez exactement {{1}}, pas {customerName} ou autres variations)"
            ],
            example: "Merci d'avoir dîné chez nous, {{1}} ! 🌟 Vos commentaires nous aident à mieux vous servir."
          },
          de: {
            welcomeText: "Erstellen Sie eine optimierte Bewertungsanfrage für ein Restaurant. Die Nachricht sollte Kunden ermutigen, eine Bewertung abzugeben, indem sie auf eine Schaltfläche klicken, die unter der Nachricht angezeigt wird.",
            requirements: [
              "Seien Sie freundlich und gesprächig",
              "Halten Sie die Nachricht zwischen 100-120 Zeichen",
              "Erwähnen oder fügen Sie den Bewertungslink nicht ein (er wird in einer Schaltfläche unten angezeigt)",
              "Konzentrieren Sie sich auf einen dieser Ansätze:",
              "   - Danken Sie dem Kunden für seine Bestellung",
              "   - Betonen Sie, wie Feedback dem Restaurant hilft, sich zu verbessern",
              "   - Heben Sie den Wert der Kundenmeinungen hervor",
              "Verwenden Sie passende Emojis (maximal 2)",
              "Verwenden Sie keine generischen Phrasen wie \"Bewertung abgeben\"",
              "Machen Sie es persönlich und ansprechend",
              "Verwenden Sie {{1}} als Platzhalter für den Namen des Kunden (WICHTIG: Verwenden Sie genau {{1}}, nicht {customerName} oder andere Variationen)"
            ],
            example: "Danke für Ihren Besuch bei uns, {{1}}! 🌟 Ihr Feedback hilft uns, Sie besser zu bedienen."
          },
          es: {
            welcomeText: "Crea un mensaje optimizado para solicitar reseñas para un restaurante. El mensaje debe animar a los clientes a dejar una reseña haciendo clic en un botón que se mostrará debajo del mensaje.",
            requirements: [
              "Sé amigable y conversacional",
              "Mantén el mensaje entre 100-120 caracteres",
              "No menciones ni incluyas el enlace de reseña (estará en un botón debajo)",
              "Concéntrate en uno de estos enfoques:",
              "   - Agradece al cliente por su pedido",
              "   - Enfatiza cómo los comentarios ayudan al restaurante a mejorar",
              "   - Destaca el valor de las opiniones de los clientes",
              "Usa emojis apropiados (máximo 2)",
              "No uses frases genéricas como \"deja una reseña\"",
              "Hazlo personal y atractivo",
              "Usa {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}}, no {customerName} u otras variaciones)"
            ],
            example: "¡Gracias por cenar con nosotros, {{1}}! 🌟 Tus comentarios nos ayudan a servirte mejor."
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
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 500,
          temperature: 0.7,
          messages: [
            {
              role: "user",
              content: promptContent
            }
          ]
        });

        const rawResponse = response.content[0].text;
        newMessage = rawResponse.trim().replace(/^["']|["']$/g, "");

      } else if (messageType === 'media' || messageType === 'menu_url') {
        // Rigenera messaggio di menu usando la logica del setupController
        const languageInstructions = {
          en: {
            welcomeText: "Create a very brief welcome message (max 2-3 lines, 30 words max) for this restaurant:",
            context: "The menu will be automatically handled by the system - do NOT mention menu access, buttons, or attachments.",
            requirements: [
              "Maximum 30 words total",
              "Maximum 2-3 lines",
              "Include {{1}} as placeholder for customer's name (IMPORTANT: use exactly {{1}})",
              "Include restaurant name",
              "Add 1-2 relevant food emojis based on cuisine",
              "Focus on warm welcome and restaurant's specialty",
              "DO NOT mention menu, buttons, links, or attachments",
              "Keep it simple and friendly",
              "IMPORTANT: Return ONLY the message without quotes or explanations"
            ],
            example: "Hi {{1}}! Welcome to Luigi's 🍝\nOur homemade pasta is loved by hundreds of customers!"
          },
          it: {
            welcomeText: "Crea un messaggio di benvenuto molto breve (max 2-3 righe, 30 parole max) per questo ristorante:",
            context: "Il menu sarà gestito automaticamente dal sistema - NON menzionare accesso al menu, pulsanti o allegati.",
            requirements: [
              "Massimo 30 parole totali",
              "Massimo 2-3 righe",
              "Includi {{1}} come segnaposto per il nome del cliente (IMPORTANTE: usa esattamente {{1}})",
              "Includi il nome del ristorante",
              "Aggiungi 1-2 emoji di cibo pertinenti in base alla cucina",
              "Concentrati su un caloroso benvenuto e la specialità del ristorante",
              "NON menzionare menu, pulsanti, link o allegati",
              "Mantieni semplice e amichevole",
              "IMPORTANTE: Restituisci SOLO il messaggio senza virgolette o spiegazioni"
            ],
            example: "Ciao {{1}}! Benvenuto da Luigi's 🍝\nLa nostra pasta fatta in casa è amata da centinaia di clienti!"
          },
          fr: {
            welcomeText: "Créez un message d'accueil très bref (max 2-3 lignes, 30 mots max) pour ce restaurant :",
            context: "Le menu sera géré automatiquement par le système - NE PAS mentionner l'accès au menu, boutons ou pièces jointes.",
            requirements: [
              "Maximum 30 mots au total",
              "Maximum 2-3 lignes",
              "Incluez {{1}} comme espace réservé pour le nom du client (IMPORTANT : utilisez exactement {{1}})",
              "Incluez le nom du restaurant",
              "Ajoutez 1-2 émojis d'aliments pertinents selon la cuisine",
              "Concentrez-vous sur un accueil chaleureux et la spécialité du restaurant",
              "NE PAS mentionner menu, boutons, liens ou pièces jointes",
              "Restez simple et amical",
              "IMPORTANT : Retournez UNIQUEMENT le message sans guillemets ou explications"
            ],
            example: "Bonjour {{1}} ! Bienvenue chez Luigi's 🍝\nNos pâtes maison sont adorées par des centaines de clients !"
          },
          de: {
            welcomeText: "Erstellen Sie eine sehr kurze Willkommensnachricht (max. 2-3 Zeilen, 30 Wörter max) für dieses Restaurant:",
            context: "Das Menü wird automatisch vom System verwaltet - NICHT Menüzugang, Schaltflächen oder Anhänge erwähnen.",
            requirements: [
              "Maximal 30 Wörter insgesamt",
              "Maximal 2-3 Zeilen",
              "Fügen Sie {{1}} als Platzhalter für den Namen des Kunden ein (WICHTIG: Verwenden Sie genau {{1}})",
              "Nennen Sie den Namen des Restaurants",
              "Fügen Sie 1-2 relevante Lebensmittel-Emojis basierend auf der Küche hinzu",
              "Konzentrieren Sie sich auf einen warmen Empfang und die Spezialität des Restaurants",
              "NICHT Menü, Schaltflächen, Links oder Anhänge erwähnen",
              "Halten Sie es einfach und freundlich",
              "WICHTIG: Geben Sie NUR die Nachricht ohne Anführungszeichen oder Erklärungen zurück"
            ],
            example: "Hallo {{1}}! Willkommen bei Luigi's 🍝\nUnsere hausgemachte Pasta wird von Hunderten von Kunden geliebt!"
          },
          es: {
            welcomeText: "Crea un mensaje de bienvenida muy breve (máx. 2-3 líneas, 30 palabras máx.) para este restaurante:",
            context: "El menú será manejado automáticamente por el sistema - NO mencionar acceso al menú, botones o archivos adjuntos.",
            requirements: [
              "Máximo 30 palabras en total",
              "Máximo 2-3 líneas",
              "Incluye {{1}} como marcador de posición para el nombre del cliente (IMPORTANTE: usa exactamente {{1}})",
              "Incluye el nombre del restaurante",
              "Agrega 1-2 emojis de comida relevantes según la cocina",
              "Enfócate en una bienvenida cálida y la especialidad del restaurante",
              "NO mencionar menú, botones, enlaces o archivos adjuntos",
              "Mantenlo simple y amigable",
              "IMPORTANTE: Devuelve SOLO el mensaje sin comillas o explicaciones"
            ],
            example: "¡Hola {{1}}! Bienvenido a Luigi's 🍝\n¡Nuestra pasta casera es amada por cientos de clientes!"
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
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 500,
          temperature: 0.7,
          messages: [
            {
              role: "user",
              content: promptContent
            }
          ]
        });

        const rawResponse = response.content[0].text;
        newMessage = rawResponse.trim().replace(/^["']|["']$/g, "");
      }

      // Aggiorna il template con il nuovo messaggio
      template.components.body.text = newMessage;
      await template.save();

      res.json({
        success: true,
        template,
        newMessage
      });
    } catch (error) {
      console.error('Error regenerating message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to regenerate message'
      });
    }
  }

  /**
   * Traduce un messaggio in una lingua specifica
   */
  async translateMessage(message, targetLanguage) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 200,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: `Translate this message to ${targetLanguage} language, keeping the same tone and style. Preserve the {{1}} placeholder exactly as is:

"${message}"

Return only the translated message without quotes or explanations.`
          }
        ]
      });

      return response.content[0].text.trim().replace(/^["']|["']$/g, "");
    } catch (error) {
      console.error('Error translating message:', error);
      return message; // Fallback al messaggio originale
    }
  }
}

module.exports = new TemplateController(); 