# EdilControl — PRD

## Problema originale
"Inizia e completa un app definitiva opzione A con la possibilità di implementare l'aggiunta di un agente AI in un secondo momento, hai carta bianca inizia e completa l'app senza chiedermi più nulla, creila adatta nel settore edile per un impresa edile."

Opzione A = **Financial Health Dashboard** + **AI agentico operativo** + **autenticazione protetta**.

## Architettura
- **Frontend**: React 19 + Tailwind + Recharts (Cabinet Grotesk + IBM Plex, blueprint blue)
- **Backend**: FastAPI + Motor (MongoDB async) + middleware JWT
- **Database**: MongoDB. Collezioni: `cantieri`, `movimenti`, `costi_fissi`, `chat_messages`, `users`, `login_attempts`, `uploaded_files`, `ai_actions_log`
- **AI**: Claude Sonnet 4.5 via `emergentintegrations` + structured JSON output (tool use)
- **Auth**: JWT HS256 24h + bcrypt + brute force protection (5 tentativi, 15min lockout, X-Forwarded-For)

## Implementato (Gen 2026)

### Iter 1 — MVP base (test 13/13 ✅)
Dashboard, Cantieri, Cash Flow, Break Even, EBITDA, Costi Fissi.

### Iter 2-3 — AI Advisor base (test 7/7 ✅)
Chat Claude Sonnet 4.5 con multi-turn stateless, contesto finanziario iniettato.

### Iter 4-5 — Autenticazione (test 28/28 ✅)
Login admin, JWT, bcrypt, brute force protection, middleware globale.

### Iter 6 — AI Agentico (test 13/13 ✅)
- **Tool registry**: 7 strumenti (crea/aggiorna/elimina cantieri, movimenti, costi fissi)
- **Structured JSON output**: AI risponde con `{type:"message"}` o `{type:"proposed_actions",actions:[...]}`
- **Conferma a 2 step**: AI propone → utente conferma → backend esegue
- **File upload**: PDF, JPG, PNG, WEBP, HEIC fino 8MB → Claude Vision analizza fatture/F24/DURC/scontrini
- **Audit log**: tabella `ai_actions_log` con tutte le azioni eseguite
- **Cascade safety**: elimina_cantiere scollega i movimenti orfani
- **Logout pulisce session chat** (privacy multi-utente)
- UI con card AMBER per proposte, GREEN per risultati, badge "Agentico"

## Backlog prioritizzato

### P1 — Quality (non bloccanti)
- Splittare server.py (1236 righe) in moduli `auth.py`, `cantieri.py`, `movimenti.py`, `ai_advisor.py`, `ai_tools.py`
- TTL index su `uploaded_files.created_at` (es. 7 giorni) per pulire allegati vecchi
- Index su `ai_actions_log` (session_id, executed_at)
- Validazione `session_id` con max_length=128
- Logging warning quando Claude restituisce JSON malformato
- `_resolve_cantiere_ref`: gestire ambiguità (più match → chiedere all'utente)

### P2 — Funzionalità
- Cambio password da UI
- Multi-utente con ruoli (titolare/capocantiere/amministrativo/viewer)
- Export PDF/Excel report
- Dettaglio cantiere con timeline movimenti
- Previsioni cash flow AI a 3/6 mesi
- Notifiche email su soglie critiche
- Storico azioni AI (audit log) navigabile da UI

### P3 — UX
- Mobile responsive ottimizzato
- Streaming risposte AI (SSE)
- Filtri date avanzati su movimenti
- Ricerca full-text cantieri
- Allegati multipli per cantiere

## Costi e portabilità
- Deploy Emergent: $10/mese; AI a consumo (~$5-25/mese)
- Portabilità: tutte le env vars (MONGO_URL, EMERGENT_LLM_KEY, JWT_SECRET, ADMIN_*, CORS_ORIGINS) → funziona ovunque
- Cambio password admin: modifica `.env` + restart backend (re-hash idempotente)

## Credenziali
- Username: `Albertoadminapp` (case-insensitive)
- Password: `Murgi@2026!`
- Vedi `/app/memory/test_credentials.md`
