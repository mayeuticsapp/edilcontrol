# EdilControl — PRD

## Problema originale
"Inizia e completa un app definitiva opzione A con la possibilità di implementare l'aggiunta di un agente AI in un secondo momento, hai carta bianca inizia e completa l'app senza chiedermi più nulla, creila adatta nel settore edile per un impresa edile."

Opzione A = **Financial Health Dashboard** per imprese edili: Break Even Point, EBITDA, Cash Flow, gestione cantieri, **Consulente AI integrato**.

## Architettura
- **Frontend**: React 19 + Tailwind + Recharts (Cabinet Grotesk + IBM Plex Sans/Mono, blueprint blue #0F4C81, stile Swiss/control room)
- **Backend**: FastAPI + Motor (MongoDB async)
- **Database**: MongoDB. Collezioni: `cantieri`, `movimenti`, `costi_fissi`, `chat_messages`, `status_checks`
- **AI**: Claude Sonnet 4.5 via `emergentintegrations` + `EMERGENT_LLM_KEY`
- Sidebar dark + content light. Tutto in italiano.

## Personas
- Imprenditore edile / titolare — KPI a colpo d'occhio
- Capocantiere / responsabile commesse — anagrafica e marginalità
- Amministrativo / commercialista — registro cassa

## Implementato (Gen 2026)
### Iteration 1 — MVP base (test backend 13/13 ✅, frontend 100% ✅)
- Dashboard KPI (Fatturato, EBITDA semaforo, Cassa, Portafoglio)
- Cantieri CRUD con margini auto-calcolati
- Cash Flow / Movimenti CRUD con totali
- Break Even Calculator
- EBITDA Monitor con soglie settore edile
- Costi Fissi configurabili
- Dati demo seed (4 cantieri, 26 movimenti, 7 costi fissi)

### Iteration 2 — AI Advisor attivato (test 6/7, fix iter 3)
- Endpoint `/api/ai-advisor/chat` con Claude Sonnet 4.5
- System prompt italiano + iniezione dati finanziari real-time
- Persistenza conversazioni in `chat_messages`
- UI chat completa con suggerimenti, badge stato, session in localStorage

### Iteration 3 — Multi-turn fix (test 7/7 ✅)
- Bug risolto: AI ora ricorda i messaggi precedenti nella stessa sessione
- Soluzione: stateless transcript injection (carica ultimi 20 msg da Mongo, li include nel prompt)
- Robusto a riavvii del server

## Backlog prioritizzato

### P1 — Quality of life AI
- Pulsante "Nuova chat" per ruotare session_id (controllo costi token)
- Costante `MAX_HISTORY_MESSAGES` invece di magic number
- `max_length=4000` su `ChatRequest.message`
- Test del path HTTP 503 (key mancante)

### P2 — Funzionalità avanzate
- Autenticazione multi-utente per impresa
- Export PDF/Excel report
- Dettaglio cantiere con timeline movimenti collegati
- Previsione cash flow a 3/6 mesi (AI-driven)
- Notifiche email su soglie critiche
- Multi-impresa / multi-azienda

### P3 — UX
- Filtri date avanzati su movimenti
- Ricerca full-text cantieri
- Allegati/foto per cantiere
- Mobile responsive ottimizzato
- Streaming delle risposte AI (SSE)

## Note di portabilità
- App testata su Emergent preview
- Per deploy esterno (Render/Railway/Fly.io): impostare `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `CORS_ORIGINS` nelle env vars della piattaforma
- L'`EMERGENT_LLM_KEY` è raggiungibile da qualsiasi backend con accesso internet — non vincolata a Emergent native deploy
