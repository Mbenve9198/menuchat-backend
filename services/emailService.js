const { Resend } = require('resend');
const EmailReport = require('../models/EmailReport');
const CampaignSuggestion = require('../models/CampaignSuggestion');

class EmailService {
  constructor() {
    // Solo inizializza Resend se la chiave API è presente
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    } else {
      this.resend = null;
      console.warn('⚠️  RESEND_API_KEY non trovata. Le email non potranno essere inviate, ma le anteprime funzioneranno.');
    }
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
        title: 'Report Giornaliero',
        subtitle: 'I tuoi risultati di ieri',
        menus: 'Menu inviati',
        requests: 'Richieste inviate',
        reviews: 'Recensioni raccolte ieri',
        conversion: 'Tasso di conversione',
        total_reviews: 'Recensioni totali raccolte',
        summary_title: 'Riepilogo della giornata',
        good: 'Ottimo lavoro!',
        improve: 'Continua così per migliorare i risultati.',
        dashboard: 'Visualizza Dashboard Completa',
        footer: 'Ricevi questa email perché hai attivato i report giornalieri.',
        preferences: 'Gestisci preferenze email',
        unsubscribe: 'Annulla iscrizione'
      },
      english: {
        greeting: 'Hello',
        title: 'Daily Report',
        subtitle: 'Your yesterday\'s results',
        menus: 'Menus sent',
        requests: 'Requests sent',
        reviews: 'Reviews collected yesterday',
        conversion: 'Conversion rate',
        total_reviews: 'Total reviews collected',
        summary_title: 'Daily summary',
        good: 'Great job!',
        improve: 'Keep it up to improve your results.',
        dashboard: 'View Complete Dashboard',
        footer: 'You receive this email because you enabled daily reports.',
        preferences: 'Manage email preferences',
        unsubscribe: 'Unsubscribe'
      },
      español: {
        greeting: 'Hola',
        title: 'Reporte Diario',
        subtitle: 'Tus resultados de ayer',
        menus: 'Menús enviados',
        requests: 'Solicitudes enviadas',
        reviews: 'Reseñas recolectadas ayer',
        conversion: 'Tasa de conversión',
        total_reviews: 'Reseñas totales recolectadas',
        summary_title: 'Resumen del día',
        good: '¡Excelente trabajo!',
        improve: 'Sigue así para mejorar tus resultados.',
        dashboard: 'Ver Panel Completo',
        footer: 'Recibes este email porque activaste los reportes diarios.',
        preferences: 'Gestionar preferencias de email',
        unsubscribe: 'Cancelar suscripción'
      }
    };

    const t = texts[language];
    const { restaurantName, metrics, period } = data;
    const frontendUrl = process.env.FRONTEND_URL || 'https://menuchat.com';
    
    // Calcola il tasso di conversione
    const conversionRate = metrics.reviewRequests > 0 
      ? Math.round((metrics.reviewsCollected / metrics.reviewRequests) * 100) 
      : 0;
    
    // Calcola le recensioni totali (esempio)
    const totalReviews = (metrics.totalReviews || 1247) + metrics.reviewsCollected;

    return `
<!DOCTYPE html>
<html lang="${language === 'italiano' ? 'it' : language === 'english' ? 'en' : 'es'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title} - MenuChat</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: #f8fafc;
            color: #374151;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        
        .header {
            background-color: #ffffff;
            padding: 40px 30px;
            text-align: center;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .mascot {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            color: #1f2937;
        }
        
        .header p {
            margin: 8px 0 0;
            font-size: 16px;
            color: #6b7280;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 18px;
            margin-bottom: 30px;
            color: #1f2937;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background-color: #f9fafb;
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            border: 1px solid #e5e7eb;
        }
        
        .stat-emoji {
            font-size: 32px;
            margin-bottom: 12px;
            display: block;
        }
        
        .stat-number {
            font-size: 32px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 4px;
        }
        
        .stat-label {
            font-size: 14px;
            color: #6b7280;
            font-weight: 500;
        }
        
        .highlight-card {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            margin-bottom: 30px;
            border: 1px solid #f59e0b;
        }
        
        .highlight-emoji {
            font-size: 40px;
            margin-bottom: 12px;
            display: block;
        }
        
        .highlight-number {
            font-size: 36px;
            font-weight: 700;
            color: #92400e;
            margin-bottom: 4px;
        }
        
        .highlight-label {
            font-size: 16px;
            color: #92400e;
            font-weight: 600;
        }
        
        .summary {
            background-color: #f0f9ff;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 30px;
            border-left: 4px solid #0ea5e9;
        }
        
        .summary h3 {
            margin: 0 0 12px;
            color: #0c4a6e;
            font-size: 18px;
            font-weight: 600;
        }
        
        .summary p {
            margin: 0;
            color: #0c4a6e;
            line-height: 1.6;
        }
        
        .cta-section {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .cta-button {
            display: inline-block;
            background: #FFE14D;
            color: #000;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 50px;
            font-weight: 700;
            font-size: 16px;
            border: 3px solid #000;
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .cta-button:hover {
            transform: translateY(-8px);
            box-shadow: 0 8px 0 #000;
        }
        
        .footer {
            background-color: #f9fafb;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer p {
            margin: 0;
            color: #6b7280;
            font-size: 14px;
        }
        
        .footer a {
            color: #10b981;
            text-decoration: none;
        }
        
        @media (max-width: 600px) {
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .content {
                padding: 30px 20px;
            }
            
            .header {
                padding: 30px 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="mascot">⭐</div>
            <h1>${t.title}</h1>
            <p>${t.subtitle}</p>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">
                ${t.greeting} <strong>${restaurantName}</strong>! 👋<br>
                Ecco il riepilogo delle tue attività di ieri.
            </div>
            
            <!-- Yesterday's Stats -->
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-emoji">📋</span>
                    <div class="stat-number">${metrics.menusSent || 0}</div>
                    <div class="stat-label">${t.menus}</div>
                </div>
                
                <div class="stat-card">
                    <span class="stat-emoji">📢</span>
                    <div class="stat-number">${metrics.reviewRequests || 0}</div>
                    <div class="stat-label">${t.requests}</div>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-emoji">⭐</span>
                    <div class="stat-number">${metrics.reviewsCollected || 0}</div>
                    <div class="stat-label">${t.reviews}</div>
                </div>
                
                <div class="stat-card">
                    <span class="stat-emoji">📈</span>
                    <div class="stat-number">${conversionRate}%</div>
                    <div class="stat-label">${t.conversion}</div>
                </div>
            </div>
            
            <!-- Total Reviews Highlight -->
            <div class="highlight-card">
                <span class="highlight-emoji">🏆</span>
                <div class="highlight-number">${totalReviews.toLocaleString()}</div>
                <div class="highlight-label">${t.total_reviews}</div>
            </div>
            
            <!-- Summary -->
            <div class="summary">
                <h3>💡 ${t.summary_title}</h3>
                <p>
                    ${metrics.reviewsCollected > 0 ? t.good : ''} 
                    ${language === 'italiano' 
                      ? `Ieri hai raccolto <strong>${metrics.reviewsCollected || 0} nuove recensioni</strong> con un tasso di conversione del ${conversionRate}%. ${t.improve}`
                      : language === 'english'
                      ? `Yesterday you collected <strong>${metrics.reviewsCollected || 0} new reviews</strong> with a ${conversionRate}% conversion rate. ${t.improve}`
                      : `Ayer recolectaste <strong>${metrics.reviewsCollected || 0} nuevas reseñas</strong> con una tasa de conversión del ${conversionRate}%. ${t.improve}`
                    }
                </p>
            </div>
            
            <!-- Call to Action -->
            <div class="cta-section">
                <a href="${frontendUrl}/dashboard" class="cta-button">
                    ${t.dashboard}
                </a>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <p>
                ${t.footer}<br>
                <a href="${frontendUrl}/preferences">${t.preferences}</a> | <a href="${frontendUrl}/unsubscribe">${t.unsubscribe}</a>
            </p>
            <p style="margin-top: 16px;">
                © 2024 MenuChat. ${language === 'italiano' ? 'Tutti i diritti riservati.' : language === 'english' ? 'All rights reserved.' : 'Todos los derechos reservados.'}
            </p>
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
        title: 'Report Settimanale',
        subtitle: 'I tuoi risultati della settimana',
        menus: 'Menu inviati',
        requests: 'Richieste inviate',
        reviews: 'Recensioni raccolte',
        growth: 'Crescita',
        vs_last_week: 'vs settimana scorsa',
        total_reviews: 'Recensioni totali raccolte',
        summary_title: 'Riepilogo della settimana',
        good: 'Ottimo lavoro!',
        improve: 'Continua così per migliorare i risultati.',
        dashboard: 'Visualizza Dashboard Completa',
        footer: 'Ricevi questa email perché hai attivato i report settimanali.',
        preferences: 'Gestisci preferenze email',
        unsubscribe: 'Annulla iscrizione'
      },
      english: {
        greeting: 'Hello',
        title: 'Weekly Report',
        subtitle: 'Your week\'s results',
        menus: 'Menus sent',
        requests: 'Requests sent',
        reviews: 'Reviews collected',
        growth: 'Growth',
        vs_last_week: 'vs last week',
        total_reviews: 'Total reviews collected',
        summary_title: 'Weekly summary',
        good: 'Great job!',
        improve: 'Keep it up to improve your results.',
        dashboard: 'View Complete Dashboard',
        footer: 'You receive this email because you enabled weekly reports.',
        preferences: 'Manage email preferences',
        unsubscribe: 'Unsubscribe'
      },
      español: {
        greeting: 'Hola',
        title: 'Reporte Semanal',
        subtitle: 'Tus resultados de la semana',
        menus: 'Menús enviados',
        requests: 'Solicitudes enviadas',
        reviews: 'Reseñas recolectadas',
        growth: 'Crecimiento',
        vs_last_week: 'vs semana pasada',
        total_reviews: 'Reseñas totales recolectadas',
        summary_title: 'Resumen de la semana',
        good: '¡Excelente trabajo!',
        improve: 'Sigue así para mejorar tus resultados.',
        dashboard: 'Ver Panel Completo',
        footer: 'Recibes este email porque activaste los reportes semanales.',
        preferences: 'Gestionar preferencias de email',
        unsubscribe: 'Cancelar suscripción'
      }
    };

    const t = texts[language];
    const { restaurantName, metrics, period } = data;
    const frontendUrl = process.env.FRONTEND_URL || 'https://menuchat.com';
    
    // Calcola le recensioni totali (esempio)
    const totalReviews = (metrics.totalReviews || 1247) + metrics.reviewsCollected;

    return `
<!DOCTYPE html>
<html lang="${language === 'italiano' ? 'it' : language === 'english' ? 'en' : 'es'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title} - MenuChat</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: #f8fafc;
            color: #374151;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        
        .header {
            background-color: #ffffff;
            padding: 40px 30px;
            text-align: center;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .mascot {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            color: #1f2937;
        }
        
        .header p {
            margin: 8px 0 0;
            font-size: 16px;
            color: #6b7280;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 18px;
            margin-bottom: 30px;
            color: #1f2937;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background-color: #f9fafb;
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            border: 1px solid #e5e7eb;
        }
        
        .stat-emoji {
            font-size: 32px;
            margin-bottom: 12px;
            display: block;
        }
        
        .stat-number {
            font-size: 32px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 4px;
        }
        
        .stat-label {
            font-size: 14px;
            color: #6b7280;
            font-weight: 500;
            margin-bottom: 8px;
        }
        
        .stat-growth {
            font-size: 12px;
            color: #059669;
            font-weight: 600;
            background-color: #d1fae5;
            padding: 4px 8px;
            border-radius: 12px;
            display: inline-block;
        }
        
        .highlight-card {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            margin-bottom: 30px;
            border: 1px solid #f59e0b;
        }
        
        .highlight-emoji {
            font-size: 40px;
            margin-bottom: 12px;
            display: block;
        }
        
        .highlight-number {
            font-size: 36px;
            font-weight: 700;
            color: #92400e;
            margin-bottom: 4px;
        }
        
        .highlight-label {
            font-size: 16px;
            color: #92400e;
            font-weight: 600;
        }
        
        .summary {
            background-color: #f0f9ff;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 30px;
            border-left: 4px solid #0ea5e9;
        }
        
        .summary h3 {
            margin: 0 0 12px;
            color: #0c4a6e;
            font-size: 18px;
            font-weight: 600;
        }
        
        .summary p {
            margin: 0;
            color: #0c4a6e;
            line-height: 1.6;
        }
        
        .cta-section {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .cta-button {
            display: inline-block;
            background: #FFE14D;
            color: #000;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 50px;
            font-weight: 700;
            font-size: 16px;
            border: 3px solid #000;
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .cta-button:hover {
            transform: translateY(-8px);
            box-shadow: 0 8px 0 #000;
        }
        
        .footer {
            background-color: #f9fafb;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer p {
            margin: 0;
            color: #6b7280;
            font-size: 14px;
        }
        
        .footer a {
            color: #10b981;
            text-decoration: none;
        }
        
        @media (max-width: 600px) {
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .content {
                padding: 30px 20px;
            }
            
            .header {
                padding: 30px 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="mascot">🎸</div>
            <h1>${t.title}</h1>
            <p>${t.subtitle}</p>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">
                ${t.greeting} <strong>${restaurantName}</strong>! 📈<br>
                Ecco il riepilogo delle tue attività della settimana.
            </div>
            
            <!-- Week's Stats -->
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-emoji">📋</span>
                    <div class="stat-number">${metrics.menusSent || 0}</div>
                    <div class="stat-label">${t.menus}</div>
                    <div class="stat-growth">+${metrics.menusGrowth || 0}% ${t.vs_last_week}</div>
                </div>
                
                <div class="stat-card">
                    <span class="stat-emoji">📢</span>
                    <div class="stat-number">${metrics.reviewRequests || 0}</div>
                    <div class="stat-label">${t.requests}</div>
                    <div class="stat-growth">+${metrics.requestsGrowth || 0}% ${t.vs_last_week}</div>
                </div>
                
                <div class="stat-card">
                    <span class="stat-emoji">⭐</span>
                    <div class="stat-number">${metrics.reviewsCollected || 0}</div>
                    <div class="stat-label">${t.reviews}</div>
                    <div class="stat-growth">+${metrics.reviewsGrowth || 0}% ${t.vs_last_week}</div>
                </div>
            </div>
            
            <!-- Total Reviews Highlight -->
            <div class="highlight-card">
                <span class="highlight-emoji">🏆</span>
                <div class="highlight-number">${totalReviews.toLocaleString()}</div>
                <div class="highlight-label">${t.total_reviews}</div>
            </div>
            
            <!-- Summary -->
            <div class="summary">
                <h3>💡 ${t.summary_title}</h3>
                <p>
                    ${metrics.reviewsCollected > 0 ? t.good : ''} 
                    ${language === 'italiano' 
                      ? `Questa settimana hai raccolto <strong>${metrics.reviewsCollected || 0} nuove recensioni</strong>. ${t.improve}`
                      : language === 'english'
                      ? `This week you collected <strong>${metrics.reviewsCollected || 0} new reviews</strong>. ${t.improve}`
                      : `Esta semana recolectaste <strong>${metrics.reviewsCollected || 0} nuevas reseñas</strong>. ${t.improve}`
                    }
                </p>
            </div>
            
            <!-- Call to Action -->
            <div class="cta-section">
                <a href="${frontendUrl}/dashboard" class="cta-button">
                    ${t.dashboard}
                </a>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <p>
                ${t.footer}<br>
                <a href="${frontendUrl}/preferences">${t.preferences}</a> | <a href="${frontendUrl}/unsubscribe">${t.unsubscribe}</a>
            </p>
            <p style="margin-top: 16px;">
                © 2024 MenuChat. ${language === 'italiano' ? 'Tutti i diritti riservati.' : language === 'english' ? 'All rights reserved.' : 'Todos los derechos reservados.'}
            </p>
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
        title: 'Suggerimento Campagna',
        subtitle: 'Abbiamo un nuovo suggerimento per te',
        type: 'Tipo di campagna',
        target: 'Target audience',
        timing: 'Timing suggerito',
        expected: 'Risultati attesi',
        instructions: 'Istruzioni passo-passo',
        step: 'Passo',
        implement: 'Crea Campagna',
        footer: 'Ricevi questa email perché hai attivato i suggerimenti campagne.',
        preferences: 'Gestisci preferenze email',
        unsubscribe: 'Annulla iscrizione'
      },
      english: {
        greeting: 'Hello',
        title: 'Campaign Suggestion',
        subtitle: 'We have a new suggestion for you',
        type: 'Campaign type',
        target: 'Target audience',
        timing: 'Suggested timing',
        expected: 'Expected results',
        instructions: 'Step-by-step instructions',
        step: 'Step',
        implement: 'Create Campaign',
        footer: 'You receive this email because you enabled campaign suggestions.',
        preferences: 'Manage email preferences',
        unsubscribe: 'Unsubscribe'
      },
      español: {
        greeting: 'Hola',
        title: 'Sugerencia de Campaña',
        subtitle: 'Tenemos una nueva sugerencia para ti',
        type: 'Tipo de campaña',
        target: 'Audiencia objetivo',
        timing: 'Momento sugerido',
        expected: 'Resultados esperados',
        instructions: 'Instrucciones paso a paso',
        step: 'Paso',
        implement: 'Crear Campaña',
        footer: 'Recibes este email porque activaste las sugerencias de campañas.',
        preferences: 'Gestionar preferencias de email',
        unsubscribe: 'Cancelar suscripción'
      }
    };

    const t = texts[language];
    const { restaurantName, suggestion } = data;
    const frontendUrl = process.env.FRONTEND_URL || 'https://menuchat.com';

    return `
<!DOCTYPE html>
<html lang="${language === 'italiano' ? 'it' : language === 'english' ? 'en' : 'es'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title} - MenuChat</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: #f8fafc;
            color: #374151;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        
        .header {
            background-color: #ffffff;
            padding: 40px 30px;
            text-align: center;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .mascot {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            color: #1f2937;
        }
        
        .header p {
            margin: 8px 0 0;
            font-size: 16px;
            color: #6b7280;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 18px;
            margin-bottom: 30px;
            color: #1f2937;
        }
        
        .suggestion-card {
            background-color: #f9fafb;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 30px;
            border: 1px solid #e5e7eb;
        }
        
        .suggestion-title {
            font-size: 20px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 12px;
        }
        
        .suggestion-desc {
            color: #6b7280;
            margin-bottom: 20px;
            line-height: 1.6;
        }
        
        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .detail-item {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #e5e7eb;
        }
        
        .detail-label {
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }
        
        .detail-value {
            font-size: 14px;
            color: #1f2937;
            font-weight: 500;
        }
        
        .instructions {
            background-color: #f0f9ff;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 30px;
            border-left: 4px solid #0ea5e9;
        }
        
        .instructions h3 {
            margin: 0 0 16px;
            color: #0c4a6e;
            font-size: 18px;
            font-weight: 600;
        }
        
        .step {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
            border: 1px solid #e0f2fe;
        }
        
        .step:last-child {
            margin-bottom: 0;
        }
        
        .step-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .step-number {
            background-color: #0ea5e9;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            margin-right: 12px;
        }
        
        .step-title {
            font-weight: 600;
            color: #1f2937;
            font-size: 14px;
        }
        
        .step-desc {
            color: #6b7280;
            font-size: 14px;
            line-height: 1.5;
            margin-left: 36px;
        }
        
        .step-action {
            font-size: 12px;
            color: #059669;
            font-weight: 600;
            margin-left: 36px;
        }
        
        .highlight-card {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            margin-bottom: 30px;
            border: 1px solid #f59e0b;
        }
        
        .highlight-emoji {
            font-size: 40px;
            margin-bottom: 12px;
            display: block;
        }
        
        .highlight-text {
            font-size: 16px;
            color: #92400e;
            font-weight: 600;
        }
        
        .cta-section {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .cta-button {
            display: inline-block;
            background: #FFE14D;
            color: #000;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 50px;
            font-weight: 700;
            font-size: 16px;
            border: 3px solid #000;
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .cta-button:hover {
            transform: translateY(-8px);
            box-shadow: 0 8px 0 #000;
        }
        
        .footer {
            background-color: #f9fafb;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer p {
            margin: 0;
            color: #6b7280;
            font-size: 14px;
        }
        
        .footer a {
            color: #10b981;
            text-decoration: none;
        }
        
        @media (max-width: 600px) {
            .details-grid {
                grid-template-columns: 1fr;
            }
            
            .content {
                padding: 30px 20px;
            }
            
            .header {
                padding: 30px 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="mascot">💡</div>
            <h1>${t.title}</h1>
            <p>${t.subtitle}</p>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">
                ${t.greeting} <strong>${restaurantName}</strong>! 💡<br>
                La nostra AI ha analizzato i tuoi dati e ha un suggerimento per te.
            </div>
            
            <!-- Suggestion Card -->
            <div class="suggestion-card">
                <div class="suggestion-title">${suggestion.title || 'Nuova Campagna Suggerita'}</div>
                <div class="suggestion-desc">${suggestion.description || 'Descrizione della campagna suggerita dall\'AI.'}</div>
                
                <!-- Details Grid -->
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">${t.type}</div>
                        <div class="detail-value">${suggestion.campaignType || 'Promozionale'}</div>
                    </div>
                    
                    <div class="detail-item">
                        <div class="detail-label">${t.target}</div>
                        <div class="detail-value">${suggestion.targetAudience || 'Clienti abituali'}</div>
                    </div>
                    
                    <div class="detail-item">
                        <div class="detail-label">${t.timing}</div>
                        <div class="detail-value">${suggestion.timing || 'Orario di punta'}</div>
                    </div>
                    
                    <div class="detail-item">
                        <div class="detail-label">${t.expected}</div>
                        <div class="detail-value">${suggestion.expectedResults || '+15% engagement'}</div>
                    </div>
                </div>
            </div>
            
            <!-- Instructions -->
            <div class="instructions">
                <h3>📋 ${t.instructions}</h3>
                ${(suggestion.stepByStepInstructions || suggestion.instructions || [
                  { 
                    step: 1, 
                    title: 'Seleziona i tuoi contatti', 
                    description: 'Identifica e seleziona i clienti giusti per questa campagna',
                    actionRequired: 'Nella sezione "Selezione Contatti", usa la ricerca per trovare clienti specifici oppure filtra per paese. Seleziona tutti i contatti rilevanti per il tuo target.'
                  },
                  { 
                    step: 2, 
                    title: 'Configura la campagna', 
                    description: 'Imposta tipo, lingua e obiettivo della campagna',
                    actionRequired: 'Nel "Setup Campagna", seleziona il tipo appropriato, scegli la lingua e inserisci i dettagli nel campo "Obiettivo".'
                  },
                  { 
                    step: 3, 
                    title: 'Crea il contenuto', 
                    description: 'Genera messaggio e media per la campagna',
                    actionRequired: 'Nella "Creazione Contenuto", clicca "Rigenera" per il messaggio AI e scegli "Crea immagine con AI" per i media.'
                  },
                  { 
                    step: 4, 
                    title: 'Programma l\'invio', 
                    description: 'Scegli il momento ottimale per inviare',
                    actionRequired: 'Nella sezione "Programmazione", seleziona "Programma per dopo" e imposta data e ora ottimali.'
                  }
                ]).map((step, index) => `
                    <div class="step">
                        <div class="step-header">
                            <div class="step-number">${step.step || index + 1}</div>
                            <div class="step-title">${step.title}</div>
                        </div>
                        <div class="step-desc">${step.description}</div>
                        ${step.actionRequired ? `<div class="step-action">→ ${step.actionRequired}</div>` : ''}
                    </div>
                `).join('')}
            </div>
            
            <!-- Highlight -->
            <div class="highlight-card">
                <span class="highlight-emoji">🚀</span>
                <div class="highlight-text">
                    ${language === 'italiano' 
                      ? 'Implementa questo suggerimento per migliorare le tue performance!'
                      : language === 'english'
                      ? 'Implement this suggestion to improve your performance!'
                      : '¡Implementa esta sugerencia para mejorar tu rendimiento!'
                    }
                </div>
            </div>
            
            <!-- Call to Action -->
            <div class="cta-section">
                <a href="${frontendUrl}/campaign/create" class="cta-button">
                    ${t.implement}
                </a>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <p>
                ${t.footer}<br>
                <a href="${frontendUrl}/preferences">${t.preferences}</a> | <a href="${frontendUrl}/unsubscribe">${t.unsubscribe}</a>
            </p>
            <p style="margin-top: 16px;">
                © 2024 MenuChat. ${language === 'italiano' ? 'Tutti i diritti riservati.' : language === 'english' ? 'All rights reserved.' : 'Todos los derechos reservados.'}
            </p>
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
      // Controlla se Resend è disponibile
      if (!this.resend) {
        throw new Error('Resend non è configurato. Aggiungi RESEND_API_KEY alle variabili ambiente.');
      }

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

  /**
   * Genera HTML per anteprima report giornaliero
   */
  generateDailyReportHTML(user, restaurant, metrics) {
    const data = {
      restaurantName: restaurant.name,
      metrics,
      period: {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date()
      }
    };

    return this.generateDailyReportContent(data, user.languagePreference || 'italiano');
  }

  /**
   * Genera HTML per anteprima report settimanale
   */
  generateWeeklyReportHTML(user, restaurant, metrics) {
    const data = {
      restaurantName: restaurant.name,
      metrics,
      period: {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      }
    };

    return this.generateWeeklyReportContent(data, user.languagePreference || 'italiano');
  }

  /**
   * Genera HTML per anteprima suggerimento campagna
   */
  generateCampaignSuggestionHTML(user, restaurant, suggestion) {
    const data = {
      restaurantName: restaurant.name,
      suggestion
    };

    return this.generateCampaignSuggestionContent(data, user.languagePreference || 'italiano');
  }
}

module.exports = new EmailService(); 