# MenuChat - Backend

Backend per la piattaforma SaaS MenuChat che aiuta i ristoranti a generare bot di menu WhatsApp e automatizzare la raccolta di recensioni.

## Modelli MongoDB

Il sistema utilizza i seguenti modelli Mongoose:

### 1. User

Modello per gli utenti della piattaforma:
- Campi di autenticazione (email, hash password, salt)
- Livello di abbonamento (gratuito o premium)
- Preferenze di lingua
- Date di creazione e ultimo accesso

### 2. Restaurant

Modello per i ristoranti:
- Riferimento al proprietario (utente)
- Informazioni di base (nome, indirizzo, contatti)
- ID e URL Google Places
- Valutazioni Google
- Orari di apertura
- Descrizione per la conoscenza del bot AI

### 3. Menu

Modello per i menu dei ristoranti:
- Riferimento al ristorante
- Tipo di origine (caricamento PDF, URL, generato da AI, manuale)
- Metadati del PDF (se applicabile)
- Sezioni del menu con categorie e elementi
- Informazioni dettagliate sugli elementi (nome, descrizione, prezzo, informazioni dietetiche)
- Supporto multilingua

### 4. BotConfiguration

Modello per la configurazione dei bot:
- Riferimento al ristorante
- Parola/frase di attivazione
- Modelli di messaggi (benvenuto, richiesta recensione)
- Ritardo prima di inviare richiesta di recensione
- Numero WhatsApp (predefinito o personalizzato per account premium)
- Informazioni QR code
- Impostazioni di configurazione AI
- Stato attivo/inattivo

### 5. CustomerInteraction

Modello per tracciare le interazioni con i clienti:
- Riferimento al ristorante
- Numero di telefono del cliente (hashed per privacy)
- Timestamp delle interazioni
- Stato dell'interazione
- Log dettagliato degli eventi
- Dati sulle recensioni
- Supporto per la cronologia delle conversazioni

### 6. Analytics

Modello per le analitiche:
- Riferimento al ristorante
- Statistiche giornaliere/settimanali/mensili
- Conteggio delle scansioni dei menu
- Conteggio delle richieste di recensioni
- Conteggio delle recensioni confermate
- Tassi di conversione
- Timestamp

## Strategie di indicizzazione

Sono state implementate indicizzazioni ottimizzate per:
- Query frequenti per ID ristorante
- Query per bot attivi
- Query per intervalli di date nelle analitiche
- Ricerche per numero di telefono per i messaggi in entrata

## Installazione

```bash
cd backend
npm install
```

## Avvio del server di sviluppo

```bash
npm run dev
``` 