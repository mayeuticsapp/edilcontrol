# EdilControl — PRD

## Problema originale
"Inizia e completa un app definitiva opzione A con la possibilità di implementare l'aggiunta di un agente AI in un secondo momento, hai carta bianca inizia e completa l'app senza chiedermi più nulla, creila adatta nel settore edile per un impresa edile."

Opzione A = **Financial Health Dashboard** per imprese edili: Break Even Point, EBITDA, Cash Flow, gestione cantieri, **Consulente AI integrato** + **autenticazione protetta**.

## Architettura
- **Frontend**: React 19 + Tailwind + Recharts (Cabinet Grotesk + IBM Plex Sans/Mono, blueprint blue #0F4C81, stile Swiss/control room)
- **Backend**: FastAPI + Motor (MongoDB async) + middleware JWT
- **Database**: MongoDB. Collezioni: `cantieri`, `movimenti`, `costi_fissi`, `chat_messages`, `users`, `login_attempts`
- **AI**: Claude Sonnet 4.5 via `emergentintegrations` + `EMERGENT_LLM_KEY`
- **Auth**: JWT HS256 24h + bcrypt + brute force protection (5 tentativi → 15 min lockout per IP)

## Personas
- Imprenditore edile / titolare (admin) — accede con username/password, vede tutto
- (Futuro) Capocantiere, Amministrativo — multi-utente con ruoli da implementare

## Implementato (Gen 2026)

### Iteration 1 — MVP base (test 13/13 ✅)
- Dashboard KPI, Cantieri CRUD, Cash Flow CRUD, Break Even Calculator, EBITDA Monitor, Costi Fissi
- Dati demo seed (4 cantieri, 26 movimenti, 7 costi fissi)

### Iteration 2-3 — AI Advisor (test 7/7 ✅)
- Endpoint `/api/ai-advisor/chat` con Claude Sonnet 4.5
- System prompt italiano + iniezione dati finanziari real-time
- Multi-turn conversazione (transcript injection da Mongo)

### Iteration 4-5 — Autenticazione (test 28/28 ✅)
- Login `/api/auth/login` username/password con bcrypt
- JWT token 24h, middleware protegge tutti gli endpoint `/api/*` (eccetto `/api/` e `/api/auth/login`)
- Brute force: 5 tentativi falliti → lockout 15 min per IP+username (IP via X-Forwarded-For)
- Frontend: AuthContext + ProtectedLayout + axios interceptors (Bearer + 401 redirect)
- Pagina login dedicata con design Swiss/architettonico
- Sidebar mostra username e pulsante logout
- Admin seed idempotente: username `Albertoadminapp`, password configurabile da `.env`

## Backlog prioritizzato

### P1 — Quality of life
- Pulsante "Nuova chat" AI per ruotare session_id (controllo costi token)
- Costante `MAX_HISTORY_MESSAGES` invece di magic number nel codice AI
- `max_length=4000` su `ChatRequest.message`
- Split `server.py` (857 righe) in moduli `auth.py`, `cantieri.py`, `ai_advisor.py`
- Deduplica JWT decode tra middleware e `get_current_user`
- Username DB lookup case-insensitive (consistenza con identifier lowercased)
- Hardening X-Forwarded-For (whitelist proxy trusted)

### P2 — Funzionalità
- Multi-utente con ruoli (titolare/capocantiere/amministrativo)
- Cambio password da UI
- Export PDF/Excel report
- Dettaglio cantiere con timeline movimenti collegati
- Previsione cash flow a 3/6 mesi (AI-driven)
- Notifiche email su soglie critiche

### P3 — UX
- Filtri date avanzati su movimenti
- Ricerca full-text cantieri
- Allegati/foto per cantiere
- Mobile responsive ottimizzato
- Streaming risposte AI (SSE)

## Note di portabilità
- Auth basata su env vars — funziona ovunque (Render/Railway/Fly.io/AWS/Emergent)
- Variabili richieste: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CORS_ORIGINS`
- Cambio password admin: modifica `ADMIN_PASSWORD` in `.env` + restart backend (idempotent re-hash)

## Credenziali (vedi /app/memory/test_credentials.md)
- Username: `Albertoadminapp`
- Password: `Murgi@2026!`
