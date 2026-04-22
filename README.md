# Sport 4 Change - Stamhoofd Bestellingen Dashboard

Een webapp voor het weergeven van alle bestellingen uit Stamhoofd voor Sport 4 Change.

## Features

- 📊 Overzichtelijke tabel met alle bestellingen
- 📈 Live statistieken (totaal bestellingen, omzet, gemiddeld bedrag)
- 🔍 Zoek- en filtermogelijkheden
- 📄 Paginatie voor grote datasets
- 🔒 Veilige API-aanroepen via serverless functions
- 🌐 Gehost op Netlify

## Setup

### Environment Variables

Voor lokale ontwikkeling en productie moeten de volgende environment variables worden ingesteld:

- `STAMHOOFD_USERNAME`: Je Stamhoofd gebruikersnaam
- `STAMHOOFD_PASSWORD`: Je Stamhoofd wachtwoord

### Lokaal ontwikkelen

1. Clone de repository:
```bash
git clone https://github.com/Rmkrs13/stamhoofd-sport4change.git
cd stamhoofd-sport4change
```

2. Maak een `.env` bestand aan (gebaseerd op `.env.example`):
```bash
cp .env.example .env
# Pas het wachtwoord aan in .env
```

3. Installeer Netlify CLI (indien nog niet geïnstalleerd):
```bash
npm install -g netlify-cli
```

4. Start de development server:
```bash
netlify dev
```

De app draait nu op http://localhost:8888

### Deployment naar Netlify

#### Via Netlify UI:

1. Ga naar je project in Netlify
2. Navigeer naar Site settings → Environment variables
3. Voeg toe:
   - `STAMHOOFD_USERNAME`: lars.raeymaekers@thomasmore.be
   - `STAMHOOFD_PASSWORD`: [je wachtwoord]

#### Via Netlify CLI:

```bash
netlify env:set STAMHOOFD_USERNAME lars.raeymaekers@thomasmore.be
netlify env:set STAMHOOFD_PASSWORD your_password_here
```

Na het instellen van de environment variables, deploy opnieuw:
```bash
netlify deploy --prod
```

## Tech Stack

- Vanilla JavaScript (frontend)
- TypeScript (serverless functions)
- Netlify Functions (API proxy)
- Stamhoofd API
- Netlify (hosting)

## Beveiliging

- API credentials worden veilig opgeslagen als environment variables
- Alle API-aanroepen gebeuren via serverless functions
- Geen gevoelige data in de frontend code