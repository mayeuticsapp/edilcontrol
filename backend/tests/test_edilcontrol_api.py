"""EdilControl backend API tests"""
import os
import pytest
import requests

BASE_URL = "https://italian-speak-148.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def seed(client):
    # Ensure data is seeded before tests
    r = client.post(f"{API}/seed-demo", timeout=30)
    assert r.status_code == 200
    return r.json()


# ---------- Root ----------
def test_root(client):
    r = client.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert "EdilControl" in j.get("message", "")


# ---------- Seed ----------
def test_seed_idempotent(client):
    r = client.post(f"{API}/seed-demo", timeout=30)
    assert r.status_code == 200
    j = r.json()
    # Already seeded by autouse fixture
    assert j.get("seeded") is False


# ---------- Cantieri ----------
def test_list_cantieri(client):
    r = client.get(f"{API}/cantieri", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 4
    for c in data:
        assert "_id" not in c
        assert "id" in c and isinstance(c["id"], str)
        assert "nome" in c


def test_cantiere_crud(client):
    payload = {
        "nome": "TEST_Cantiere",
        "cliente": "TEST_Cliente",
        "indirizzo": "Test Via 1",
        "data_inizio": "2026-01-01",
        "stato": "in_corso",
        "valore_commessa": 50000,
        "costi_materiali": 10000,
        "costi_manodopera": 8000,
        "costi_subappalti": 2000,
        "altri_costi": 500,
    }
    r = client.post(f"{API}/cantieri", json=payload, timeout=10)
    assert r.status_code == 200
    created = r.json()
    cid = created["id"]
    assert created["nome"] == "TEST_Cantiere"
    assert "_id" not in created

    # GET
    r = client.get(f"{API}/cantieri/{cid}", timeout=10)
    assert r.status_code == 200
    assert r.json()["cliente"] == "TEST_Cliente"

    # UPDATE
    payload["nome"] = "TEST_Cantiere_Updated"
    r = client.put(f"{API}/cantieri/{cid}", json=payload, timeout=10)
    assert r.status_code == 200
    assert r.json()["nome"] == "TEST_Cantiere_Updated"

    # DELETE
    r = client.delete(f"{API}/cantieri/{cid}", timeout=10)
    assert r.status_code == 200

    # Verify deletion
    r = client.get(f"{API}/cantieri/{cid}", timeout=10)
    assert r.status_code == 404


# ---------- Movimenti ----------
def test_list_movimenti(client):
    r = client.get(f"{API}/movimenti", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 20
    for m in data:
        assert "_id" not in m
        assert m["tipo"] in ["entrata", "uscita"]


def test_list_movimenti_filter(client):
    r = client.get(f"{API}/movimenti?tipo=entrata", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert all(m["tipo"] == "entrata" for m in data)


def test_create_movimento(client):
    payload = {
        "data": "2026-01-15",
        "tipo": "uscita",
        "categoria": "Materiali",
        "descrizione": "TEST_Mov",
        "importo": 1234.56,
    }
    r = client.post(f"{API}/movimenti", json=payload, timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["importo"] == 1234.56
    # cleanup
    client.delete(f"{API}/movimenti/{j['id']}", timeout=10)


# ---------- Costi Fissi ----------
def test_costi_fissi_crud(client):
    r = client.get(f"{API}/costi-fissi", timeout=10)
    assert r.status_code == 200
    assert len(r.json()) >= 7

    payload = {"descrizione": "TEST_CF", "categoria": "Software", "importo_mensile": 99.9, "attivo": True}
    r = client.post(f"{API}/costi-fissi", json=payload, timeout=10)
    assert r.status_code == 200
    cid = r.json()["id"]
    r = client.delete(f"{API}/costi-fissi/{cid}", timeout=10)
    assert r.status_code == 200


# ---------- Break Even ----------
def test_break_even_ok(client):
    payload = {"costi_fissi_mensili": 10000, "prezzo_medio_commessa": 50000, "costo_variabile_medio": 35000}
    r = client.post(f"{API}/calcoli/break-even", json=payload, timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["margine_unitario"] == 15000
    assert j["commesse_pareggio"] == round(10000 / 15000, 2)
    assert j["margine_percentuale"] == 30.0


def test_break_even_invalid_margin(client):
    payload = {"costi_fissi_mensili": 1000, "prezzo_medio_commessa": 100, "costo_variabile_medio": 100}
    r = client.post(f"{API}/calcoli/break-even", json=payload, timeout=10)
    assert r.status_code == 400


# ---------- Dashboard ----------
def test_dashboard_summary(client):
    r = client.get(f"{API}/dashboard/summary", timeout=15)
    assert r.status_code == 200
    j = r.json()
    for k in ["fatturato", "ebitda", "ebitda_percentuale", "ebitda_status",
              "cash_position", "cash_flow_mensile", "ripartizione_costi"]:
        assert k in j
    assert j["ebitda_status"] in ["ottimo", "buono", "attenzione", "critico"]
    assert isinstance(j["cash_flow_mensile"], list)
    assert isinstance(j["ripartizione_costi"], list)
    assert j["fatturato"] > 0


def test_dashboard_cantieri_margini(client):
    r = client.get(f"{API}/dashboard/cantieri-margini", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 4
    for c in data:
        assert "margine" in c and "margine_percentuale" in c
        assert "_id" not in c


# ---------- AI Advisor ----------
def test_ai_advisor_status(client):
    r = client.get(f"{API}/ai-advisor/status", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["abilitato"] is False
    assert "messaggio" in j
