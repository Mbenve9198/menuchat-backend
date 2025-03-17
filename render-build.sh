#!/usr/bin/env bash
# Script di build personalizzato per Render

# Stampa i comandi eseguiti (per debug)
set -x

# Installa le dipendenze
npm install

# Installa esplicitamente il pacchetto helmet
npm install helmet

# Esci con lo stato dell'ultimo comando
exit $? 