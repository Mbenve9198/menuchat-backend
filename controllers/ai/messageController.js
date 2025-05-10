const Anthropic = require('@anthropic-ai/sdk');

// Inizializza il client Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Genera un messaggio per una campagna usando Claude 3.7
 * @param {Object} req - Richiesta Express
 * @param {Object} res - Risposta Express
 * @returns {Promise<void>}
 */
exports.generateMessage = async (req, res) => {
  try {
    const { campaignType, language, objective, restaurantId } = req.body;
    
    if (!campaignType) {
      return res.status(400).json({
        success: false,
        error: 'Il tipo di campagna è richiesto'
      });
    }
    
    console.log(`Generazione messaggio per campagna di tipo: ${campaignType}`);
    console.log(`Lingua: ${language}`);
    console.log(`Ristorante ID: ${restaurantId}`);
    
    // Verifica che l'utente abbia accesso al ristorante
    if (req.user.restaurantId !== restaurantId) {
      return res.status(403).json({
        success: false,
        error: 'Accesso non autorizzato a questo ristorante'
      });
    }
    
    // Costruisci il prompt per Claude in base al tipo di campagna
    let systemPrompt = `Sei un esperto di marketing per ristoranti. Crea un breve messaggio WhatsApp per una campagna ${campaignType}.`;
    
    // Aggiungi dettagli in base al tipo di campagna
    if (campaignType === "promo") {
      systemPrompt += " Il messaggio deve promuovere un'offerta speciale ed essere persuasivo.";
    } else if (campaignType === "event") {
      systemPrompt += " Il messaggio deve invitare i clienti a un evento e generare entusiasmo.";
    } else if (campaignType === "update") {
      systemPrompt += " Il messaggio deve annunciare novità o aggiornamenti al menu.";
    } else if (campaignType === "feedback") {
      systemPrompt += " Il messaggio deve chiedere feedback ai clienti in modo amichevole.";
    }
    
    // Incorpora l'obiettivo della campagna se fornito
    const objectiveText = objective ? `L'obiettivo specifico della campagna è: ${objective}` : "";
    
    // Determina il tipo di CTA più appropriato
    let ctaType = "url";
    if (campaignType === "feedback" || campaignType === "event") {
      // Per feedback e eventi, a volte è meglio un numero di telefono
      ctaType = Math.random() > 0.5 ? "phone" : "url";
    }
    
    // Richiesta a Claude
    const message = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Crea un messaggio WhatsApp breve (max 200 caratteri) per una campagna di tipo "${campaignType}" in lingua ${language === "en" ? "inglese" : language === "it" ? "italiana" : language === "es" ? "spagnola" : language === "fr" ? "francese" : language === "de" ? "tedesca" : language}.
          
          ${objectiveText}
          
          Includi emoji appropriate.
          
          Inoltre, suggerisci un testo per il pulsante call-to-action (CTA) pertinente al tipo di campagna.
          
          Rispondi SOLO con un JSON nel seguente formato senza includere altro testo:
          {
            "messageText": "Il testo del messaggio qui",
            "cta": "Testo del pulsante CTA",
            "ctaType": "${ctaType}"
          }`
        }
      ]
    });
    
    // Estrai la risposta
    const responseText = message.content[0].text;
    
    // Analizza il JSON dalla risposta
    let jsonResponse;
    try {
      // Cerca di trovare un oggetto JSON nella risposta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Formato di risposta non valido");
      }
    } catch (parseError) {
      console.error("Errore nel parsing della risposta:", parseError);
      console.log("Risposta completa:", responseText);
      
      // Crea una risposta fallback
      jsonResponse = {
        messageText: getCampaignFallbackMessage(campaignType, language, objective),
        cta: getCampaignFallbackCTA(campaignType, language),
        ctaType: ctaType
      };
    }
    
    return res.json({
      success: true,
      messageText: jsonResponse.messageText,
      cta: jsonResponse.cta,
      ctaType: jsonResponse.ctaType
    });
    
  } catch (error) {
    console.error('Errore nella generazione del messaggio:', error);
    
    let errorMessage = 'Errore durante la generazione del messaggio';
    if (error.message) {
      errorMessage = error.message;
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

/**
 * Funzioni di fallback per generare messaggi in caso di errore con Claude
 */
function getCampaignFallbackMessage(campaignType, language, objective) {
  const objectiveText = objective ? ` ${objective}` : "";
  
  if (language === "it") {
    switch (campaignType) {
      case "promo":
        return `🌟 Offerta Speciale! Approfitta del 20% di sconto sul tuo prossimo ordine questo weekend.${objectiveText} Usa il codice MENU20 alla cassa!`;
      case "event":
        return `🎉 Sei invitato! Unisciti a noi per il nostro evento speciale questo venerdì alle 19:00.${objectiveText} Prenota ora!`;
      case "update":
        return `🍽️ Il nostro menu è migliorato! Scopri 5 nuovi piatti stagionali, disponibili ora.${objectiveText} Quale sarà il tuo preferito?`;
      case "feedback":
        return `👋 La tua opinione è importante! Com'è stata la tua recente esperienza con noi?${objectiveText} Rispondi per ricevere un dolce gratuito alla tua prossima visita!`;
      default:
        return `👋 Ciao! Grazie per essere un nostro cliente fedele.${objectiveText} Non vediamo l'ora di rivederti presto!`;
    }
  } else {
    switch (campaignType) {
      case "promo":
        return `🌟 Special Offer! Enjoy 20% off your next order this weekend.${objectiveText} Use code MENU20 at checkout!`;
      case "event":
        return `🎉 You're invited! Join us for our special event this Friday at 7PM.${objectiveText} Reserve your spot now!`;
      case "update":
        return `🍽️ Our menu just got better! Check out our 5 new seasonal dishes, available now.${objectiveText} Which one will be your favorite?`;
      case "feedback":
        return `👋 We value your opinion! How was your recent experience with us?${objectiveText} Reply to get a free dessert on your next visit!`;
      default:
        return `👋 Hello! Thank you for being our loyal customer.${objectiveText} We look forward to seeing you again soon!`;
    }
  }
}

/**
 * Funzioni di fallback per generare CTA in caso di errore con Claude
 */
function getCampaignFallbackCTA(campaignType, language) {
  if (language === "it") {
    switch (campaignType) {
      case "promo":
        return "Ordina Ora";
      case "event":
        return "Prenota";
      case "update":
        return "Vedi Menu";
      case "feedback":
        return "Lascia Feedback";
      default:
        return "Scopri di Più";
    }
  } else {
    switch (campaignType) {
      case "promo":
        return "Order Now";
      case "event":
        return "Reserve a Spot";
      case "update":
        return "View Menu";
      case "feedback":
        return "Give Feedback";
      default:
        return "Learn More";
    }
  }
} 