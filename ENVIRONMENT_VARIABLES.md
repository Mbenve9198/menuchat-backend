# Variabili d'Ambiente - MenuChat Backend

Questo file documenta tutte le variabili d'ambiente necessarie per far funzionare il backend di MenuChat.

## 📋 Variabili Obbligatorie

### Database
```bash
MONGODB_URI=mongodb://localhost:27017/menuchat
# o per MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/menuchat
```

### JWT
```bash
JWT_SECRET=your_super_secret_jwt_key_here
```

### Twilio (WhatsApp)
```bash
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Cloudinary (Upload File)
```bash
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Resend (Email Transazionali) ⭐ NUOVO
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@tuodominio.com
RESEND_FROM_NAME=MenuChat
```

## 📋 Variabili Opzionali

### OpenAI (se usi GPT invece di Anthropic)
```bash
OPENAI_API_KEY=sk-your_openai_api_key
```

### Anthropic AI (per suggerimenti campagne)
```bash
ANTHROPIC_API_KEY=sk-ant-your_anthropic_api_key
```

### Google Places API (per sync recensioni)
```bash
GOOGLE_PLACES_API_KEY=your_google_places_api_key
```

### Server Configuration
```bash
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## 🔑 Come Ottenere le API Key

### Resend (Email)
1. Vai su [resend.com](https://resend.com)
2. Crea un account gratuito
3. Verifica il tuo dominio
4. Genera una API Key nella dashboard
5. **Formato**: `re_` seguito da stringa alfanumerica

### Anthropic AI
1. Vai su [console.anthropic.com](https://console.anthropic.com)
2. Crea un account
3. Genera una API Key
4. **Formato**: `sk-ant-` seguito da stringa alfanumerica

### Twilio
1. Vai su [twilio.com](https://twilio.com)
2. Crea un account
3. Ottieni Account SID e Auth Token dalla dashboard
4. Configura un numero WhatsApp Business

### Cloudinary
1. Vai su [cloudinary.com](https://cloudinary.com)
2. Crea un account gratuito
3. Ottieni Cloud Name, API Key e API Secret dalla dashboard

## 📝 File .env di Esempio

Crea un file `.env` nella root del backend con questo contenuto:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/menuchat

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Resend (Email)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@tuodominio.com
RESEND_FROM_NAME=MenuChat

# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-your_anthropic_api_key_here

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## ⚠️ Note di Sicurezza

- **NON committare mai** il file `.env` nel repository
- Usa valori diversi per development e production
- Mantieni le API key segrete e sicure
- Rigenera le chiavi se compromesse 