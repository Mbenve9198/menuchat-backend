const { Resend } = require('resend');
const EmailReport = require('../models/EmailReport');
const CampaignSuggestion = require('../models/CampaignSuggestion');

class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@menuchat.com';
  }

  /**
   * Genera il contenuto dell'email in base alla lingua
   */
  generateEmailContent(type, data, language = 'italiano') {
    const templates = {
      daily: {
        italiano: {
          subject: `📊 Report Giornaliero - ${data.restaurantName}`,
          getContent: (data) => this.generateDailyReportContent(data, 'italiano')
        },
        english: {
          subject: `📊 Daily Report - ${data.restaurantName}`,
          getContent: (data) => this.generateDailyReportContent(data, 'english')
        },
        español: {
          subject: `📊 Reporte Diario - ${data.restaurantName}`,
          getContent: (data) => this.generateDailyReportContent(data, 'español')
        }
      },
      weekly: {
        italiano: {
          subject: `📈 Report Settimanale - ${data.restaurantName}`,
          getContent: (data) => this.generateWeeklyReportContent(data, 'italiano')
        },
        english: {
          subject: `📈 Weekly Report - ${data.restaurantName}`,
          getContent: (data) => this.generateWeeklyReportContent(data, 'english')
        },
        español: {
          subject: `📈 Reporte Semanal - ${data.restaurantName}`,
          getContent: (data) => this.generateWeeklyReportContent(data, 'español')
        }
      },
      campaign_suggestion: {
        italiano: {
          subject: `💡 Nuovo Suggerimento Campagna - ${data.restaurantName}`,
          getContent: (data) => this.generateCampaignSuggestionContent(data, 'italiano')
        },
        english: {
          subject: `💡 New Campaign Suggestion - ${data.restaurantName}`,
          getContent: (data) => this.generateCampaignSuggestionContent(data, 'english')
        },
        español: {
          subject: `💡 Nueva Sugerencia de Campaña - ${data.restaurantName}`,
          getContent: (data) => this.generateCampaignSuggestionContent(data, 'español')
        }
      }
    };

    const template = templates[type]?.[language];
    if (!template) {
      throw new Error(`Template non trovato per tipo: ${type}, lingua: ${language}`);
    }

    return {
      subject: template.subject,
      content: template.getContent(data)
    };
  }

  /**
   * Genera il contenuto del report giornaliero
   */
  generateDailyReportContent(data, language) {
    const texts = {
      italiano: {
        greeting: 'Ciao',
        title: 'Ecco il tuo report giornaliero',
        subtitle: 'Risultati di ieri',
        menus: 'Menu inviati',
        requests: 'Richieste recensioni',
        reviews: 'Nuove recensioni',
        performance: 'Performance',
        good: 'Ottimo lavoro!',
        improve: 'Continua così per migliorare i risultati.',
        dashboard: 'Vai alla Dashboard',
        footer: 'Grazie per aver scelto MenuChat!'
      },
      english: {
        greeting: 'Hello',
        title: 'Here\'s your daily report',
        subtitle: 'Yesterday\'s results',
        menus: 'Menus sent',
        requests: 'Review requests',
        reviews: 'New reviews',
        performance: 'Performance',
        good: 'Great job!',
        improve: 'Keep it up to improve your results.',
        dashboard: 'Go to Dashboard',
        footer: 'Thank you for choosing MenuChat!'
      },
      español: {
        greeting: 'Hola',
        title: 'Aquí está tu reporte diario',
        subtitle: 'Resultados de ayer',
        menus: 'Menús enviados',
        requests: 'Solicitudes de reseñas',
        reviews: 'Nuevas reseñas',
        performance: 'Rendimiento',
        good: '¡Excelente trabajo!',
        improve: 'Sigue así para mejorar tus resultados.',
        dashboard: 'Ir al Panel',
        footer: '¡Gracias por elegir MenuChat!'
      }
    };

    const t = texts[language];
    const { restaurantName, metrics, period } = data;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fffe; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #1B9AAA 0%, #06D6A0 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; font-weight: bold; }
        .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px; }
        .content { padding: 40px 20px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
        .metrics { display: flex; flex-wrap: wrap; gap: 20px; margin: 30px 0; }
        .metric { flex: 1; min-width: 150px; background: #f8fffe; padding: 20px; border-radius: 12px; text-align: center; border-left: 4px solid #1B9AAA; }
        .metric-value { font-size: 32px; font-weight: bold; color: #1B9AAA; margin-bottom: 5px; }
        .metric-label { font-size: 14px; color: #666; }
        .performance { background: #e8f5e8; padding: 20px; border-radius: 12px; margin: 30px 0; }
        .performance h3 { color: #2d5a2d; margin: 0 0 10px 0; }
        .performance p { color: #4a7c4a; margin: 0; }
        .cta { text-align: center; margin: 40px 0; }
        .cta a { background: linear-gradient(135deg, #1B9AAA 0%, #06D6A0 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block; }
        .footer { background: #f8fffe; padding: 20px; text-align: center; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${restaurantName}</h1>
            <p>${t.title}</p>
        </div>
        
        <div class="content">
            <div class="greeting">${t.greeting}! 👋</div>
            
            <h2>${t.subtitle}</h2>
            
            <div class="metrics">
                <div class="metric">
                    <div class="metric-value">${metrics.menusSent}</div>
                    <div class="metric-label">${t.menus}</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${metrics.reviewRequests}</div>
                    <div class="metric-label">${t.requests}</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${metrics.reviewsCollected}</div>
                    <div class="metric-label">${t.reviews}</div>
                </div>
            </div>
            
            <div class="performance">
                <h3>${t.performance} 🎯</h3>
                <p>${metrics.reviewsCollected > 0 ? t.good : t.improve}</p>
            </div>
            
            <div class="cta">
                <a href="${process.env.FRONTEND_URL || 'https://menuchat.com'}/dashboard">${t.dashboard}</a>
            </div>
        </div>
        
        <div class="footer">
            ${t.footer}
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Genera il contenuto del report settimanale
   */
  generateWeeklyReportContent(data, language) {
    const texts = {
      italiano: {
        greeting: 'Ciao',
        title: 'Il tuo report settimanale è pronto',
        subtitle: 'Risultati della settimana',
        menus: 'Menu inviati',
        requests: 'Richieste recensioni',
        reviews: 'Nuove recensioni',
        growth: 'Crescita',
        vs_last_week: 'vs settimana scorsa',
        dashboard: 'Vai alla Dashboard',
        footer: 'Grazie per aver scelto MenuChat!'
      },
      english: {
        greeting: 'Hello',
        title: 'Your weekly report is ready',
        subtitle: 'This week\'s results',
        menus: 'Menus sent',
        requests: 'Review requests',
        reviews: 'New reviews',
        growth: 'Growth',
        vs_last_week: 'vs last week',
        dashboard: 'Go to Dashboard',
        footer: 'Thank you for choosing MenuChat!'
      },
      español: {
        greeting: 'Hola',
        title: 'Tu reporte semanal está listo',
        subtitle: 'Resultados de esta semana',
        menus: 'Menús enviados',
        requests: 'Solicitudes de reseñas',
        reviews: 'Nuevas reseñas',
        growth: 'Crecimiento',
        vs_last_week: 'vs semana pasada',
        dashboard: 'Ir al Panel',
        footer: '¡Gracias por elegir MenuChat!'
      }
    };

    const t = texts[language];
    const { restaurantName, metrics, period } = data;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fffe; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #EF476F 0%, #FF8A9A 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; font-weight: bold; }
        .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px; }
        .content { padding: 40px 20px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
        .metrics { display: flex; flex-wrap: wrap; gap: 20px; margin: 30px 0; }
        .metric { flex: 1; min-width: 150px; background: #fff5f7; padding: 20px; border-radius: 12px; text-align: center; border-left: 4px solid #EF476F; }
        .metric-value { font-size: 32px; font-weight: bold; color: #EF476F; margin-bottom: 5px; }
        .metric-label { font-size: 14px; color: #666; margin-bottom: 10px; }
        .metric-growth { font-size: 12px; color: #06D6A0; font-weight: bold; }
        .cta { text-align: center; margin: 40px 0; }
        .cta a { background: linear-gradient(135deg, #EF476F 0%, #FF8A9A 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block; }
        .footer { background: #f8fffe; padding: 20px; text-align: center; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${restaurantName}</h1>
            <p>${t.title}</p>
        </div>
        
        <div class="content">
            <div class="greeting">${t.greeting}! 📈</div>
            
            <h2>${t.subtitle}</h2>
            
            <div class="metrics">
                <div class="metric">
                    <div class="metric-value">${metrics.menusSent}</div>
                    <div class="metric-label">${t.menus}</div>
                    <div class="metric-growth">+${metrics.menusGrowth || 0}% ${t.vs_last_week}</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${metrics.reviewRequests}</div>
                    <div class="metric-label">${t.requests}</div>
                    <div class="metric-growth">+${metrics.requestsGrowth || 0}% ${t.vs_last_week}</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${metrics.reviewsCollected}</div>
                    <div class="metric-label">${t.reviews}</div>
                    <div class="metric-growth">+${metrics.reviewsGrowth || 0}% ${t.vs_last_week}</div>
                </div>
            </div>
            
            <div class="cta">
                <a href="${process.env.FRONTEND_URL || 'https://menuchat.com'}/dashboard">${t.dashboard}</a>
            </div>
        </div>
        
        <div class="footer">
            ${t.footer}
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Genera il contenuto per i suggerimenti di campagne
   */
  generateCampaignSuggestionContent(data, language) {
    const texts = {
      italiano: {
        greeting: 'Ciao',
        title: 'Abbiamo un nuovo suggerimento per te',
        subtitle: 'Campagna suggerita dall\'AI',
        type: 'Tipo di campagna',
        target: 'Target audience',
        timing: 'Timing suggerito',
        expected: 'Risultati attesi',
        instructions: 'Istruzioni passo-passo',
        step: 'Passo',
        implement: 'Implementa Campagna',
        footer: 'Suggerimento generato dall\'AI di MenuChat'
      },
      english: {
        greeting: 'Hello',
        title: 'We have a new suggestion for you',
        subtitle: 'AI-suggested campaign',
        type: 'Campaign type',
        target: 'Target audience',
        timing: 'Suggested timing',
        expected: 'Expected results',
        instructions: 'Step-by-step instructions',
        step: 'Step',
        implement: 'Implement Campaign',
        footer: 'Suggestion generated by MenuChat AI'
      },
      español: {
        greeting: 'Hola',
        title: 'Tenemos una nueva sugerencia para ti',
        subtitle: 'Campaña sugerida por IA',
        type: 'Tipo de campaña',
        target: 'Audiencia objetivo',
        timing: 'Momento sugerido',
        expected: 'Resultados esperados',
        instructions: 'Instrucciones paso a paso',
        step: 'Paso',
        implement: 'Implementar Campaña',
        footer: 'Sugerencia generada por la IA de MenuChat'
      }
    };

    const t = texts[language];
    const { restaurantName, suggestion } = data;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fffe; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #FFE14D 0%, #FFA726 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #333; margin: 0; font-size: 24px; font-weight: bold; }
        .header p { color: #666; margin: 10px 0 0 0; font-size: 16px; }
        .content { padding: 40px 20px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
        .suggestion-card { background: #fffbf0; border: 2px solid #FFE14D; border-radius: 12px; padding: 25px; margin: 20px 0; }
        .suggestion-title { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 10px; }
        .suggestion-desc { color: #666; margin-bottom: 20px; line-height: 1.6; }
        .detail-item { margin: 15px 0; }
        .detail-label { font-weight: bold; color: #333; margin-bottom: 5px; }
        .detail-value { color: #666; }
        .instructions { background: #f8fffe; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .instructions h3 { color: #1B9AAA; margin: 0 0 15px 0; }
        .step { margin: 15px 0; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #1B9AAA; }
        .step-number { font-weight: bold; color: #1B9AAA; }
        .step-title { font-weight: bold; color: #333; margin: 5px 0; }
        .step-desc { color: #666; margin: 5px 0; }
        .step-action { color: #EF476F; font-weight: bold; margin: 5px 0; }
        .cta { text-align: center; margin: 40px 0; }
        .cta a { background: linear-gradient(135deg, #FFE14D 0%, #FFA726 100%); color: #333; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block; }
        .footer { background: #f8fffe; padding: 20px; text-align: center; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${restaurantName}</h1>
            <p>${t.title}</p>
        </div>
        
        <div class="content">
            <div class="greeting">${t.greeting}! 💡</div>
            
            <div class="suggestion-card">
                <div class="suggestion-title">${suggestion.title}</div>
                <div class="suggestion-desc">${suggestion.description}</div>
                
                <div class="detail-item">
                    <div class="detail-label">${t.type}:</div>
                    <div class="detail-value">${suggestion.campaignType}</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">${t.target}:</div>
                    <div class="detail-value">${suggestion.targetAudience}</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">${t.timing}:</div>
                    <div class="detail-value">${suggestion.timing}</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">${t.expected}:</div>
                    <div class="detail-value">${suggestion.expectedResults}</div>
                </div>
            </div>
            
            <div class="instructions">
                <h3>${t.instructions}</h3>
                ${suggestion.stepByStepInstructions.map(step => `
                    <div class="step">
                        <div class="step-number">${t.step} ${step.step}</div>
                        <div class="step-title">${step.title}</div>
                        <div class="step-desc">${step.description}</div>
                        <div class="step-action">→ ${step.actionRequired}</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="cta">
                <a href="${process.env.FRONTEND_URL || 'https://menuchat.com'}/campaign/create">${t.implement}</a>
            </div>
        </div>
        
        <div class="footer">
            ${t.footer}
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Invia un'email
   */
  async sendEmail(to, subject, content, type, reportData, userId, restaurantId, language) {
    try {
      // Crea il record dell'email nel database
      const emailReport = new EmailReport({
        user: userId,
        restaurant: restaurantId,
        type,
        subject,
        content,
        language,
        reportData,
        status: 'pending'
      });

      await emailReport.save();

      // Invia l'email tramite Resend
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject,
        html: content
      });

      // Aggiorna il record con il successo
      emailReport.status = 'sent';
      emailReport.sentAt = new Date();
      emailReport.resendId = result.data?.id;
      await emailReport.save();

      console.log(`✅ Email ${type} inviata con successo a ${to}`);
      return { success: true, emailId: emailReport._id, resendId: result.data?.id };

    } catch (error) {
      console.error(`❌ Errore nell'invio email ${type} a ${to}:`, error);
      
      // Aggiorna il record con l'errore
      if (emailReport) {
        emailReport.status = 'failed';
        emailReport.failureReason = error.message;
        await emailReport.save();
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Invia report giornaliero
   */
  async sendDailyReport(user, restaurant, metrics) {
    const data = {
      restaurantName: restaurant.name,
      metrics,
      period: {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date()
      }
    };

    const { subject, content } = this.generateEmailContent('daily', data, user.languagePreference);
    
    return await this.sendEmail(
      user.email,
      subject,
      content,
      'daily',
      { period: data.period, metrics },
      user._id,
      restaurant._id,
      user.languagePreference
    );
  }

  /**
   * Invia report settimanale
   */
  async sendWeeklyReport(user, restaurant, metrics) {
    const data = {
      restaurantName: restaurant.name,
      metrics,
      period: {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      }
    };

    const { subject, content } = this.generateEmailContent('weekly', data, user.languagePreference);
    
    return await this.sendEmail(
      user.email,
      subject,
      content,
      'weekly',
      { period: data.period, metrics },
      user._id,
      restaurant._id,
      user.languagePreference
    );
  }

  /**
   * Invia suggerimento campagna
   */
  async sendCampaignSuggestion(user, restaurant, suggestion) {
    const data = {
      restaurantName: restaurant.name,
      suggestion
    };

    const { subject, content } = this.generateEmailContent('campaign_suggestion', data, user.languagePreference);
    
    return await this.sendEmail(
      user.email,
      subject,
      content,
      'campaign_suggestion',
      { campaignSuggestion: suggestion },
      user._id,
      restaurant._id,
      user.languagePreference
    );
  }
}

module.exports = new EmailService(); 