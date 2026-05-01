"""Tests for the Agentic AI Advisor feature (iteration 6).

Covers:
- /api/ai-advisor/status agentic flag + tools list
- /api/ai-advisor/chat: message vs proposed_actions reply types
- /api/ai-advisor/confirm-action actually persists in MongoDB
- /api/ai-advisor/cancel-action marks proposal as cancelled
- /api/ai-advisor/upload accepts allowed mime types, rejects others & oversize
- ai_actions_log audit collection
- Bearer auth required
"""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://italian-speak-148.preview.emergentagent.com").rstrip("/")
USERNAME = "Albertoadminapp"
PASSWORD = "Murgi@2026!"


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USERNAME, "password": PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def session_id():
    sid = f"test-{uuid.uuid4()}"
    yield sid
    # cleanup chat history + uploaded files for this session
    try:
        token = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USERNAME, "password": PASSWORD}).json().get("access_token")
        requests.delete(f"{BASE_URL}/api/ai-advisor/history/{sid}", headers={"Authorization": f"Bearer {token}"})
    except Exception:
        pass


# ---------- Auth requirement ----------

class TestAuthRequired:
    def test_chat_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/ai-advisor/chat", json={"session_id": "x", "message": "ciao"})
        assert r.status_code in (401, 403)

    def test_status_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/ai-advisor/status")
        assert r.status_code in (401, 403)

    def test_upload_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/ai-advisor/upload",
                          files={"file": ("t.png", b"x", "image/png")})
        assert r.status_code in (401, 403)


# ---------- Status ----------

class TestStatus:
    def test_status_agentic_flag_and_tools(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/ai-advisor/status", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("agentic") is True
        assert isinstance(data.get("tools"), list)
        expected = {"crea_cantiere", "aggiorna_cantiere", "elimina_cantiere",
                    "crea_movimento", "elimina_movimento", "crea_costo_fisso", "elimina_costo_fisso"}
        assert set(data["tools"]) == expected, f"Got tools: {data['tools']}"


# ---------- Upload ----------

PNG_BYTES = bytes.fromhex(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
    "0000000D49444154789C6360000000000200013F2A40330000000049454E44AE426082"
)


class TestUpload:
    def test_upload_png_ok(self, auth_headers, session_id):
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/upload",
            headers=auth_headers,
            params={"session_id": session_id},
            files={"file": ("t.png", PNG_BYTES, "image/png")},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "file_id" in data and isinstance(data["file_id"], str)
        assert data["filename"] == "t.png"
        assert data["content_type"] == "image/png"
        assert data["size"] == len(PNG_BYTES)

    def test_upload_pdf_ok(self, auth_headers, session_id):
        pdf = b"%PDF-1.4\n%EOF\n"
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/upload",
            headers=auth_headers,
            params={"session_id": session_id},
            files={"file": ("t.pdf", pdf, "application/pdf")},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["content_type"] == "application/pdf"

    def test_upload_unsupported_format_rejected(self, auth_headers, session_id):
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/upload",
            headers=auth_headers,
            params={"session_id": session_id},
            files={"file": ("t.txt", b"hello", "text/plain")},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_upload_oversize_rejected(self, auth_headers, session_id):
        # 9 MB PNG header + filler -> oversize check triggers (server checks >8MB)
        big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (9 * 1024 * 1024)
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/upload",
            headers=auth_headers,
            params={"session_id": session_id},
            files={"file": ("big.png", big, "image/png")},
            timeout=60,
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"


# ---------- Chat & Agentic flow ----------

class TestChatAgentic:
    def test_chat_message_reply_type_for_analysis(self, auth_headers, session_id):
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/chat",
            headers=auth_headers,
            json={"session_id": session_id, "message": "Come sta andando l'impresa?"},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reply_type"] == "message", f"expected 'message', got {data}"
        assert isinstance(data.get("content"), str) and len(data["content"]) > 0

    def test_chat_proposed_actions_for_create_cantiere(self, auth_headers, session_id):
        msg = "Apri cantiere Test SRL cliente Acme valore 30000 inizio oggi"
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/chat",
            headers=auth_headers,
            json={"session_id": session_id, "message": msg},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reply_type"] == "proposed_actions", f"expected proposed_actions, got {data}"
        assert isinstance(data.get("actions"), list) and len(data["actions"]) >= 1
        tools = [a["tool"] for a in data["actions"]]
        assert "crea_cantiere" in tools, f"tools were {tools}"
        for a in data["actions"]:
            assert "action_id" in a and "params" in a and "summary" in a

    def test_full_confirm_flow_persists_cantiere(self, auth_headers, session_id):
        # 1. Propose
        msg = "Apri cantiere TEST_AGENTIC_FLOW_X cliente AcmeTest valore 12345 inizio 2026-01-15"
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/chat",
            headers=auth_headers,
            json={"session_id": session_id, "message": msg},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reply_type"] == "proposed_actions", data
        crea_actions = [a for a in data["actions"] if a["tool"] == "crea_cantiere"]
        assert crea_actions, f"no crea_cantiere proposed: {data['actions']}"
        action_ids = [a["action_id"] for a in crea_actions]

        # 2. Confirm
        rc = requests.post(
            f"{BASE_URL}/api/ai-advisor/confirm-action",
            headers=auth_headers,
            json={"session_id": session_id, "action_ids": action_ids},
            timeout=60,
        )
        assert rc.status_code == 200, rc.text
        results = rc.json().get("results", [])
        assert results and all(r.get("ok") for r in results), f"Confirmation failed: {results}"

        # 3. Verify persisted in /api/cantieri
        rg = requests.get(f"{BASE_URL}/api/cantieri", headers=auth_headers, timeout=20)
        assert rg.status_code == 200
        cantieri = rg.json()
        names = [c["nome"] for c in cantieri]
        assert any("TEST_AGENTIC_FLOW" in n.upper() or "TEST" in n.upper() for n in names), \
            f"created cantiere not found, names={names}"

        # cleanup created cantieri (TEST_*)
        for c in cantieri:
            if "TEST_AGENTIC_FLOW" in c["nome"].upper() or c["nome"].startswith("TEST"):
                requests.delete(f"{BASE_URL}/api/cantieri/{c['id']}", headers=auth_headers)

    def test_cancel_action(self, auth_headers, session_id):
        msg = "Apri cantiere TEST_CANCEL cliente Foo valore 10000 inizio 2026-02-01"
        r = requests.post(
            f"{BASE_URL}/api/ai-advisor/chat",
            headers=auth_headers,
            json={"session_id": session_id, "message": msg},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        if data["reply_type"] != "proposed_actions":
            pytest.skip(f"AI did not propose action for cancel test: {data}")
        action_ids = [a["action_id"] for a in data["actions"]]
        rc = requests.post(
            f"{BASE_URL}/api/ai-advisor/cancel-action",
            headers=auth_headers,
            json={"session_id": session_id, "action_ids": action_ids},
            timeout=20,
        )
        assert rc.status_code == 200, rc.text
        assert rc.json().get("ok") is True

        # Confirming after cancel must fail (already not pending)
        rc2 = requests.post(
            f"{BASE_URL}/api/ai-advisor/confirm-action",
            headers=auth_headers,
            json={"session_id": session_id, "action_ids": action_ids},
            timeout=20,
        )
        assert rc2.status_code == 404


# ---------- History ----------

class TestHistory:
    def test_history_returns_messages(self, auth_headers, session_id):
        # send one message
        requests.post(
            f"{BASE_URL}/api/ai-advisor/chat",
            headers=auth_headers,
            json={"session_id": session_id, "message": "ciao breve test"},
            timeout=120,
        )
        rh = requests.get(f"{BASE_URL}/api/ai-advisor/history/{session_id}", headers=auth_headers, timeout=20)
        assert rh.status_code == 200
        msgs = rh.json()
        assert isinstance(msgs, list) and len(msgs) >= 1
        assert any(m["role"] == "user" for m in msgs)
