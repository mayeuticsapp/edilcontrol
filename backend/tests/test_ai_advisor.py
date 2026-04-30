"""End-to-end tests for the AI Advisor (Claude Sonnet 4.5 via EMERGENT_LLM_KEY)."""
import os
import re
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://italian-speak-148.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 90  # AI calls can take 5-30s


@pytest.fixture(scope="module")
def session_id():
    return f"test-ai-{int(time.time())}"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Status ----------
def test_ai_status(client):
    r = client.get(f"{API}/ai-advisor/status", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["abilitato"] is True
    assert data["modello"] == "claude-sonnet-4-5-20250929"
    assert data["provider"] == "anthropic"


# ---------- Validation: empty message ----------
def test_chat_empty_message_returns_400(client, session_id):
    r = client.post(f"{API}/ai-advisor/chat",
                    json={"session_id": f"{session_id}-empty", "message": "   "},
                    timeout=15)
    assert r.status_code == 400, r.text


# ---------- Chat round-trip + persistence + financial context ----------
def test_chat_returns_italian_reply_with_real_numbers(client, session_id):
    # Get expected EBITDA from dashboard
    dash = client.get(f"{API}/dashboard/summary", timeout=15).json()
    ebitda = dash.get("ebitda", 0)
    fatturato = dash.get("fatturato", 0)
    assert fatturato > 0 and ebitda > 0, f"dashboard empty: {dash}"

    r = client.post(f"{API}/ai-advisor/chat",
                    json={"session_id": session_id,
                          "message": "Qual è il mio EBITDA in euro? Rispondi in una frase con la cifra esatta."},
                    timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    body = r.json()
    reply = body["reply"]
    assert body["session_id"] == session_id
    assert isinstance(reply, str) and len(reply.strip()) > 0

    # Italian check: presence of italian markers and absence of obvious english phrases
    italian_markers = re.search(r"\b(il|la|è|euro|EBITDA|tuo|della|del)\b", reply, re.IGNORECASE)
    assert italian_markers, f"Reply doesn't look Italian: {reply}"
    english_bad = re.search(r"\b(your EBITDA is|the company|hello|please find|sorry)\b", reply, re.IGNORECASE)
    assert not english_bad, f"Reply contains English phrasing: {reply}"

    # Real-numbers check: EBITDA value (without thousands sep) must appear, e.g., 206200 or 206.200 or 206,200
    ebi_int = int(round(ebitda))
    digits = str(ebi_int)
    variants = [digits,
                f"{ebi_int:,}".replace(",", "."),
                f"{ebi_int:,}",
                f"{ebi_int/1000:.1f}".replace(".", ",") + " mila",
                digits[:3] + "." + digits[3:] if len(digits) > 3 else digits]
    assert any(v in reply for v in variants), \
        f"Reply does not contain EBITDA number {ebi_int}. Variants tried: {variants}\nReply: {reply}"


# ---------- History endpoint ----------
def test_history_returns_chronological_messages(client, session_id):
    r = client.get(f"{API}/ai-advisor/history/{session_id}", timeout=15)
    assert r.status_code == 200
    msgs = r.json()
    assert len(msgs) >= 2
    # No mongo _id leaked
    for m in msgs:
        assert "_id" not in m
        assert m["session_id"] == session_id
    # First user, then assistant
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"
    # Chronological order
    timestamps = [m["created_at"] for m in msgs]
    assert timestamps == sorted(timestamps)


# ---------- Multi-turn context retention ----------
def test_multi_turn_context(client):
    sid = f"test-ai-multi-{int(time.time())}"
    # Turn 1: state a fact
    r1 = client.post(f"{API}/ai-advisor/chat",
                     json={"session_id": sid,
                           "message": "Ricorda questo numero: il mio codice cliente è 4271. Confermami."},
                     timeout=TIMEOUT)
    assert r1.status_code == 200, r1.text

    # Turn 2: ask back
    r2 = client.post(f"{API}/ai-advisor/chat",
                     json={"session_id": sid,
                           "message": "Qual era il codice cliente che ti ho dato poco fa?"},
                     timeout=TIMEOUT)
    assert r2.status_code == 200, r2.text
    reply2 = r2.json()["reply"]
    assert "4271" in reply2, f"AI lost session context. Reply: {reply2}"

    # Cleanup
    client.delete(f"{API}/ai-advisor/history/{sid}", timeout=15)


# ---------- DELETE history ----------
def test_delete_history(client):
    sid = f"test-ai-del-{int(time.time())}"
    client.post(f"{API}/ai-advisor/chat",
                json={"session_id": sid, "message": "Ciao"},
                timeout=TIMEOUT)
    rdel = client.delete(f"{API}/ai-advisor/history/{sid}", timeout=15)
    assert rdel.status_code == 200
    assert rdel.json().get("ok") is True

    rget = client.get(f"{API}/ai-advisor/history/{sid}", timeout=15)
    assert rget.status_code == 200
    assert rget.json() == []


# ---------- Cleanup module-level session ----------
def test_zz_cleanup(client, session_id):
    client.delete(f"{API}/ai-advisor/history/{session_id}", timeout=15)
