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
    const frontendUrl = process.env.FRONTEND_URL || 'https://menuchat.com';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8fffe; 
            line-height: 1.6;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .header { 
            background: linear-gradient(135deg, #FFE14D 0%, #FFA726 100%); 
            padding: 40px 20px; 
            text-align: center; 
            position: relative;
            border-bottom: 3px solid #000;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('${frontendUrl}/mascottes/mascotte_flying.png') no-repeat center;
            background-size: 80px;
            opacity: 0.1;
        }
        .header h1 { 
            color: #000; 
            margin: 0; 
            font-size: 28px; 
            font-weight: 700; 
            text-shadow: 2px 2px 0px rgba(255,255,255,0.3);
        }
        .header p { 
            color: #333; 
            margin: 10px 0 0 0; 
            font-size: 16px; 
            font-weight: 500;
        }
        .mascotte-container {
            text-align: center;
            margin: 20px 0;
        }
        .mascotte-img {
            width: 120px;
            height: auto;
            border-radius: 50%;
            border: 4px solid #FFE14D;
            box-shadow: 0 6px 0 #000;
            background: white;
            padding: 10px;
        }
        .content { 
            padding: 40px 20px; 
        }
        .greeting { 
            font-size: 20px; 
            color: #333; 
            margin-bottom: 20px; 
            font-weight: 600;
        }
        .metrics { 
            display: flex; 
            flex-wrap: wrap; 
            gap: 20px; 
            margin: 30px 0; 
        }
        .metric { 
            flex: 1; 
            min-width: 150px; 
            background: #fff; 
            padding: 25px 20px; 
            border-radius: 16px; 
            text-align: center; 
            border: 3px solid #000;
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
            position: relative;
        }
        .metric::before {
            content: '';
            position: absolute;
            top: -3px;
            left: -3px;
            right: -3px;
            bottom: -3px;
            background: linear-gradient(45deg, #FFE14D, #FFA726);
            border-radius: 16px;
            z-index: -1;
        }
        .metric-value { 
            font-size: 36px; 
            font-weight: 700; 
            color: #1B9AAA; 
            margin-bottom: 8px; 
            text-shadow: 1px 1px 0px rgba(0,0,0,0.1);
        }
        .metric-label { 
            font-size: 14px; 
            color: #666; 
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .performance { 
            background: linear-gradient(135deg, #e8f5e8 0%, #d4f1d4 100%); 
            padding: 25px; 
            border-radius: 16px; 
            margin: 30px 0; 
            border: 3px solid #000;
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
        }
        .performance h3 { 
            color: #2d5a2d; 
            margin: 0 0 15px 0; 
            font-size: 18px;
            font-weight: 600;
        }
        .performance p { 
            color: #4a7c4a; 
            margin: 0; 
            font-size: 16px;
        }
        .cta { 
            text-align: center; 
            margin: 40px 0; 
        }
        .cta-button { 
            background: #FFE14D; 
            color: #000; 
            padding: 18px 36px; 
            text-decoration: none; 
            border-radius: 50px; 
            font-weight: 700; 
            font-size: 16px;
            display: inline-block; 
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
            background: #f8fffe; 
            padding: 30px 20px; 
            text-align: center; 
            color: #666; 
            font-size: 14px; 
            border-top: 3px solid #000;
        }
        .footer-logo {
            width: 60px;
            height: auto;
            margin-bottom: 15px;
        }
        .decorative-elements {
            position: relative;
            height: 40px;
            overflow: hidden;
        }
        .star {
            position: absolute;
            width: 20px;
            height: 20px;
            background: #FFE14D;
            clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
            animation: twinkle 2s infinite;
        }
        .star:nth-child(1) { left: 10%; animation-delay: 0s; }
        .star:nth-child(2) { left: 30%; animation-delay: 0.5s; }
        .star:nth-child(3) { left: 50%; animation-delay: 1s; }
        .star:nth-child(4) { left: 70%; animation-delay: 1.5s; }
        .star:nth-child(5) { left: 90%; animation-delay: 2s; }
        
        @keyframes twinkle {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
        }
        
        @media (max-width: 600px) {
            .metrics { flex-direction: column; }
            .metric { min-width: auto; }
            .header h1 { font-size: 24px; }
            .cta-button { padding: 15px 30px; font-size: 14px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>MenuChat</h1>
            <p>${restaurantName}</p>
        </div>
        
        <div class="mascotte-container">
            <img src="${frontendUrl}/mascottes/mascotte_base.png" alt="MenuChat Mascotte" class="mascotte-img">
        </div>
        
        <div class="content">
            <div class="greeting">${t.greeting}! 👋</div>
            
            <h2 style="color: #333; font-size: 24px; font-weight: 600; margin-bottom: 20px;">${t.subtitle}</h2>
            
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
                <a href="${frontendUrl}/dashboard" class="cta-button">${t.dashboard}</a>
            </div>
        </div>
        
        <div class="decorative-elements">
            <div class="star"></div>
            <div class="star"></div>
            <div class="star"></div>
            <div class="star"></div>
            <div class="star"></div>
        </div>
        
        <div class="footer">
            <img src="${frontendUrl}/mascottes/mascotte_setupwizard.png" alt="MenuChat" class="footer-logo">
            <div>${t.footer}</div>
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
    const frontendUrl = process.env.FRONTEND_URL || 'https://menuchat.com';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8fffe; 
            line-height: 1.6;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .header { 
            background: linear-gradient(135deg, #EF476F 0%, #FF8A9A 100%); 
            padding: 40px 20px; 
            text-align: center; 
            position: relative;
            border-bottom: 3px solid #000;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('${frontendUrl}/mascottes/mascotte_rock.png') no-repeat center;
            background-size: 80px;
            opacity: 0.1;
        }
        .header h1 { 
            color: #000; 
            margin: 0; 
            font-size: 28px; 
            font-weight: 700; 
            text-shadow: 2px 2px 0px rgba(255,255,255,0.3);
        }
        .header p { 
            color: #333; 
            margin: 10px 0 0 0; 
            font-size: 16px; 
            font-weight: 500;
        }
        .mascotte-container {
            text-align: center;
            margin: 20px 0;
        }
        .mascotte-img {
            width: 120px;
            height: auto;
            border-radius: 50%;
            border: 4px solid #EF476F;
            box-shadow: 0 6px 0 #000;
            background: white;
            padding: 10px;
        }
        .content { 
            padding: 40px 20px; 
        }
        .greeting { 
            font-size: 20px; 
            color: #333; 
            margin-bottom: 20px; 
            font-weight: 600;
        }
        .metrics { 
            display: flex; 
            flex-wrap: wrap; 
            gap: 20px; 
            margin: 30px 0; 
        }
        .metric { 
            flex: 1; 
            min-width: 150px; 
            background: #fff; 
            padding: 25px 20px; 
            border-radius: 16px; 
            text-align: center; 
            border: 3px solid #000;
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
            position: relative;
        }
        .metric::before {
            content: '';
            position: absolute;
            top: -3px;
            left: -3px;
            right: -3px;
            bottom: -3px;
            background: linear-gradient(45deg, #EF476F, #FF8A9A);
            border-radius: 16px;
            z-index: -1;
        }
        .metric-value { 
            font-size: 36px; 
            font-weight: 700; 
            color: #EF476F; 
            margin-bottom: 8px; 
            text-shadow: 1px 1px 0px rgba(0,0,0,0.1);
        }
        .metric-label { 
            font-size: 14px; 
            color: #666; 
            margin-bottom: 10px; 
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .metric-growth { 
            font-size: 12px; 
            color: #06D6A0; 
            font-weight: 700;
            background: rgba(6, 214, 160, 0.1);
            padding: 4px 8px;
            border-radius: 12px;
            border: 2px solid #06D6A0;
        }
        .cta { 
            text-align: center; 
            margin: 40px 0; 
        }
        .cta-button { 
            background: #FFE14D; 
            color: #000; 
            padding: 18px 36px; 
            text-decoration: none; 
            border-radius: 50px; 
            font-weight: 700; 
            font-size: 16px;
            display: inline-block; 
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
            background: #f8fffe; 
            padding: 30px 20px; 
            text-align: center; 
            color: #666; 
            font-size: 14px; 
            border-top: 3px solid #000;
        }
        .footer-logo {
            width: 60px;
            height: auto;
            margin-bottom: 15px;
        }
        .decorative-elements {
            position: relative;
            height: 40px;
            overflow: hidden;
        }
        .heart {
            position: absolute;
            width: 20px;
            height: 18px;
            background: #EF476F;
            transform: rotate(-45deg);
            animation: pulse 2s infinite;
        }
        .heart::before,
        .heart::after {
            content: '';
            width: 20px;
            height: 18px;
            position: absolute;
            left: 10px;
            background: #EF476F;
            border-radius: 10px 10px 0 0;
            transform: rotate(-45deg);
            transform-origin: 0 100%;
        }
        .heart::after {
            left: 0;
            transform: rotate(45deg);
            transform-origin: 100% 100%;
        }
        .heart:nth-child(1) { left: 15%; animation-delay: 0s; }
        .heart:nth-child(2) { left: 35%; animation-delay: 0.4s; }
        .heart:nth-child(3) { left: 55%; animation-delay: 0.8s; }
        .heart:nth-child(4) { left: 75%; animation-delay: 1.2s; }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: rotate(-45deg) scale(1); }
            50% { opacity: 1; transform: rotate(-45deg) scale(1.2); }
        }
        
        @media (max-width: 600px) {
            .metrics { flex-direction: column; }
            .metric { min-width: auto; }
            .header h1 { font-size: 24px; }
            .cta-button { padding: 15px 30px; font-size: 14px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>MenuChat</h1>
            <p>${restaurantName}</p>
        </div>
        
        <div class="mascotte-container">
            <img src="${frontendUrl}/mascottes/mascotte_rock.png" alt="MenuChat Mascotte" class="mascotte-img">
        </div>
        
        <div class="content">
            <div class="greeting">${t.greeting}! 📈</div>
            
            <h2 style="color: #333; font-size: 24px; font-weight: 600; margin-bottom: 20px;">${t.subtitle}</h2>
            
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
                <a href="${frontendUrl}/dashboard" class="cta-button">${t.dashboard}</a>
            </div>
        </div>
        
        <div class="decorative-elements">
            <div class="heart"></div>
            <div class="heart"></div>
            <div class="heart"></div>
            <div class="heart"></div>
        </div>
        
        <div class="footer">
            <img src="${frontendUrl}/mascottes/mascotte_setupwizard.png" alt="MenuChat" class="footer-logo">
            <div>${t.footer}</div>
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
        implement: 'Crea Campagna',
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
        implement: 'Create Campaign',
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
        implement: 'Crear Campaña',
        footer: 'Sugerencia generada por la IA de MenuChat'
      }
    };

    const t = texts[language];
    const { restaurantName, suggestion } = data;
    const frontendUrl = process.env.FRONTEND_URL || 'https://menuchat.com';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8fffe; 
            line-height: 1.6;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .header { 
            background: linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%); 
            padding: 40px 20px; 
            text-align: center; 
            position: relative;
            border-bottom: 3px solid #000;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('${frontendUrl}/mascottes/mascotte_running.png') no-repeat center;
            background-size: 80px;
            opacity: 0.1;
        }
        .header h1 { 
            color: #000; 
            margin: 0; 
            font-size: 28px; 
            font-weight: 700; 
            text-shadow: 2px 2px 0px rgba(255,255,255,0.3);
        }
        .header p { 
            color: #333; 
            margin: 10px 0 0 0; 
            font-size: 16px; 
            font-weight: 500;
        }
        .mascotte-container {
            text-align: center;
            margin: 20px 0;
        }
        .mascotte-img {
            width: 120px;
            height: auto;
            border-radius: 50%;
            border: 4px solid #8B5CF6;
            box-shadow: 0 6px 0 #000;
            background: white;
            padding: 10px;
        }
        .content { 
            padding: 40px 20px; 
        }
        .greeting { 
            font-size: 20px; 
            color: #333; 
            margin-bottom: 20px; 
            font-weight: 600;
        }
        .suggestion-card { 
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); 
            border: 3px solid #000; 
            border-radius: 16px; 
            padding: 30px; 
            margin: 20px 0; 
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
            position: relative;
        }
        .suggestion-card::before {
            content: '💡';
            position: absolute;
            top: -15px;
            right: 20px;
            font-size: 30px;
            background: #FFE14D;
            border: 3px solid #000;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 0 #000;
        }
        .suggestion-title { 
            font-size: 22px; 
            font-weight: 700; 
            color: #333; 
            margin-bottom: 15px; 
        }
        .suggestion-desc { 
            color: #666; 
            margin-bottom: 25px; 
            line-height: 1.6; 
            font-size: 16px;
        }
        .detail-item { 
            margin: 20px 0; 
            padding: 15px;
            background: white;
            border-radius: 12px;
            border: 2px solid #000;
            box-shadow: 0 3px 0 #000;
            transform: translateY(-3px);
        }
        .detail-label { 
            font-weight: 700; 
            color: #333; 
            margin-bottom: 8px; 
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .detail-value { 
            color: #666; 
            font-size: 15px;
        }
        .instructions { 
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); 
            border-radius: 16px; 
            padding: 25px; 
            margin: 25px 0; 
            border: 3px solid #000;
            box-shadow: 0 6px 0 #000;
            transform: translateY(-6px);
        }
        .instructions h3 { 
            color: #1B9AAA; 
            margin: 0 0 20px 0; 
            font-size: 18px;
            font-weight: 700;
        }
        .step { 
            margin: 20px 0; 
            padding: 20px; 
            background: white; 
            border-radius: 12px; 
            border: 3px solid #000;
            box-shadow: 0 4px 0 #000;
            transform: translateY(-4px);
            position: relative;
        }
        .step::before {
            content: '';
            position: absolute;
            left: -3px;
            top: -3px;
            bottom: -3px;
            width: 6px;
            background: #1B9AAA;
            border-radius: 12px 0 0 12px;
        }
        .step-number { 
            font-weight: 700; 
            color: #1B9AAA; 
            font-size: 16px;
        }
        .step-title { 
            font-weight: 700; 
            color: #333; 
            margin: 8px 0; 
            font-size: 16px;
        }
        .step-desc { 
            color: #666; 
            margin: 8px 0; 
            line-height: 1.5;
        }
        .step-action { 
            color: #EF476F; 
            font-weight: 700; 
            margin: 8px 0; 
            font-size: 14px;
        }
        .cta { 
            text-align: center; 
            margin: 40px 0; 
        }
        .cta-button { 
            background: #FFE14D; 
            color: #000; 
            padding: 18px 36px; 
            text-decoration: none; 
            border-radius: 50px; 
            font-weight: 700; 
            font-size: 16px;
            display: inline-block; 
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
            background: #f8fffe; 
            padding: 30px 20px; 
            text-align: center; 
            color: #666; 
            font-size: 14px; 
            border-top: 3px solid #000;
        }
        .footer-logo {
            width: 60px;
            height: auto;
            margin-bottom: 15px;
        }
        .decorative-elements {
            position: relative;
            height: 40px;
            overflow: hidden;
        }
        .sparkle {
            position: absolute;
            width: 16px;
            height: 16px;
            background: #8B5CF6;
            clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
            animation: sparkle 1.5s infinite;
        }
        .sparkle:nth-child(1) { left: 10%; animation-delay: 0s; }
        .sparkle:nth-child(2) { left: 25%; animation-delay: 0.3s; }
        .sparkle:nth-child(3) { left: 40%; animation-delay: 0.6s; }
        .sparkle:nth-child(4) { left: 55%; animation-delay: 0.9s; }
        .sparkle:nth-child(5) { left: 70%; animation-delay: 1.2s; }
        .sparkle:nth-child(6) { left: 85%; animation-delay: 1.5s; }
        
        @keyframes sparkle {
            0%, 100% { opacity: 0.2; transform: scale(1) rotate(0deg); }
            50% { opacity: 1; transform: scale(1.3) rotate(180deg); }
        }
        
        @media (max-width: 600px) {
            .header h1 { font-size: 24px; }
            .cta-button { padding: 15px 30px; font-size: 14px; }
            .suggestion-card { padding: 20px; }
            .step { padding: 15px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>MenuChat</h1>
            <p>${restaurantName}</p>
        </div>
        
        <div class="mascotte-container">
            <img src="${frontendUrl}/mascottes/mascotte_running.png" alt="MenuChat Mascotte" class="mascotte-img">
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
                <a href="${frontendUrl}/campaign/create" class="cta-button">${t.implement}</a>
            </div>
        </div>
        
        <div class="decorative-elements">
            <div class="sparkle"></div>
            <div class="sparkle"></div>
            <div class="sparkle"></div>
            <div class="sparkle"></div>
            <div class="sparkle"></div>
            <div class="sparkle"></div>
        </div>
        
        <div class="footer">
            <img src="${frontendUrl}/mascottes/mascotte_setupwizard.png" alt="MenuChat" class="footer-logo">
            <div>${t.footer}</div>
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