from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, date
from collections import defaultdict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="EdilControl API")
api_router = APIRouter(prefix="/api")


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


# ----- AI Advisor placeholder -----

@api_router.get("/ai-advisor/status")
async def ai_advisor_status():
    return {"abilitato": False, "messaggio": "Modulo Consulente AI in arrivo. Sarà attivabile in un secondo momento."}


# ============== APP SETUP ==============

app.include_router(api_router)

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
