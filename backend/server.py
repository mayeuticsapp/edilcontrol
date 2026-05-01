from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, date, timedelta
from collections import defaultdict
import bcrypt
import jwt
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="EdilControl API")
api_router = APIRouter(prefix="/api")
auth_scheme = HTTPBearer(auto_error=False)


# ============== AUTH ==============

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme),
) -> dict:
    token = creds.credentials if creds else None
    if not token:
        # fallback: header parsing in case auto_error=False didn't catch it
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token non valido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessione scaduta, accedi di nuovo")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    expires_in: int


async def _check_lockout(identifier: str) -> None:
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return
    if rec.get("count", 0) >= MAX_FAILED_ATTEMPTS:
        last = rec.get("last_attempt")
        if last:
            # Normalizza tz-awareness: MongoDB può restituire naive datetime
            if isinstance(last, datetime) and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last).total_seconds() / 60
            if elapsed < LOCKOUT_MINUTES:
                raise HTTPException(
                    status_code=429,
                    detail=f"Troppi tentativi falliti. Riprova tra {int(LOCKOUT_MINUTES - elapsed) + 1} minuti."
                )
            # lockout scaduto, reset
            await db.login_attempts.delete_one({"identifier": identifier})


def _extract_client_ip(request: Request) -> str:
    """Estrae l'IP reale del client tenendo conto di proxy/ingress."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # primo IP della catena è il client originale
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if request.client else "unknown"


async def _record_failed_attempt(identifier: str) -> None:
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"count": 1}, "$set": {"last_attempt": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def _clear_attempts(identifier: str) -> None:
    await db.login_attempts.delete_one({"identifier": identifier})


@api_router.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request):
    ip = _extract_client_ip(request)
    identifier = f"{ip}:{req.username.lower()}"

    await _check_lockout(identifier)

    user = await db.users.find_one({"username": req.username})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        await _record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    await _clear_attempts(identifier)

    token = create_access_token(user["id"], user["username"])
    return LoginResponse(
        access_token=token,
        user={"id": user["id"], "username": user["username"], "role": user.get("role", "admin")},
        expires_in=JWT_EXPIRY_HOURS * 3600,
    )


@api_router.get("/auth/me")
async def auth_me(current=Depends(get_current_user)):
    return current


@api_router.post("/auth/logout")
async def logout(current=Depends(get_current_user)):
    # Stateless JWT: il client elimina il token. Endpoint esiste per coerenza/audit.
    return {"ok": True, "message": "Logout effettuato"}


async def seed_admin():
    """Crea/aggiorna l'utente admin in modo idempotente."""
    existing = await db.users.find_one({"username": ADMIN_USERNAME})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": ADMIN_USERNAME,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        # se la password in env è cambiata, aggiorna l'hash
        if not verify_password(ADMIN_PASSWORD, existing.get("password_hash", "")):
            await db.users.update_one(
                {"username": ADMIN_USERNAME},
                {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}}
            )
    # indici
    try:
        await db.users.create_index("username", unique=True)
        await db.login_attempts.create_index("identifier")
    except Exception:
        pass


@app.on_event("startup")
async def on_startup():
    await seed_admin()


# Dependency da applicare a tutte le rotte protette
AuthDep = Depends(get_current_user)


# ============== MODELS ==============

class Cantiere(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str
    cliente: str
    indirizzo: str = ""
    data_inizio: str  # ISO date
    data_fine_prevista: Optional[str] = None
    stato: Literal["in_corso", "completato", "sospeso"] = "in_corso"
    valore_commessa: float = 0.0
    costi_materiali: float = 0.0
    costi_manodopera: float = 0.0
    costi_subappalti: float = 0.0
    altri_costi: float = 0.0
    note: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CantiereCreate(BaseModel):
    nome: str
    cliente: str
    indirizzo: str = ""
    data_inizio: str
    data_fine_prevista: Optional[str] = None
    stato: Literal["in_corso", "completato", "sospeso"] = "in_corso"
    valore_commessa: float = 0.0
    costi_materiali: float = 0.0
    costi_manodopera: float = 0.0
    costi_subappalti: float = 0.0
    altri_costi: float = 0.0
    note: str = ""


class Movimento(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: str  # ISO date
    tipo: Literal["entrata", "uscita"]
    categoria: str  # es: Materiali, Manodopera, Subappalti, Acconto cliente, SAL, Tasse, Affitto, Mezzi
    descrizione: str
    importo: float
    cantiere_id: Optional[str] = None
    metodo_pagamento: str = "bonifico"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MovimentoCreate(BaseModel):
    data: str
    tipo: Literal["entrata", "uscita"]
    categoria: str
    descrizione: str
    importo: float
    cantiere_id: Optional[str] = None
    metodo_pagamento: str = "bonifico"


class CostoFisso(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    descrizione: str
    categoria: str  # es: Affitto, Leasing mezzi, Stipendi fissi, Software, Utenze, Assicurazioni
    importo_mensile: float
    attivo: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CostoFissoCreate(BaseModel):
    descrizione: str
    categoria: str
    importo_mensile: float
    attivo: bool = True


class BreakEvenInput(BaseModel):
    costi_fissi_mensili: float
    prezzo_medio_commessa: float
    costo_variabile_medio: float


class BreakEvenResult(BaseModel):
    commesse_pareggio: float
    fatturato_pareggio: float
    margine_unitario: float
    margine_percentuale: float


# ============== HELPERS ==============

def _strip_id(doc):
    if doc and "_id" in doc:
        del doc["_id"]
    return doc


# ============== ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "EdilControl API attiva", "version": "1.0.0"}


# ----- Cantieri -----

@api_router.post("/cantieri", response_model=Cantiere)
async def create_cantiere(input: CantiereCreate):
    obj = Cantiere(**input.model_dump())
    await db.cantieri.insert_one(obj.model_dump())
    return obj


@api_router.get("/cantieri", response_model=List[Cantiere])
async def list_cantieri():
    docs = await db.cantieri.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.get("/cantieri/{cantiere_id}", response_model=Cantiere)
async def get_cantiere(cantiere_id: str):
    doc = await db.cantieri.find_one({"id": cantiere_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cantiere non trovato")
    return doc


@api_router.put("/cantieri/{cantiere_id}", response_model=Cantiere)
async def update_cantiere(cantiere_id: str, input: CantiereCreate):
    existing = await db.cantieri.find_one({"id": cantiere_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Cantiere non trovato")
    data = input.model_dump()
    await db.cantieri.update_one({"id": cantiere_id}, {"$set": data})
    updated = await db.cantieri.find_one({"id": cantiere_id}, {"_id": 0})
    return updated


@api_router.delete("/cantieri/{cantiere_id}")
async def delete_cantiere(cantiere_id: str):
    res = await db.cantieri.delete_one({"id": cantiere_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Cantiere non trovato")
    return {"ok": True}


# ----- Movimenti -----

@api_router.post("/movimenti", response_model=Movimento)
async def create_movimento(input: MovimentoCreate):
    obj = Movimento(**input.model_dump())
    await db.movimenti.insert_one(obj.model_dump())
    return obj


@api_router.get("/movimenti", response_model=List[Movimento])
async def list_movimenti(cantiere_id: Optional[str] = None, tipo: Optional[str] = None):
    query = {}
    if cantiere_id:
        query["cantiere_id"] = cantiere_id
    if tipo:
        query["tipo"] = tipo
    docs = await db.movimenti.find(query, {"_id": 0}).sort("data", -1).to_list(2000)
    return docs


@api_router.delete("/movimenti/{movimento_id}")
async def delete_movimento(movimento_id: str):
    res = await db.movimenti.delete_one({"id": movimento_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Movimento non trovato")
    return {"ok": True}


# ----- Costi Fissi -----

@api_router.post("/costi-fissi", response_model=CostoFisso)
async def create_costo_fisso(input: CostoFissoCreate):
    obj = CostoFisso(**input.model_dump())
    await db.costi_fissi.insert_one(obj.model_dump())
    return obj


@api_router.get("/costi-fissi", response_model=List[CostoFisso])
async def list_costi_fissi():
    docs = await db.costi_fissi.find({}, {"_id": 0}).to_list(500)
    return docs


@api_router.delete("/costi-fissi/{costo_id}")
async def delete_costo_fisso(costo_id: str):
    res = await db.costi_fissi.delete_one({"id": costo_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Costo fisso non trovato")
    return {"ok": True}


# ----- Break Even -----

@api_router.post("/calcoli/break-even", response_model=BreakEvenResult)
async def calc_break_even(input: BreakEvenInput):
    margine_unitario = input.prezzo_medio_commessa - input.costo_variabile_medio
    if margine_unitario <= 0:
        raise HTTPException(400, "Il margine unitario deve essere positivo (prezzo > costo variabile)")
    commesse = input.costi_fissi_mensili / margine_unitario
    fatturato = commesse * input.prezzo_medio_commessa
    margine_pct = (margine_unitario / input.prezzo_medio_commessa) * 100 if input.prezzo_medio_commessa > 0 else 0
    return BreakEvenResult(
        commesse_pareggio=round(commesse, 2),
        fatturato_pareggio=round(fatturato, 2),
        margine_unitario=round(margine_unitario, 2),
        margine_percentuale=round(margine_pct, 2),
    )


# ----- Dashboard / Summary -----

@api_router.get("/dashboard/summary")
async def dashboard_summary():
    movimenti = await db.movimenti.find({}, {"_id": 0}).to_list(5000)
    cantieri = await db.cantieri.find({}, {"_id": 0}).to_list(1000)
    costi_fissi_docs = await db.costi_fissi.find({"attivo": True}, {"_id": 0}).to_list(500)

    fatturato = sum(m["importo"] for m in movimenti if m["tipo"] == "entrata")
    uscite_totali = sum(m["importo"] for m in movimenti if m["tipo"] == "uscita")
    cash_position = fatturato - uscite_totali

    # Ripartizione costi (uscite) per categoria
    categorie_costi = defaultdict(float)
    for m in movimenti:
        if m["tipo"] == "uscita":
            categorie_costi[m["categoria"]] += m["importo"]

    # Costi del venduto (Materiali, Manodopera, Subappalti, Mezzi, Noli)
    cat_venduto = {"Materiali", "Manodopera", "Subappalti", "Mezzi", "Noli", "Carburante"}
    cat_personale = {"Stipendi", "Contributi", "TFR"}
    costi_venduto = sum(v for k, v in categorie_costi.items() if k in cat_venduto)
    costi_personale = sum(v for k, v in categorie_costi.items() if k in cat_personale)
    costi_operativi = sum(v for k, v in categorie_costi.items() if k not in cat_venduto and k not in cat_personale)

    margine_primo = fatturato - costi_venduto
    ebitda = margine_primo - costi_operativi - costi_personale
    ebitda_pct = (ebitda / fatturato * 100) if fatturato > 0 else 0

    # Status semaforo
    if ebitda_pct >= 20:
        ebitda_status = "ottimo"
    elif ebitda_pct >= 15:
        ebitda_status = "buono"
    elif ebitda_pct >= 5:
        ebitda_status = "attenzione"
    else:
        ebitda_status = "critico"

    # Costi fissi mensili
    costi_fissi_mensili = sum(c["importo_mensile"] for c in costi_fissi_docs)
    mesi_copertura = (cash_position / costi_fissi_mensili) if costi_fissi_mensili > 0 else 0

    # Cash flow per mese (ultimi 12 mesi)
    monthly = defaultdict(lambda: {"entrate": 0.0, "uscite": 0.0})
    for m in movimenti:
        try:
            d = m["data"][:7]  # YYYY-MM
            if m["tipo"] == "entrata":
                monthly[d]["entrate"] += m["importo"]
            else:
                monthly[d]["uscite"] += m["importo"]
        except Exception:
            continue
    cash_flow_mensile = sorted(
        [{"mese": k, "entrate": round(v["entrate"], 2), "uscite": round(v["uscite"], 2),
          "saldo": round(v["entrate"] - v["uscite"], 2)} for k, v in monthly.items()],
        key=lambda x: x["mese"]
    )[-12:]

    # Cantieri stats
    cantieri_attivi = sum(1 for c in cantieri if c["stato"] == "in_corso")
    valore_portafoglio = sum(c["valore_commessa"] for c in cantieri if c["stato"] == "in_corso")

    return {
        "fatturato": round(fatturato, 2),
        "uscite_totali": round(uscite_totali, 2),
        "cash_position": round(cash_position, 2),
        "costi_venduto": round(costi_venduto, 2),
        "costi_operativi": round(costi_operativi, 2),
        "costi_personale": round(costi_personale, 2),
        "margine_primo": round(margine_primo, 2),
        "ebitda": round(ebitda, 2),
        "ebitda_percentuale": round(ebitda_pct, 2),
        "ebitda_status": ebitda_status,
        "costi_fissi_mensili": round(costi_fissi_mensili, 2),
        "mesi_copertura_cassa": round(mesi_copertura, 2),
        "ripartizione_costi": [{"categoria": k, "importo": round(v, 2)} for k, v in categorie_costi.items()],
        "cash_flow_mensile": cash_flow_mensile,
        "cantieri_totali": len(cantieri),
        "cantieri_attivi": cantieri_attivi,
        "valore_portafoglio": round(valore_portafoglio, 2),
    }


@api_router.get("/dashboard/cantieri-margini")
async def cantieri_margini():
    cantieri = await db.cantieri.find({}, {"_id": 0}).to_list(1000)
    result = []
    for c in cantieri:
        costi_totali = c["costi_materiali"] + c["costi_manodopera"] + c["costi_subappalti"] + c.get("altri_costi", 0)
        margine = c["valore_commessa"] - costi_totali
        margine_pct = (margine / c["valore_commessa"] * 100) if c["valore_commessa"] > 0 else 0
        result.append({
            "id": c["id"],
            "nome": c["nome"],
            "cliente": c["cliente"],
            "stato": c["stato"],
            "valore_commessa": c["valore_commessa"],
            "costi_totali": round(costi_totali, 2),
            "margine": round(margine, 2),
            "margine_percentuale": round(margine_pct, 2),
        })
    return result


# ----- Seed demo data (idempotent) -----

@api_router.post("/seed-demo")
async def seed_demo():
    """Seed demo data se database vuoto"""
    existing = await db.cantieri.count_documents({})
    if existing > 0:
        return {"seeded": False, "message": "Dati già presenti"}

    # Cantieri
    cantieri_demo = [
        {"nome": "Ristrutturazione Villa Bianchi", "cliente": "Famiglia Bianchi",
         "indirizzo": "Via Roma 12, Milano", "data_inizio": "2025-09-15",
         "data_fine_prevista": "2026-03-30", "stato": "in_corso",
         "valore_commessa": 180000, "costi_materiali": 65000, "costi_manodopera": 45000,
         "costi_subappalti": 22000, "altri_costi": 5000,
         "note": "Ristrutturazione completa, classe energetica A"},
        {"nome": "Condominio Via Garibaldi", "cliente": "Amm. Rossi & Co",
         "indirizzo": "Via Garibaldi 34, Bergamo", "data_inizio": "2025-11-01",
         "data_fine_prevista": "2026-06-15", "stato": "in_corso",
         "valore_commessa": 95000, "costi_materiali": 38000, "costi_manodopera": 22000,
         "costi_subappalti": 12000, "altri_costi": 3000,
         "note": "Rifacimento facciata e cappotto termico"},
        {"nome": "Capannone Industriale Verdi", "cliente": "Verdi SRL",
         "indirizzo": "Z.I. Lotto 18, Brescia", "data_inizio": "2025-06-01",
         "data_fine_prevista": "2025-12-20", "stato": "completato",
         "valore_commessa": 320000, "costi_materiali": 145000, "costi_manodopera": 78000,
         "costi_subappalti": 35000, "altri_costi": 8000,
         "note": "Costruzione capannone 1.200 mq"},
        {"nome": "Bagno Studio Notarile", "cliente": "Notaio Ferrari",
         "indirizzo": "Corso Italia 4, Milano", "data_inizio": "2025-12-10",
         "data_fine_prevista": "2026-02-10", "stato": "in_corso",
         "valore_commessa": 28000, "costi_materiali": 9500, "costi_manodopera": 6500,
         "costi_subappalti": 2000, "altri_costi": 800, "note": "Lavori di piccola entità"},
    ]
    cantieri_objs = [Cantiere(**c) for c in cantieri_demo]
    await db.cantieri.insert_many([c.model_dump() for c in cantieri_objs])

    # Costi fissi
    costi_fissi_demo = [
        {"descrizione": "Affitto deposito mezzi", "categoria": "Affitto", "importo_mensile": 1800, "attivo": True},
        {"descrizione": "Leasing escavatore", "categoria": "Leasing mezzi", "importo_mensile": 1200, "attivo": True},
        {"descrizione": "Stipendi capisquadra (3)", "categoria": "Stipendi fissi", "importo_mensile": 9000, "attivo": True},
        {"descrizione": "Software gestionale", "categoria": "Software", "importo_mensile": 180, "attivo": True},
        {"descrizione": "Utenze ufficio", "categoria": "Utenze", "importo_mensile": 350, "attivo": True},
        {"descrizione": "Assicurazione cantieri RCT", "categoria": "Assicurazioni", "importo_mensile": 480, "attivo": True},
        {"descrizione": "Commercialista", "categoria": "Consulenze", "importo_mensile": 600, "attivo": True},
    ]
    cf_objs = [CostoFisso(**c) for c in costi_fissi_demo]
    await db.costi_fissi.insert_many([c.model_dump() for c in cf_objs])

    # Movimenti (ultimi 6 mesi)
    cantiere_ids = [c.id for c in cantieri_objs]
    movimenti_demo = [
        # Entrate (acconti, SAL, saldi)
        {"data": "2025-08-15", "tipo": "entrata", "categoria": "Acconto cliente", "descrizione": "Acconto Capannone Verdi", "importo": 100000, "cantiere_id": cantiere_ids[2]},
        {"data": "2025-09-20", "tipo": "entrata", "categoria": "SAL", "descrizione": "SAL 1 Capannone Verdi", "importo": 110000, "cantiere_id": cantiere_ids[2]},
        {"data": "2025-09-18", "tipo": "entrata", "categoria": "Acconto cliente", "descrizione": "Acconto Villa Bianchi", "importo": 50000, "cantiere_id": cantiere_ids[0]},
        {"data": "2025-10-25", "tipo": "entrata", "categoria": "SAL", "descrizione": "SAL 2 Capannone Verdi", "importo": 80000, "cantiere_id": cantiere_ids[2]},
        {"data": "2025-11-05", "tipo": "entrata", "categoria": "Acconto cliente", "descrizione": "Acconto Condominio Garibaldi", "importo": 30000, "cantiere_id": cantiere_ids[1]},
        {"data": "2025-11-28", "tipo": "entrata", "categoria": "SAL", "descrizione": "SAL Villa Bianchi", "importo": 45000, "cantiere_id": cantiere_ids[0]},
        {"data": "2025-12-15", "tipo": "entrata", "categoria": "Saldo finale", "descrizione": "Saldo Capannone Verdi", "importo": 30000, "cantiere_id": cantiere_ids[2]},
        {"data": "2025-12-20", "tipo": "entrata", "categoria": "Acconto cliente", "descrizione": "Acconto Studio Notarile", "importo": 10000, "cantiere_id": cantiere_ids[3]},
        # Uscite
        {"data": "2025-08-10", "tipo": "uscita", "categoria": "Materiali", "descrizione": "Cemento e ferro", "importo": 35000, "cantiere_id": cantiere_ids[2]},
        {"data": "2025-08-30", "tipo": "uscita", "categoria": "Manodopera", "descrizione": "Stipendi operai agosto", "importo": 18000, "cantiere_id": None},
        {"data": "2025-09-05", "tipo": "uscita", "categoria": "Subappalti", "descrizione": "Impianti elettrici Verdi", "importo": 18000, "cantiere_id": cantiere_ids[2]},
        {"data": "2025-09-15", "tipo": "uscita", "categoria": "Materiali", "descrizione": "Materiali Villa Bianchi", "importo": 28000, "cantiere_id": cantiere_ids[0]},
        {"data": "2025-09-30", "tipo": "uscita", "categoria": "Manodopera", "descrizione": "Stipendi operai settembre", "importo": 19500, "cantiere_id": None},
        {"data": "2025-10-12", "tipo": "uscita", "categoria": "Materiali", "descrizione": "Pannelli e infissi", "importo": 22000, "cantiere_id": cantiere_ids[0]},
        {"data": "2025-10-20", "tipo": "uscita", "categoria": "Subappalti", "descrizione": "Idraulici Villa", "importo": 12000, "cantiere_id": cantiere_ids[0]},
        {"data": "2025-10-30", "tipo": "uscita", "categoria": "Manodopera", "descrizione": "Stipendi operai ottobre", "importo": 19500, "cantiere_id": None},
        {"data": "2025-11-08", "tipo": "uscita", "categoria": "Carburante", "descrizione": "Carburante mezzi", "importo": 1800, "cantiere_id": None},
        {"data": "2025-11-15", "tipo": "uscita", "categoria": "Materiali", "descrizione": "Cappotto termico Garibaldi", "importo": 21000, "cantiere_id": cantiere_ids[1]},
        {"data": "2025-11-30", "tipo": "uscita", "categoria": "Manodopera", "descrizione": "Stipendi operai novembre", "importo": 21000, "cantiere_id": None},
        {"data": "2025-11-30", "tipo": "uscita", "categoria": "Affitto", "descrizione": "Affitto deposito", "importo": 1800, "cantiere_id": None},
        {"data": "2025-12-05", "tipo": "uscita", "categoria": "Tasse", "descrizione": "F24 dicembre", "importo": 14500, "cantiere_id": None},
        {"data": "2025-12-15", "tipo": "uscita", "categoria": "Subappalti", "descrizione": "Tinteggiature Garibaldi", "importo": 9500, "cantiere_id": cantiere_ids[1]},
        {"data": "2025-12-22", "tipo": "uscita", "categoria": "Materiali", "descrizione": "Bagno Studio Notarile", "importo": 7800, "cantiere_id": cantiere_ids[3]},
        {"data": "2025-12-30", "tipo": "uscita", "categoria": "Manodopera", "descrizione": "Stipendi operai dicembre", "importo": 22000, "cantiere_id": None},
        {"data": "2026-01-05", "tipo": "uscita", "categoria": "Mezzi", "descrizione": "Manutenzione escavatore", "importo": 2400, "cantiere_id": None},
        {"data": "2026-01-10", "tipo": "entrata", "categoria": "SAL", "descrizione": "SAL 1 Garibaldi", "importo": 25000, "cantiere_id": cantiere_ids[1]},
    ]
    mov_objs = [Movimento(**m) for m in movimenti_demo]
    await db.movimenti.insert_many([m.model_dump() for m in mov_objs])

    return {"seeded": True, "cantieri": len(cantieri_demo), "movimenti": len(movimenti_demo), "costi_fissi": len(costi_fissi_demo)}


# ----- AI Advisor (Claude Sonnet 4.5) -----

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str


async def _build_financial_context() -> str:
    """Costruisce il contesto finanziario reale da iniettare nel system prompt."""
    movimenti = await db.movimenti.find({}, {"_id": 0}).to_list(5000)
    cantieri = await db.cantieri.find({}, {"_id": 0}).to_list(1000)
    costi_fissi = await db.costi_fissi.find({"attivo": True}, {"_id": 0}).to_list(500)

    fatturato = sum(m["importo"] for m in movimenti if m["tipo"] == "entrata")
    uscite = sum(m["importo"] for m in movimenti if m["tipo"] == "uscita")
    cassa = fatturato - uscite

    cat_costi = defaultdict(float)
    for m in movimenti:
        if m["tipo"] == "uscita":
            cat_costi[m["categoria"]] += m["importo"]
    cat_venduto = {"Materiali", "Manodopera", "Subappalti", "Mezzi", "Noli", "Carburante"}
    cat_personale = {"Stipendi", "Contributi", "TFR"}
    costi_v = sum(v for k, v in cat_costi.items() if k in cat_venduto)
    costi_p = sum(v for k, v in cat_costi.items() if k in cat_personale)
    costi_o = sum(v for k, v in cat_costi.items() if k not in cat_venduto and k not in cat_personale)
    ebitda = fatturato - costi_v - costi_o - costi_p
    ebitda_pct = (ebitda / fatturato * 100) if fatturato > 0 else 0
    cf_mensili = sum(c["importo_mensile"] for c in costi_fissi)
    mesi_cop = (cassa / cf_mensili) if cf_mensili > 0 else 0

    cantieri_info = []
    for c in cantieri:
        costi_c = c["costi_materiali"] + c["costi_manodopera"] + c["costi_subappalti"] + c.get("altri_costi", 0)
        margine = c["valore_commessa"] - costi_c
        margine_pct = (margine / c["valore_commessa"] * 100) if c["valore_commessa"] > 0 else 0
        cantieri_info.append(
            f"  - {c['nome']} ({c['cliente']}, {c['stato']}): valore €{c['valore_commessa']:,.0f}, "
            f"costi €{costi_c:,.0f}, margine €{margine:,.0f} ({margine_pct:.1f}%)"
        )

    cat_lines = "\n".join(f"  - {k}: €{v:,.0f}" for k, v in sorted(cat_costi.items(), key=lambda x: -x[1]))
    cantieri_lines = "\n".join(cantieri_info) if cantieri_info else "  (nessun cantiere)"

    return f"""DATI FINANZIARI ATTUALI DELL'IMPRESA EDILE:

CONTO ECONOMICO:
- Fatturato totale: €{fatturato:,.0f}
- Costi del venduto (materiali, manodopera, subappalti): €{costi_v:,.0f}
- Costi operativi: €{costi_o:,.0f}
- Costi del personale: €{costi_p:,.0f}
- EBITDA: €{ebitda:,.0f} ({ebitda_pct:.1f}% del fatturato)

LIQUIDITÀ:
- Posizione di cassa: €{cassa:,.0f}
- Costi fissi mensili: €{cf_mensili:,.0f}
- Mesi di copertura: {mesi_cop:.1f}

CANTIERI ({len(cantieri)} totali):
{cantieri_lines}

RIPARTIZIONE COSTI PER CATEGORIA:
{cat_lines}
"""


SYSTEM_PROMPT_BASE = """Sei un Consulente Finanziario AI specializzato per imprese edili italiane.
Il tuo ruolo è analizzare i dati finanziari dell'azienda e fornire consigli concreti, pratici e in italiano.

REGOLE:
- Rispondi SEMPRE in italiano
- Sii diretto, sintetico e professionale (max 4-6 frasi per risposta, salvo richieste di approfondimento)
- Usa cifre concrete dai dati forniti, non inventare numeri
- Identifica criticità (EBITDA<15%, cassa<3 mesi, margini commesse<10%) e suggerisci azioni
- Conosci la terminologia edile: cantiere, commessa, SAL, subappalti, cappotto, capannone, ecc.
- Le soglie di riferimento per il settore edile sono:
  * EBITDA: ottimo >20%, buono 15-20%, attenzione 5-15%, critico <5%
  * Margine commessa: ottimo >20%, attenzione 10-20%, critico <10%
  * Copertura cassa: minimo 3 mesi di costi fissi
- Quando suggerisci azioni, sii specifico (es: "rinegozia il fornitore X", "aumenta del 5% il prezzo medio")
- Non rispondere a domande non finanziarie/aziendali. Se l'utente chiede altro, riconducilo al suo business.
"""


@api_router.get("/ai-advisor/status")
async def ai_advisor_status():
    return {
        "abilitato": bool(EMERGENT_LLM_KEY),
        "modello": "claude-sonnet-4-5-20250929",
        "provider": "anthropic",
        "messaggio": "Consulente AI attivo" if EMERGENT_LLM_KEY else "EMERGENT_LLM_KEY non configurata"
    }


@api_router.post("/ai-advisor/chat", response_model=ChatResponse)
async def ai_advisor_chat(req: ChatRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "Consulente AI non configurato (EMERGENT_LLM_KEY mancante)")
    if not req.message.strip():
        raise HTTPException(400, "Messaggio vuoto")

    # Carica cronologia PRIMA di salvare il nuovo messaggio (ultimi 20 turni)
    prior = await db.chat_messages.find(
        {"session_id": req.session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(40)
    prior = prior[-20:]  # cap a 20 messaggi per controllo costi

    # Salva il messaggio utente
    user_msg = ChatMessage(session_id=req.session_id, role="user", content=req.message)
    await db.chat_messages.insert_one(user_msg.model_dump())

    # Costruisce contesto finanziario aggiornato e system prompt
    contesto = await _build_financial_context()
    system_prompt = SYSTEM_PROMPT_BASE + "\n\n" + contesto

    # Costruisce il messaggio includendo la cronologia (stateless multi-turn)
    if prior:
        transcript_lines = []
        for m in prior:
            label = "Utente" if m["role"] == "user" else "Tu (assistente)"
            transcript_lines.append(f"{label}: {m['content']}")
        transcript = "\n".join(transcript_lines)
        full_message = (
            f"[CRONOLOGIA CONVERSAZIONE PRECEDENTE]\n{transcript}\n"
            f"[FINE CRONOLOGIA]\n\n"
            f"[NUOVO MESSAGGIO DELL'UTENTE]\n{req.message}"
        )
    else:
        full_message = req.message

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=req.session_id,
            system_message=system_prompt,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        reply_text = await chat.send_message(UserMessage(text=full_message))
    except Exception as e:
        logger.exception("Errore Claude")
        raise HTTPException(500, "Errore nella chiamata al Consulente AI")

    # Salva la risposta
    assistant_msg = ChatMessage(session_id=req.session_id, role="assistant", content=reply_text)
    await db.chat_messages.insert_one(assistant_msg.model_dump())

    return ChatResponse(session_id=req.session_id, reply=reply_text)


@api_router.get("/ai-advisor/history/{session_id}", response_model=List[ChatMessage])
async def ai_advisor_history(session_id: str):
    docs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return docs


@api_router.delete("/ai-advisor/history/{session_id}")
async def ai_advisor_clear(session_id: str):
    await db.chat_messages.delete_many({"session_id": session_id})
    return {"ok": True}


# ============== APP SETUP ==============

app.include_router(api_router)

# ============== AUTH MIDDLEWARE ==============
# Protegge tutti gli endpoint /api/* eccetto la whitelist pubblica
PUBLIC_PATHS = {"/api/", "/api", "/api/auth/login", "/docs", "/openapi.json", "/redoc"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    # CORS preflight
    if method == "OPTIONS":
        return await call_next(request)

    # Whitelist
    if path in PUBLIC_PATHS or not path.startswith("/api/"):
        return await call_next(request)

    # Verifica JWT
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        from starlette.responses import JSONResponse
        return JSONResponse({"detail": "Non autenticato"}, status_code=401)
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            from starlette.responses import JSONResponse
            return JSONResponse({"detail": "Token non valido"}, status_code=401)
        request.state.user_id = payload.get("sub")
        request.state.username = payload.get("username")
    except jwt.ExpiredSignatureError:
        from starlette.responses import JSONResponse
        return JSONResponse({"detail": "Sessione scaduta, accedi di nuovo"}, status_code=401)
    except jwt.InvalidTokenError:
        from starlette.responses import JSONResponse
        return JSONResponse({"detail": "Token non valido"}, status_code=401)

    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
