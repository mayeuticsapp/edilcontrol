"""
Auth tests for EdilControl - iteration 4
Tests JWT login, protected endpoints, brute force, seed admin idempotency.
"""
import os
import pytest
import requests
import time
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://italian-speak-148.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

USERNAME = "Albertoadminapp"
PASSWORD = "Murgi@2026!"

# Direct MongoDB access for idempotency/hash checks
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture(scope="module")
def mongo_db():
    c = MongoClient(MONGO_URL)
    db = c[DB_NAME]
    yield db
    c.close()


@pytest.fixture(scope="module")
def token():
    # Clear lockouts first
    c = MongoClient(MONGO_URL)
    c[DB_NAME].login_attempts.delete_many({})
    c.close()
    r = requests.post(f"{API}/auth/login", json={"username": USERNAME, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ============ AUTH ENDPOINTS ============

class TestAuthLogin:
    def test_login_success(self):
        # clear lockouts for clean test
        c = MongoClient(MONGO_URL); c[DB_NAME].login_attempts.delete_many({}); c.close()
        r = requests.post(f"{API}/auth/login", json={"username": USERNAME, "password": PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and isinstance(d["access_token"], str) and len(d["access_token"]) > 20
        assert d["token_type"] == "bearer"
        assert d["user"]["username"] == USERNAME
        assert d["user"]["role"] == "admin"
        assert "password_hash" not in d["user"]
        assert d["expires_in"] == 24 * 3600

    def test_login_wrong_password(self):
        c = MongoClient(MONGO_URL); c[DB_NAME].login_attempts.delete_many({}); c.close()
        r = requests.post(f"{API}/auth/login", json={"username": USERNAME, "password": "WrongPass!"})
        assert r.status_code == 401
        assert "Credenziali non valide" in r.json().get("detail", "")
        # cleanup
        c = MongoClient(MONGO_URL); c[DB_NAME].login_attempts.delete_many({}); c.close()

    def test_login_unknown_user(self):
        c = MongoClient(MONGO_URL); c[DB_NAME].login_attempts.delete_many({}); c.close()
        r = requests.post(f"{API}/auth/login", json={"username": "nobody", "password": "x"})
        assert r.status_code == 401
        c = MongoClient(MONGO_URL); c[DB_NAME].login_attempts.delete_many({}); c.close()


class TestAuthMe:
    def test_me_with_token(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == USERNAME
        assert d["role"] == "admin"
        assert "password_hash" not in d
        assert "_id" not in d

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401
        assert "Non autenticato" in r.json().get("detail", "")

    def test_me_malformed_token(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer not.a.real.jwt"})
        assert r.status_code == 401


# ============ PROTECTED ENDPOINTS ============

PROTECTED_GET = [
    "/cantieri",
    "/movimenti",
    "/costi-fissi",
    "/dashboard/summary",
    "/ai-advisor/status",
]


class TestProtectedEndpoints:
    @pytest.mark.parametrize("path", PROTECTED_GET)
    def test_get_without_token_returns_401(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} should be protected"
        assert "Non autenticato" in r.json().get("detail", "")

    @pytest.mark.parametrize("path", PROTECTED_GET)
    def test_get_with_token_returns_200(self, path, auth_headers):
        r = requests.get(f"{API}{path}", headers=auth_headers)
        assert r.status_code == 200, f"{path} failed: {r.text}"

    def test_root_is_public(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert "EdilControl" in r.json().get("message", "")

    def test_seed_demo_protected(self):
        r = requests.post(f"{API}/seed-demo")
        assert r.status_code == 401

    def test_seed_demo_with_token(self, auth_headers):
        r = requests.post(f"{API}/seed-demo", headers=auth_headers)
        assert r.status_code == 200  # either seeded or "dati già presenti"

    def test_cantieri_post_protected(self):
        r = requests.post(f"{API}/cantieri", json={"nome": "x", "cliente": "y", "data_inizio": "2025-01-01"})
        assert r.status_code == 401

    def test_cantieri_crud_with_token(self, auth_headers):
        # CREATE
        payload = {"nome": "TEST_Auth_Cantiere", "cliente": "TEST_Client",
                   "data_inizio": "2025-01-01", "valore_commessa": 10000}
        r = requests.post(f"{API}/cantieri", json=payload, headers=auth_headers)
        assert r.status_code == 200
        created = r.json()
        assert created["nome"] == "TEST_Auth_Cantiere"
        cid = created["id"]
        # GET
        r = requests.get(f"{API}/cantieri/{cid}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["nome"] == "TEST_Auth_Cantiere"
        # DELETE (cleanup)
        r = requests.delete(f"{API}/cantieri/{cid}", headers=auth_headers)
        assert r.status_code == 200

    def test_ai_advisor_chat_protected(self):
        r = requests.post(f"{API}/ai-advisor/chat", json={"session_id": "x", "message": "hi"})
        assert r.status_code == 401


# ============ BRUTE FORCE PROTECTION ============

class TestBruteForce:
    def test_lockout_after_5_failures(self, mongo_db):
        # fresh slate
        mongo_db.login_attempts.delete_many({})
        unique_user = "Albertoadminapp"  # same user so it counts against identifier
        # 5 failed attempts
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"username": unique_user, "password": f"bad{i}"})
            assert r.status_code == 401, f"attempt {i+1}: expected 401, got {r.status_code}"
        # 6th -> 429
        r = requests.post(f"{API}/auth/login", json={"username": unique_user, "password": "bad6"})
        assert r.status_code == 429
        assert "Troppi tentativi" in r.json().get("detail", "")
        # Even correct password locked out
        r = requests.post(f"{API}/auth/login", json={"username": unique_user, "password": PASSWORD})
        assert r.status_code == 429
        # cleanup: clear attempts so other tests can login
        mongo_db.login_attempts.delete_many({})


# ============ DB-LEVEL CHECKS ============

class TestDatabase:
    def test_admin_seeded_once(self, mongo_db):
        count = mongo_db.users.count_documents({"username": USERNAME})
        assert count == 1, f"Expected 1 admin user, got {count}"

    def test_password_is_bcrypt_hashed(self, mongo_db):
        u = mongo_db.users.find_one({"username": USERNAME})
        assert u is not None
        h = u.get("password_hash", "")
        assert h.startswith("$2b$") or h.startswith("$2a$"), f"Password not bcrypt hashed: {h[:10]}"
        assert PASSWORD not in h, "Password should NOT be plaintext"

    def test_users_has_unique_index(self, mongo_db):
        idx = list(mongo_db.users.list_indexes())
        has_unique_username = any(
            ix.get("key", {}).get("username") and ix.get("unique")
            for ix in idx
        )
        assert has_unique_username, "users.username should have unique index"
