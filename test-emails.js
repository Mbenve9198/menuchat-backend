#!/usr/bin/env node

/**
 * Script per testare le email di MenuChat
 * Uso: node test-emails.js [tipo] [email]
 * 
 * Esempi:
 * node test-emails.js daily marco@example.com
 * node test-emails.js weekly marco@example.com  
 * node test-emails.js suggestion marco@example.com
 * node test-emails.js preview daily
 */

require('dotenv').config();
const mongoose = require('mongoose');
const emailService = require('./services/emailService');
const campaignSuggestionService = require('./services/campaignSuggestionService');
const { User, Restaurant } = require('./models');
const fs = require('fs');
const path = require('path');

// Connessione al database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/menuchat');

const testData = {
  daily: {
    date: new Date(),
    menusSent: 25,
    reviewRequests: 8,
    newReviews: 3,
    averageRating: '4.2',
    totalCustomers: 45,
    reviewsCollected: 3
  },
  weekly: {
    weekStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    weekEnd: new Date(),
    totalMenusSent: 180,
    totalReviewRequests: 55,
    totalNewReviews: 22,
    averageRating: '4.3',
    totalCustomers: 320,
    bestDay: 'Sabato',
    growthPercentage: '+12.5'
  },
  suggestion: {
    title: 'Campagna Aperitivo Serale',
    description: 'Promuovi i tuoi aperitivi con un messaggio accattivante per attirare clienti nelle ore serali',
    campaignType: 'promotional',
    targetAudience: 'Clienti che ordinano di sera',
    timing: 'Tra le 17:00 e le 19:00',
    expectedResults: 'Aumento del 20% degli ordini serali',
    stepByStepInstructions: [
      {
        step: 1,
        title: 'Prepara il messaggio',
        description: 'Crea un messaggio che evidenzi la varietà dei tuoi aperitivi',
        actionRequired: 'Scrivi un testo accattivante di massimo 160 caratteri'
      },
      {
        step: 2,
        title: 'Aggiungi immagini',
        description: 'Includi foto appetitose dei tuoi drink signature',
        actionRequired: 'Carica 2-3 foto di alta qualità dei tuoi cocktail'
      },
      {
        step: 3,
        title: 'Offerta speciale',
        description: 'Aggiungi un\'offerta speciale per il primo drink',
        actionRequired: 'Definisci uno sconto del 10-15% sul primo aperitivo'
      },
      {
        step: 4,
        title: 'Programma invio',
        description: 'Invia il messaggio nell\'orario ottimale',
        actionRequired: 'Programma l\'invio tra le 17:00 e le 19:00'
      }
    ]
  }
};

const mockUser = {
  _id: 'test-user-id',
  email: 'test@example.com',
  languagePreference: 'italiano'
};

const mockRestaurant = {
  _id: 'test-restaurant-id',
  name: 'Ristorante Test',
  address: 'Via Roma 123, Milano'
};

async function testEmail(type, email) {
  try {
    console.log(`🧪 Testando email ${type}...`);
    
    if (email) {
      mockUser.email = email;
    }

    let result;
    
    switch (type) {
      case 'daily':
        result = await emailService.sendDailyReport(mockUser, mockRestaurant, testData.daily);
        break;
        
      case 'weekly':
        result = await emailService.sendWeeklyReport(mockUser, mockRestaurant, testData.weekly);
        break;
        
      case 'suggestion':
        result = await emailService.sendCampaignSuggestion(mockUser, mockRestaurant, testData.suggestion);
        break;
        
      default:
        console.error('❌ Tipo non valido. Usa: daily, weekly, suggestion');
        process.exit(1);
    }

    if (result.success) {
      console.log(`✅ Email ${type} inviata con successo!`);
      console.log(`📧 Email ID: ${result.emailId}`);
      console.log(`📮 Resend ID: ${result.resendId}`);
      console.log(`📬 Inviata a: ${mockUser.email}`);
    } else {
      console.error(`❌ Errore nell'invio: ${result.error}`);
    }

  } catch (error) {
    console.error('❌ Errore nel test:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

async function generatePreview(type) {
  try {
    console.log(`🔍 Generando anteprima ${type}...`);
    
    let html;
    
    switch (type) {
      case 'daily':
        html = emailService.generateDailyReportHTML(mockUser, mockRestaurant, testData.daily);
        break;
        
      case 'weekly':
        html = emailService.generateWeeklyReportHTML(mockUser, mockRestaurant, testData.weekly);
        break;
        
      case 'suggestion':
        html = emailService.generateCampaignSuggestionHTML(mockUser, mockRestaurant, testData.suggestion);
        break;
        
      default:
        console.error('❌ Tipo non valido. Usa: daily, weekly, suggestion');
        process.exit(1);
    }

    const filename = `preview-${type}-${Date.now()}.html`;
    const filepath = path.join(__dirname, filename);
    
    fs.writeFileSync(filepath, html);
    console.log(`✅ Anteprima salvata in: ${filepath}`);
    console.log(`🌐 Apri il file nel browser per vedere l'anteprima`);

  } catch (error) {
    console.error('❌ Errore nella generazione anteprima:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

// Parsing argomenti
const args = process.argv.slice(2);
const command = args[0];
const param = args[1];

if (!command) {
  console.log(`
📧 Test Email MenuChat

Uso:
  node test-emails.js [comando] [parametro]

Comandi:
  daily [email]       - Invia email report giornaliero
  weekly [email]      - Invia email report settimanale  
  suggestion [email]  - Invia email suggerimento campagna
  preview [tipo]      - Genera anteprima HTML (daily/weekly/suggestion)

Esempi:
  node test-emails.js daily marco@example.com
  node test-emails.js preview weekly
  node test-emails.js suggestion test@menuchat.com

Variabili ambiente richieste:
  - RESEND_API_KEY: Chiave API Resend
  - MONGODB_URI: URI MongoDB
  - FROM_EMAIL: Email mittente (opzionale)
`);
  process.exit(0);
}

if (command === 'preview') {
  generatePreview(param || 'daily');
} else {
  testEmail(command, param);
} 