"""Tests for ChatGPT AI endpoints:
- POST /api/ai/assistant  (auth-gated help assistant, French)
- POST /api/ai/reply-suggestions (auth-gated messaging suggestions)
"""

import os
import time
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-feast-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MARIE = {"email": "marie@buddiz.demo", "password": "buddiz123"}
DAVID = {"email": "david@buddiz.demo", "password": "buddiz123"}
SOPHIE = {"email": "sophie@buddiz.demo", "password": "buddiz123"}


# ---------------- fixtures / helpers ----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, creds):
    r = session.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data["user"]


@pytest.fixture(scope="module")
def marie_auth(session):
    tok, user = _login(session, MARIE)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def david_auth(session):
    tok, user = _login(session, DAVID)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def sophie_auth(session):
    tok, user = _login(session, SOPHIE)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


def _looks_french(text: str) -> bool:
    """Loose French-language heuristic."""
    t = (text or "").lower()
    if not t.strip():
        return False
    french_tokens = [" le ", " la ", " les ", " un ", " une ", " des ", " et ", " est ",
                     " pour ", " avec ", " vous ", " tu ", " je ", " ne ", " pas ", " sur ",
                     " du ", " au ", "buddiz", "hôte", "repas", "bonjour", "bienvenue"]
    padded = f" {t} "
    return any(tok in padded for tok in french_tokens)


# ---------------- /api/ai/assistant ----------------
class TestAssistant:
    def test_assistant_no_auth_returns_401(self, session):
        r = session.post(f"{API}/ai/assistant", json={"message": "Bonjour", "history": []}, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_assistant_empty_message_returns_400(self, session, marie_auth):
        r = session.post(
            f"{API}/ai/assistant",
            json={"message": "   ", "history": []},
            headers=marie_auth["headers"],
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_assistant_success_french_reply(self, session, marie_auth):
        r = session.post(
            f"{API}/ai/assistant",
            json={"message": "Comment devenir hôte sur Buddiz ?", "history": []},
            headers=marie_auth["headers"],
            timeout=90,
        )
        assert r.status_code == 200, f"body={r.text}"
        data = r.json()
        assert "reply" in data
        reply = data["reply"]
        assert isinstance(reply, str) and reply.strip(), "reply should be non-empty string"
        assert _looks_french(reply), f"reply does not look French: {reply!r}"

    def test_assistant_multiturn_history(self, session, marie_auth):
        history = [
            {"role": "user", "content": "Bonjour, je m'appelle Marie."},
            {"role": "assistant", "content": "Bonjour Marie ! Comment puis-je vous aider sur Buddiz ?"},
        ]
        r = session.post(
            f"{API}/ai/assistant",
            json={"message": "Quel est mon prénom ?", "history": history},
            headers=marie_auth["headers"],
            timeout=90,
        )
        assert r.status_code == 200, f"body={r.text}"
        data = r.json()
        assert data.get("reply", "").strip(), "expected non-empty reply on multi-turn call"


# ---------------- /api/ai/reply-suggestions ----------------
def _find_or_create_conversation_for_david(session, david_auth, marie_auth):
    """Return a conversation id where david is participant.

    Prefer an existing conv from GET /api/conversations, else create one
    by having david contact one of Marie's meals (POST /api/conversations).
    """
    r = session.get(f"{API}/conversations", headers=david_auth["headers"], timeout=30)
    if r.status_code == 200:
        convs = r.json() or []
        if convs:
            return convs[0]["id"], convs[0]

    # Fallback: create a conversation. Pick a meal not hosted by david.
    r = session.get(f"{API}/meals", timeout=30)
    assert r.status_code == 200, f"list meals failed: {r.text}"
    meals = r.json() or []
    target_meal = None
    for m in meals:
        host = m.get("host") or {}
        # Skip meals hosted by david himself
        if host.get("id") and host["id"] != david_auth["user"]["id"]:
            target_meal = m
            break
    assert target_meal, "no meal available to create a conversation with"

    r = session.post(
        f"{API}/conversations",
        json={"meal_id": target_meal["id"], "message": "Bonjour, je serais intéressé par votre repas !"},
        headers=david_auth["headers"],
        timeout=30,
    )
    assert r.status_code in (200, 201), f"create conv failed: {r.status_code} {r.text}"
    conv = r.json()
    return conv["id"], conv


class TestReplySuggestions:
    @pytest.fixture(scope="class")
    def david_conv(self, session, david_auth, marie_auth):
        conv_id, conv = _find_or_create_conversation_for_david(session, david_auth, marie_auth)
        assert conv_id
        return {"id": conv_id, "conv": conv}

    def test_suggestions_no_auth_returns_401(self, session, david_conv):
        r = session.post(
            f"{API}/ai/reply-suggestions",
            json={"conversation_id": david_conv["id"]},
            timeout=30,
        )
        assert r.status_code in (401, 403)

    def test_suggestions_participant_success(self, session, david_auth, david_conv):
        r = session.post(
            f"{API}/ai/reply-suggestions",
            json={"conversation_id": david_conv["id"]},
            headers=david_auth["headers"],
            timeout=90,
        )
        assert r.status_code == 200, f"body={r.text}"
        data = r.json()
        assert "suggestions" in data
        sugg = data["suggestions"]
        assert isinstance(sugg, list)
        assert 1 <= len(sugg) <= 3, f"expected 1..3 suggestions, got {len(sugg)}: {sugg}"
        for s in sugg:
            assert isinstance(s, str) and s.strip(), f"empty suggestion in list: {sugg}"
            # short: max ~12 words per system prompt; allow a bit of slack
            assert len(s.split()) <= 20, f"suggestion too long: {s!r}"

    def test_suggestions_non_participant_returns_403(self, session, sophie_auth, david_conv):
        r = session.post(
            f"{API}/ai/reply-suggestions",
            json={"conversation_id": david_conv["id"]},
            headers=sophie_auth["headers"],
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
