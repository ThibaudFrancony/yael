"""Stripe Connect (Express) onboarding & status tests for Buddiz.

Verifies the bug fix: POST /api/connect/account no longer fails with the
"sign up for Connect" error, correctly creates OR reuses an Express account,
persists stripe_connect_account_id on the user, and returns a hosted
onboarding link. Also covers GET /api/connect/status, unauthenticated
access, return/refresh redirects, and payment gating when the host is not
onboarding-ready.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-feast-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(session: requests.Session, email: str, password: str) -> str:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def marie_token(s):
    return _login(s, "marie@buddiz.demo", "buddiz123")


@pytest.fixture(scope="module")
def david_token(s):
    return _login(s, "david@buddiz.demo", "buddiz123")


@pytest.fixture(scope="module")
def fresh_user(s):
    """Register a brand-new user with no stripe_connect_account_id yet."""
    email = f"test_connect_{uuid.uuid4().hex[:8]}@buddiz.demo"
    payload = {
        "first_name": "TEST", "last_name": "Connect", "email": email,
        "password": "secret123", "city": "Paris", "phone": "+33600000000",
    }
    r = s.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, r.text
    return {"email": email, "token": r.json()["token"], "id": r.json()["user"]["id"]}


# ---- Auth guards ----
class TestConnectAuth:
    def test_post_connect_account_requires_auth(self, s):
        r = s.post(f"{API}/connect/account", json={})
        assert r.status_code == 401

    def test_get_connect_status_requires_auth(self, s):
        r = s.get(f"{API}/connect/status")
        assert r.status_code == 401


# ---- Status endpoint edge cases ----
class TestConnectStatus:
    def test_status_no_account_returns_disconnected(self, s):
        """Register a brand-new user in this test (function-scoped) so no
        prior /connect/account call could have attached an account_id."""
        email = f"test_nc_{uuid.uuid4().hex[:8]}@buddiz.demo"
        rr = s.post(f"{API}/auth/register", json={
            "first_name": "TEST", "last_name": "NoConnect", "email": email,
            "password": "secret123", "city": "Paris", "phone": "+33600000000",
        })
        assert rr.status_code == 200, rr.text
        token = rr.json()["token"]
        r = s.get(f"{API}/connect/status", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"connected": False, "ready": False, "onboarding_complete": False}


# ---- Account creation (bug fix) ----
class TestConnectAccountCreation:
    def test_create_account_returns_acct_and_onboarding_url(self, s, fresh_user):
        r = s.post(f"{API}/connect/account", json={}, headers={"Authorization": f"Bearer {fresh_user['token']}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "account_id" in data and "onboarding_url" in data
        assert data["account_id"].startswith("acct_"), data
        assert data["onboarding_url"].startswith("https://connect.stripe.com/"), data
        fresh_user["account_id"] = data["account_id"]

    def test_create_account_idempotent_reuses_id(self, s, fresh_user):
        # Guarantee first call created an account (in case test order changes)
        headers = {"Authorization": f"Bearer {fresh_user['token']}"}
        r1 = s.post(f"{API}/connect/account", json={}, headers=headers)
        assert r1.status_code == 200, r1.text
        first_id = r1.json()["account_id"]
        r2 = s.post(f"{API}/connect/account", json={}, headers=headers)
        assert r2.status_code == 200, r2.text
        second = r2.json()
        assert second["account_id"] == first_id, (first_id, second["account_id"])
        # Fresh onboarding link each call
        assert second["onboarding_url"].startswith("https://connect.stripe.com/")

    def test_status_after_create_is_connected_but_not_ready(self, s, fresh_user):
        headers = {"Authorization": f"Bearer {fresh_user['token']}"}
        # Make sure account exists
        s.post(f"{API}/connect/account", json={}, headers=headers)
        r = s.get(f"{API}/connect/status", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["connected"] is True
        assert data["ready"] is False
        assert data["onboarding_complete"] is False
        # charges/payouts should be exposed and False for a brand-new express account
        assert data.get("charges_enabled") is False
        assert data.get("payouts_enabled") is False
        assert data.get("account_id", "").startswith("acct_")


# ---- Return / refresh redirects ----
class TestConnectRedirects:
    def test_return_redirects_to_app(self, s, fresh_user):
        # Reuse the account_id created for fresh_user
        headers = {"Authorization": f"Bearer {fresh_user['token']}"}
        r = s.post(f"{API}/connect/account", json={}, headers=headers)
        account_id = r.json()["account_id"]

        r2 = requests.get(f"{API}/connect/return/{account_id}", allow_redirects=False, timeout=30)
        assert 300 <= r2.status_code < 400, r2.status_code
        loc = r2.headers.get("location", "")
        assert "/connect-return" in loc
        assert account_id in loc

    def test_refresh_redirects_to_stripe(self, s, fresh_user):
        headers = {"Authorization": f"Bearer {fresh_user['token']}"}
        r = s.post(f"{API}/connect/account", json={}, headers=headers)
        account_id = r.json()["account_id"]

        r2 = requests.get(f"{API}/connect/refresh/{account_id}", allow_redirects=False, timeout=30)
        assert 300 <= r2.status_code < 400, r2.status_code
        loc = r2.headers.get("location", "")
        assert loc.startswith("https://connect.stripe.com/"), loc


# ---- Payment gating when host is not onboarding-ready ----
class TestPaymentGating:
    def test_checkout_blocks_when_host_not_ready(self, s):
        """Create a fresh HOST with no stripe_connect_account_id, publish a
        meal, book & accept it as a fresh guest, then request checkout.
        Expect 409 with French message about payouts not configured."""
        # 1) Fresh host (no connect account)
        host_email = f"test_host_gate_{uuid.uuid4().hex[:8]}@buddiz.demo"
        rh = s.post(f"{API}/auth/register", json={
            "first_name": "TEST", "last_name": "HostGate", "email": host_email,
            "password": "secret123", "city": "Paris", "phone": "+33600000000",
        })
        assert rh.status_code == 200, rh.text
        host_token = rh.json()["token"]
        host_headers = {"Authorization": f"Bearer {host_token}"}

        # 2) Publish a meal
        import datetime
        future = (datetime.datetime.utcnow() + datetime.timedelta(days=14)).replace(microsecond=0).isoformat() + "Z"
        # image must be provided — reuse a Marie seed meal's image path is unknown; use a placeholder URL
        meal_payload = {
            "title": "TEST Gating Dinner",
            "description": "Test meal for payment gating verification (no connect).",
            "cuisine_tags": ["Italien"],
            "dietary_tags": [],
            "interest_tags": ["Musique"],
            "price_per_guest_cents": 3000,
            "price_cents": 3000,
            "max_guests": 4,
            "starts_at": future,
            "duration_minutes": 120,
            "city": "Paris",
            "exact_address": "10 rue de Rivoli, 75001 Paris",
            "image": "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
            "published": True,
        }
        rm = s.post(f"{API}/meals", json=meal_payload, headers=host_headers)
        assert rm.status_code == 200, rm.text
        meal_id = rm.json()["meal"]["id"]

        # 3) Fresh guest
        guest_email = f"test_guest_gate_{uuid.uuid4().hex[:8]}@buddiz.demo"
        rg = s.post(f"{API}/auth/register", json={
            "first_name": "TEST", "last_name": "GuestGate", "email": guest_email,
            "password": "secret123", "city": "Paris", "phone": "+33600000000",
        })
        assert rg.status_code == 200, rg.text
        guest_token = rg.json()["token"]
        guest_headers = {"Authorization": f"Bearer {guest_token}"}

        # 4) Book + accept
        rb = s.post(f"{API}/bookings", json={"meal_id": meal_id, "guest_count": 1},
                    headers=guest_headers)
        assert rb.status_code == 200, rb.text
        booking = rb.json()["booking"]
        ra = s.post(f"{API}/bookings/{booking['id']}/accept", headers=host_headers)
        assert ra.status_code == 200, ra.text
        assert ra.json()["booking"]["state"] == "ACCEPTED_PENDING_PAYMENT"

        # 5) Checkout must be blocked with 409 + French payout message
        rc = s.post(f"{API}/payments/checkout", json={"booking_id": booking["id"]},
                    headers=guest_headers)
        assert rc.status_code == 409, (rc.status_code, rc.text)
        detail = (rc.json().get("detail") or "").lower()
        assert "versement" in detail, rc.text
