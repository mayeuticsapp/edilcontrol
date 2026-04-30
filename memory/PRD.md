# EdilControl — PRD

## Problema originale
Cliente ha richiesto: "Inizia e completa un app definitiva opzione A con la possibilità di implementare l'aggiunta di un agente AI in un secondo momento, hai carta bianca inizia e completa l'app senza chiedermi più nulla, creila adatta nel settore edile per un impresa edile."

Opzione A = **Financial Health Dashboard** per imprese edili: Break Even Point, EBITDA, Cash Flow, gestione cantieri, predisposto per agente AI futuro.

## Architettura
- **Frontend**: React 19 + Tailwind + Recharts. Tema Swiss/architettonico (Cabinet Grotesk + IBM Plex Sans/Mono, blueprint blue #0F4C81)
- **Backend**: FastAPI + Motor (MongoDB async)
- **Database**: MongoDB. Collezioni: `cantieri`, `movimenti`, `costi_fissi`, `status_checks`
- **Sidebar dark + content light** per stile "control room"
- Tutto in italiano, terminologia settore edile (cantiere, commessa, SAL, subappalti, manodopera, materiali)

## Personas
- **Imprenditore edile / titolare** — vuole vedere a colpo d'occhio se l'azienda è in salute
- **Capocantiere / responsabile commesse** — gestisce anagrafica cantieri e marginalità
- **Amministrativo / commercialista** — registra entrate/uscite, monitora cash flow

## Requisiti core (statici)
1. Dashboard riassuntiva con KPI (Fatturato, EBITDA, Cassa, Portafoglio commesse)
2. Calcolatore Break Even Point
3. Monitor EBITDA con semaforo (critico/attenzione/buono/ottimo)
4. Cash Flow mensile con grafico entrate/uscite
5. Gestione cantieri/commesse con margini
6. Costi fissi configurabili
7. Placeholder Consulente AI (predisposto per attivazione futura)

## Implementato (Gen 2026)
- ✅ Backend completo: 13/13 test passati (Cantieri CRUD, Movimenti CRUD, Costi fissi CRUD, Break Even calc, Dashboard summary, Margini per cantiere, AI status placeholder, Seed demo idempotente)
- ✅ Frontend: 7 pagine (Dashboard, Cantieri, Cash Flow, Break Even, EBITDA, Costi Fissi, AI Advisor)
- ✅ Sidebar navigation, modali per CRUD, grafici Recharts (bar+pie)
- ✅ Dati demo precaricati: 4 cantieri reali, 26 movimenti, 7 costi fissi
- ✅ Tutti i `data-testid` in kebab-case
- ✅ Locale italiano (formattazione € e date)
- ✅ Endpoint `/api/ai-advisor/status` predisposto per integrazione futura

## Backlog prioritizzato

### P1 — Attivazione AI Advisor
- Integrare GPT-5.2 o Claude Sonnet 4.5 via Emergent LLM key
- Endpoint `/api/ai-advisor/chat` con contesto dei dati finanziari
- Chat UI nella pagina AI Advisor

### P2 — Funzionalità avanzate
- Autenticazione (login multi-utente per impresa)
- Export PDF/Excel dei report
- Dettaglio cantiere con timeline movimenti collegati
- Previsione cash flow a 3/6 mesi
- Notifiche email per soglie critiche
- Multi-impresa / multi-azienda

### P3 — Qualità/UX
- Filtri date avanzati su movimenti
- Ricerca full-text su cantieri
- Allegati/foto per cantiere
- Mobile responsive ottimizzato
