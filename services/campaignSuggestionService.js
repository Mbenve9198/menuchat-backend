const Anthropic = require('@anthropic-ai/sdk');
const CampaignSuggestion = require('../models/CampaignSuggestion');
const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');

class CampaignSuggestionService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Genera un suggerimento di campagna per un ristorante
   */
  async generateCampaignSuggestion(restaurantId, userId) {
    try {
      console.log(`🤖 Generazione suggerimento campagna per ristorante ${restaurantId}`);

      // Recupera i dati del ristorante e dell'utente
      const [restaurant, user] = await Promise.all([
        Restaurant.findById(restaurantId).lean(),
        User.findById(userId).lean()
      ]);

      if (!restaurant || !user) {
        throw new Error('Ristorante o utente non trovato');
      }

      // Recupera le campagne recenti (ultime 10)
      const recentCampaigns = await WhatsAppCampaign.find({
        restaurant: restaurantId
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('template')
      .lean();

      // Recupera i suggerimenti precedenti (ultimi 5)
      const previousSuggestions = await CampaignSuggestion.find({
        restaurant: restaurantId
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

      // Prepara il contesto per l'AI
      const context = this.prepareContextForAI(restaurant, recentCampaigns, previousSuggestions, user.languagePreference);

      // Genera il suggerimento usando Anthropic
      const suggestion = await this.callAnthropicForSuggestion(context, user.languagePreference);

      // Salva il suggerimento nel database
      const campaignSuggestion = new CampaignSuggestion({
        restaurant: restaurantId,
        user: userId,
        suggestion,
        context: {
          restaurantInfo: {
            name: restaurant.name,
            cuisineTypes: restaurant.cuisineTypes,
            address: restaurant.address,
            googleRating: restaurant.googleRating
          },
          recentCampaigns: recentCampaigns.map(c => c._id),
          previousSuggestions: previousSuggestions.map(s => s._id),
          performanceMetrics: context.performanceMetrics
        },
        language: user.languagePreference,
        status: 'generated'
      });

      await campaignSuggestion.save();

      console.log(`✅ Suggerimento campagna generato con successo per ${restaurant.name}`);
      return campaignSuggestion;

    } catch (error) {
      console.error(`❌ Errore nella generazione del suggerimento:`, error);
      throw error;
    }
  }

  /**
   * Prepara il contesto per l'AI
   */
  prepareContextForAI(restaurant, recentCampaigns, previousSuggestions, language) {
    // Analizza le performance delle campagne recenti
    const campaignPerformance = this.analyzeCampaignPerformance(recentCampaigns);
    
    // Calcola metriche del ristorante
    const restaurantMetrics = {
      totalReviews: restaurant.googleRating?.reviewCount || 0,
      averageRating: restaurant.googleRating?.rating || 0,
      cuisineTypes: restaurant.cuisineTypes || [],
      location: restaurant.address?.city || 'Non specificata'
    };

    return {
      restaurant: {
        name: restaurant.name,
        cuisineTypes: restaurant.cuisineTypes || [],
        location: restaurant.address?.city || 'Non specificata',
        rating: restaurant.googleRating?.rating || 0,
        reviewCount: restaurant.googleRating?.reviewCount || 0
      },
      recentCampaigns: recentCampaigns.map(campaign => ({
        name: campaign.name,
        type: campaign.template?.type || 'unknown',
        status: campaign.status,
        sentCount: campaign.statistics?.sentCount || 0,
        deliveredCount: campaign.statistics?.deliveredCount || 0,
        createdAt: campaign.createdAt
      })),
      previousSuggestions: previousSuggestions.map(suggestion => ({
        title: suggestion.suggestion.title,
        campaignType: suggestion.suggestion.campaignType,
        status: suggestion.status,
        createdAt: suggestion.createdAt
      })),
      performanceMetrics: campaignPerformance,
      language
    };
  }

  /**
   * Analizza le performance delle campagne recenti
   */
  analyzeCampaignPerformance(campaigns) {
    if (!campaigns.length) {
      return {
        totalCampaigns: 0,
        averageDeliveryRate: 0,
        mostUsedType: 'promo',
        lastCampaignDate: null
      };
    }

    const totalSent = campaigns.reduce((sum, c) => sum + (c.statistics?.sentCount || 0), 0);
    const totalDelivered = campaigns.reduce((sum, c) => sum + (c.statistics?.deliveredCount || 0), 0);
    
    // Trova il tipo di campagna più utilizzato
    const typeCount = {};
    campaigns.forEach(campaign => {
      const type = campaign.template?.type || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
    
    const mostUsedType = Object.keys(typeCount).reduce((a, b) => 
      typeCount[a] > typeCount[b] ? a : b, 'promo'
    );

    return {
      totalCampaigns: campaigns.length,
      averageDeliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
      mostUsedType,
      lastCampaignDate: campaigns[0]?.createdAt || null
    };
  }

  /**
   * Chiama Anthropic per generare il suggerimento
   */
  async callAnthropicForSuggestion(context, language = 'italiano') {
    const prompts = {
      italiano: this.getItalianPrompt(context),
      english: this.getEnglishPrompt(context),
      español: this.getSpanishPrompt(context)
    };

    const prompt = prompts[language] || prompts.italiano;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

      const rawResponse = response.content[0].text;
      console.log("Claude raw response for campaign suggestion:", rawResponse);

      // Estrai l'oggetto JSON dalla risposta
      let suggestionData;
      try {
        // Cerca il JSON nella risposta
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          suggestionData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Nessun JSON trovato nella risposta');
        }
      } catch (parseError) {
        console.error('Errore nel parsing della risposta JSON:', parseError);
        throw new Error('Formato di risposta non valido da Anthropic');
      }

      // Valida la struttura del suggerimento
      this.validateSuggestionStructure(suggestionData);

      return suggestionData;

    } catch (error) {
      console.error('Errore nella chiamata ad Anthropic:', error);
      throw error;
    }
  }

  /**
   * Prompt in italiano
   */
  getItalianPrompt(context) {
    return `Sei un esperto di marketing per ristoranti. Analizza i dati del ristorante e genera un suggerimento per una nuova campagna WhatsApp.

DATI DEL RISTORANTE:
- Nome: ${context.restaurant.name}
- Tipo di cucina: ${context.restaurant.cuisineTypes.join(', ')}
- Località: ${context.restaurant.location}
- Rating Google: ${context.restaurant.rating}/5 (${context.restaurant.reviewCount} recensioni)

CAMPAGNE RECENTI:
${context.recentCampaigns.map(c => `- ${c.name} (${c.type}, status: ${c.status}, inviati: ${c.sentCount})`).join('\n')}

SUGGERIMENTI PRECEDENTI:
${context.previousSuggestions.map(s => `- ${s.title} (${s.campaignType}, status: ${s.status})`).join('\n')}

PERFORMANCE:
- Campagne totali: ${context.performanceMetrics.totalCampaigns}
- Tasso di consegna medio: ${context.performanceMetrics.averageDeliveryRate.toFixed(1)}%
- Tipo più utilizzato: ${context.performanceMetrics.mostUsedType}

ISTRUZIONI:
1. Analizza i dati e identifica opportunità per una nuova campagna
2. Evita di suggerire campagne simili a quelle recenti o già suggerite
3. Considera la stagionalità e il tipo di cucina
4. Fornisci istruzioni dettagliate e actionable specifiche per la nostra app
5. Il suggerimento deve essere specifico per questo ristorante

IMPORTANTE: Le istruzioni passo-passo devono essere specifiche per il nostro wizard di creazione campagne che ha questi 4 step:
1. Selezione Contatti (ricerca, filtri per paese, selezione multipla)
2. Setup Campagna (tipo: promo/event/update/feedback, lingua, obiettivo dettagliato)
3. Creazione Contenuto (messaggio AI, media opzionali, CTA primaria/secondaria)
4. Programmazione (invio immediato o programmato con data/ora)

Restituisci SOLO un oggetto JSON con questa struttura esatta:
{
  "title": "Titolo accattivante del suggerimento",
  "description": "Descrizione dettagliata della campagna (2-3 frasi)",
  "campaignType": "promo|event|update|feedback",
  "targetAudience": "Descrizione del target audience specifico",
  "messageTemplate": "Template del messaggio WhatsApp con {{1}} per il nome",
  "timing": "Quando inviare la campagna (es: 'Martedì sera alle 18:00')",
  "expectedResults": "Risultati attesi specifici e misurabili",
  "stepByStepInstructions": [
    {
      "step": 1,
      "title": "Seleziona i tuoi contatti",
      "description": "Identifica e seleziona i clienti giusti per questa campagna",
      "actionRequired": "Nella sezione 'Selezione Contatti', usa la ricerca per trovare clienti specifici (es: cerca 'pizza' per clienti che ordinano spesso pizza) oppure filtra per paese se vuoi targetizzare una specifica nazionalità. Seleziona tutti i contatti rilevanti per il tuo target."
    },
    {
      "step": 2,
      "title": "Configura la campagna",
      "description": "Imposta tipo, lingua e obiettivo della campagna",
      "actionRequired": "Nel 'Setup Campagna', seleziona il tipo '${context.restaurant.cuisineTypes.includes('italiana') ? 'promo' : 'event'}', scegli la lingua appropriata per i tuoi clienti, e nel campo 'Dettagli e Obiettivo' scrivi esattamente: '[OBIETTIVO SPECIFICO BASATO SUL SUGGERIMENTO]'"
    },
    {
      "step": 3,
      "title": "Crea il contenuto",
      "description": "Genera messaggio e media per la campagna",
      "actionRequired": "Nella 'Creazione Contenuto', clicca 'Rigenera' per far creare all'AI un messaggio basato sul tuo obiettivo. Per i media, scegli 'Crea immagine con AI' e seleziona 'Genera automaticamente' per un'immagine perfetta. Imposta la CTA primaria come '[CTA SPECIFICA]' di tipo URL."
    },
    {
      "step": 4,
      "title": "Programma l'invio",
      "description": "Scegli il momento ottimale per inviare",
      "actionRequired": "Nella sezione 'Programmazione', seleziona 'Programma per dopo' e imposta la data e ora suggerite (${context.restaurant.cuisineTypes.includes('pizzeria') ? 'venerdì sera alle 18:30' : 'martedì sera alle 19:00'}) per massimizzare l'engagement. Clicca 'Programma Campagna' per completare."
    }
  ]
}

NON aggiungere testo prima o dopo il JSON. Restituisci SOLO l'oggetto JSON.`;
  }

  /**
   * Prompt in inglese
   */
  getEnglishPrompt(context) {
    return `You are a restaurant marketing expert. Analyze the restaurant data and generate a suggestion for a new WhatsApp campaign.

RESTAURANT DATA:
- Name: ${context.restaurant.name}
- Cuisine type: ${context.restaurant.cuisineTypes.join(', ')}
- Location: ${context.restaurant.location}
- Google Rating: ${context.restaurant.rating}/5 (${context.restaurant.reviewCount} reviews)

RECENT CAMPAIGNS:
${context.recentCampaigns.map(c => `- ${c.name} (${c.type}, status: ${c.status}, sent: ${c.sentCount})`).join('\n')}

PREVIOUS SUGGESTIONS:
${context.previousSuggestions.map(s => `- ${s.title} (${s.campaignType}, status: ${s.status})`).join('\n')}

PERFORMANCE:
- Total campaigns: ${context.performanceMetrics.totalCampaigns}
- Average delivery rate: ${context.performanceMetrics.averageDeliveryRate.toFixed(1)}%
- Most used type: ${context.performanceMetrics.mostUsedType}

INSTRUCTIONS:
1. Analyze the data and identify opportunities for a new campaign
2. Avoid suggesting campaigns similar to recent ones or already suggested
3. Consider seasonality and cuisine type
4. Provide detailed and actionable instructions specific to our app
5. The suggestion must be specific to this restaurant

IMPORTANT: The step-by-step instructions must be specific to our campaign creation wizard which has these 4 steps:
1. Contact Selection (search, country filters, multiple selection)
2. Campaign Setup (type: promo/event/update/feedback, language, detailed objective)
3. Content Creation (AI message, optional media, primary/secondary CTA)
4. Scheduling (immediate send or scheduled with date/time)

Return ONLY a JSON object with this exact structure:
{
  "title": "Catchy suggestion title",
  "description": "Detailed campaign description (2-3 sentences)",
  "campaignType": "promo|event|update|feedback",
  "targetAudience": "Specific target audience description",
  "messageTemplate": "WhatsApp message template with {{1}} for name",
  "timing": "When to send the campaign (e.g., 'Tuesday evening at 6:00 PM')",
  "expectedResults": "Specific and measurable expected results",
  "stepByStepInstructions": [
    {
      "step": 1,
      "title": "Select your contacts",
      "description": "Identify and select the right customers for this campaign",
      "actionRequired": "In the 'Contact Selection' section, use search to find specific customers (e.g., search 'pizza' for customers who often order pizza) or filter by country if you want to target a specific nationality. Select all contacts relevant to your target."
    },
    {
      "step": 2,
      "title": "Configure the campaign",
      "description": "Set campaign type, language and objective",
      "actionRequired": "In 'Campaign Setup', select type '${context.restaurant.cuisineTypes.includes('italian') ? 'promo' : 'event'}', choose the appropriate language for your customers, and in the 'Details and Objective' field write exactly: '[SPECIFIC OBJECTIVE BASED ON SUGGESTION]'"
    },
    {
      "step": 3,
      "title": "Create the content",
      "description": "Generate message and media for the campaign",
      "actionRequired": "In 'Content Creation', click 'Regenerate' to have AI create a message based on your objective. For media, choose 'Create image with AI' and select 'Generate automatically' for a perfect image. Set the primary CTA as '[SPECIFIC CTA]' of URL type."
    },
    {
      "step": 4,
      "title": "Schedule the send",
      "description": "Choose the optimal time to send",
      "actionRequired": "In the 'Scheduling' section, select 'Schedule for later' and set the suggested date and time (${context.restaurant.cuisineTypes.includes('pizzeria') ? 'Friday evening at 6:30 PM' : 'Tuesday evening at 7:00 PM'}) to maximize engagement. Click 'Schedule Campaign' to complete."
    }
  ]
}

DO NOT add text before or after the JSON. Return ONLY the JSON object.`;
  }

  /**
   * Prompt in spagnolo
   */
  getSpanishPrompt(context) {
    return `Eres un experto en marketing para restaurantes. Analiza los datos del restaurante y genera una sugerencia para una nueva campaña de WhatsApp.

DATOS DEL RESTAURANTE:
- Nombre: ${context.restaurant.name}
- Tipo de cocina: ${context.restaurant.cuisineTypes.join(', ')}
- Ubicación: ${context.restaurant.location}
- Rating Google: ${context.restaurant.rating}/5 (${context.restaurant.reviewCount} reseñas)

CAMPAÑAS RECIENTES:
${context.recentCampaigns.map(c => `- ${c.name} (${c.type}, estado: ${c.status}, enviados: ${c.sentCount})`).join('\n')}

SUGERENCIAS ANTERIORES:
${context.previousSuggestions.map(s => `- ${s.title} (${s.campaignType}, estado: ${s.status})`).join('\n')}

RENDIMIENTO:
- Campañas totales: ${context.performanceMetrics.totalCampaigns}
- Tasa de entrega promedio: ${context.performanceMetrics.averageDeliveryRate.toFixed(1)}%
- Tipo más utilizado: ${context.performanceMetrics.mostUsedType}

INSTRUCCIONES:
1. Analiza los datos e identifica oportunidades para una nueva campaña
2. Evita sugerir campañas similares a las recientes o ya sugeridas
3. Considera la estacionalidad y el tipo de cocina
4. Proporciona instrucciones detalladas y accionables específicas para nuestra app
5. La sugerencia debe ser específica para este restaurante

IMPORTANTE: Las instrucciones paso a paso deben ser específicas para nuestro asistente de creación de campañas que tiene estos 4 pasos:
1. Selección de Contactos (búsqueda, filtros por país, selección múltiple)
2. Configuración de Campaña (tipo: promo/event/update/feedback, idioma, objetivo detallado)
3. Creación de Contenido (mensaje AI, medios opcionales, CTA primaria/secundaria)
4. Programación (envío inmediato o programado con fecha/hora)

Devuelve SOLO un objeto JSON con esta estructura exacta:
{
  "title": "Título atractivo de la sugerencia",
  "description": "Descripción detallada de la campaña (2-3 oraciones)",
  "campaignType": "promo|event|update|feedback",
  "targetAudience": "Descripción específica del público objetivo",
  "messageTemplate": "Plantilla del mensaje de WhatsApp con {{1}} para el nombre",
  "timing": "Cuándo enviar la campaña (ej: 'Martes por la noche a las 18:00')",
  "expectedResults": "Resultados esperados específicos y medibles",
  "stepByStepInstructions": [
    {
      "step": 1,
      "title": "Selecciona tus contactos",
      "description": "Identifica y selecciona los clientes correctos para esta campaña",
      "actionRequired": "En la sección 'Selección de Contactos', usa la búsqueda para encontrar clientes específicos (ej: busca 'pizza' para clientes que ordenan pizza frecuentemente) o filtra por país si quieres dirigirte a una nacionalidad específica. Selecciona todos los contactos relevantes para tu objetivo."
    },
    {
      "step": 2,
      "title": "Configura la campaña",
      "description": "Establece tipo, idioma y objetivo de la campaña",
      "actionRequired": "En 'Configuración de Campaña', selecciona el tipo '${context.restaurant.cuisineTypes.includes('italiana') ? 'promo' : 'event'}', elige el idioma apropiado para tus clientes, y en el campo 'Detalles y Objetivo' escribe exactamente: '[OBJETIVO ESPECÍFICO BASADO EN LA SUGERENCIA]'"
    },
    {
      "step": 3,
      "title": "Crea el contenido",
      "description": "Genera mensaje y medios para la campaña",
      "actionRequired": "En 'Creación de Contenido', haz clic en 'Regenerar' para que la AI cree un mensaje basado en tu objetivo. Para medios, elige 'Crear imagen con AI' y selecciona 'Generar automáticamente' para una imagen perfecta. Establece el CTA primario como '[CTA ESPECÍFICO]' de tipo URL."
    },
    {
      "step": 4,
      "title": "Programa el envío",
      "description": "Elige el momento óptimo para enviar",
      "actionRequired": "En la sección 'Programación', selecciona 'Programar para después' y establece la fecha y hora sugeridas (${context.restaurant.cuisineTypes.includes('pizzeria') ? 'viernes por la noche a las 18:30' : 'martes por la noche a las 19:00'}) para maximizar el engagement. Haz clic en 'Programar Campaña' para completar."
    }
  ]
}

NO agregues texto antes o después del JSON. Devuelve SOLO el objeto JSON.`;
  }

  /**
   * Valida la struttura del suggerimento
   */
  validateSuggestionStructure(suggestion) {
    const requiredFields = [
      'title', 'description', 'campaignType', 'targetAudience', 
      'messageTemplate', 'timing', 'expectedResults', 'stepByStepInstructions'
    ];

    for (const field of requiredFields) {
      if (!suggestion[field]) {
        throw new Error(`Campo obbligatorio mancante: ${field}`);
      }
    }

    if (!Array.isArray(suggestion.stepByStepInstructions) || suggestion.stepByStepInstructions.length === 0) {
      throw new Error('stepByStepInstructions deve essere un array non vuoto');
    }

    // Valida ogni step
    suggestion.stepByStepInstructions.forEach((step, index) => {
      const stepRequiredFields = ['step', 'title', 'description', 'actionRequired'];
      for (const field of stepRequiredFields) {
        if (!step[field]) {
          throw new Error(`Campo obbligatorio mancante nello step ${index + 1}: ${field}`);
        }
      }
    });

    // Valida il tipo di campagna
    const validTypes = ['promo', 'event', 'update', 'feedback'];
    if (!validTypes.includes(suggestion.campaignType)) {
      throw new Error(`Tipo di campagna non valido: ${suggestion.campaignType}`);
    }
  }

  /**
   * Recupera tutti i suggerimenti per un ristorante
   */
  async getSuggestionsForRestaurant(restaurantId, limit = 10) {
    return await CampaignSuggestion.find({ restaurant: restaurantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'email languagePreference')
      .populate('restaurant', 'name')
      .lean();
  }

  /**
   * Marca un suggerimento come visualizzato
   */
  async markSuggestionAsViewed(suggestionId) {
    return await CampaignSuggestion.findByIdAndUpdate(
      suggestionId,
      { 
        status: 'viewed',
        viewedAt: new Date()
      },
      { new: true }
    );
  }

  /**
   * Marca un suggerimento come implementato
   */
  async markSuggestionAsImplemented(suggestionId, campaignId) {
    return await CampaignSuggestion.findByIdAndUpdate(
      suggestionId,
      { 
        status: 'implemented',
        implementedAt: new Date(),
        implementedCampaign: campaignId
      },
      { new: true }
    );
  }
}

module.exports = new CampaignSuggestionService();