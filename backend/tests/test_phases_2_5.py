"""Buddiz backend tests — Phases 2-5.
Covers: meal creation & host management, messaging + booking requests,
booking state machine (REQUESTED → ACCEPTED_PENDING_PAYMENT → CONFIRMED),
address privacy, payment (test-mode), reviews, cancellation, notifications.
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-feast-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["token"]


def _register(email: str = None, password: str = "secret123") -> tuple:
    email = email or f"test_ph2_{uuid.uuid4().hex[:8]}@buddiz.demo"
    r = requests.post(f"{API}/auth/register", json={
        "first_name": "TEST", "last_name": "User", "email": email,
        "password": password, "city": "Paris", "phone": "+33600000000",
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]["id"], email


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def marie_token():
    return _login("marie@buddiz.demo", "buddiz123")


@pytest.fixture(scope="session")
def david_token():
    return _login("david@buddiz.demo", "buddiz123")


@pytest.fixture(scope="session")
def sophie_token():
    return _login("sophie@buddiz.demo", "buddiz123")


@pytest.fixture(scope="session")
def test_token():
    return _login("test@buddiz.demo", "secret123")


# --- Config: test-mode flag ---
class TestConfig:
    def test_payments_test_mode(self):
        r = requests.get(f"{API}/config", timeout=30)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg.get("payments_test_mode") is True
        assert cfg["service_fee_percent"] == 10


# --- Meal creation & host management ---
class TestMealCreation:
    def test_create_meal_validation(self, marie_token):
        # price negative
        future = (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%dT%H:%M")
        base = {"title": "TEST Meal", "description": "TEST desc", "image": "https://example.com/x.jpg",
                "price_cents": 1500, "max_guests": 4, "city": "Paris",
                "exact_address": "5 rue TEST, 75001 Paris", "starts_at": future,
                "dietary_tags": [], "cuisine_tags": [], "interest_tags": [], "features": [], "status": "published"}
        bad = {**base, "price_cents": -1}
        r = requests.post(f"{API}/meals", json=bad, headers=_h(marie_token), timeout=30)
        assert r.status_code == 400

        # max_guests <= 0
        bad2 = {**base, "max_guests": 0}
        r = requests.post(f"{API}/meals", json=bad2, headers=_h(marie_token), timeout=30)
        assert r.status_code == 400

        # missing title
        bad3 = {**base, "title": "   "}
        r = requests.post(f"{API}/meals", json=bad3, headers=_h(marie_token), timeout=30)
        assert r.status_code == 400

        # past date
        past = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")
        bad4 = {**base, "starts_at": past}
        r = requests.post(f"{API}/meals", json=bad4, headers=_h(marie_token), timeout=30)
        assert r.status_code == 400

        # missing image
        bad5 = {**base, "image": ""}
        r = requests.post(f"{API}/meals", json=bad5, headers=_h(marie_token), timeout=30)
        assert r.status_code == 400

    def test_create_meal_success_and_shows_in_mine(self, marie_token):
        future = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M")
        payload = {"title": "TEST Repas Phase2", "description": "TEST description repas",
                   "image": "https://example.com/img.jpg", "price_cents": 2000,
                   "max_guests": 3, "city": "Paris",
                   "exact_address": "10 rue de la Paix, 75002 Paris", "starts_at": future,
                   "dietary_tags": ["Végan"], "cuisine_tags": ["Italien"], "interest_tags": ["Musique"],
                   "features": [], "status": "published"}
        r = requests.post(f"{API}/meals", json=payload, headers=_h(marie_token), timeout=30)
        assert r.status_code == 200, r.text
        meal = r.json()["meal"]
        assert meal["title"] == "TEST Repas Phase2"
        assert meal["price_cents"] == 2000
        assert meal["max_guests"] == 3
        mid = meal["id"]

        # Appears in /meals/mine
        r2 = requests.get(f"{API}/meals/mine", headers=_h(marie_token), timeout=30)
        assert r2.status_code == 200
        assert any(m["id"] == mid for m in r2.json()["meals"])

        # Appears in /meals list
        r3 = requests.get(f"{API}/meals", timeout=30)
        assert r3.status_code == 200
        assert any(m["id"] == mid for m in r3.json()["meals"])

    def test_edit_and_withdraw_auth(self, marie_token, david_token):
        future = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M")
        payload = {"title": "TEST Meal Edit", "description": "TEST", "image": "https://x/y.jpg",
                   "price_cents": 1200, "max_guests": 2, "city": "Paris",
                   "exact_address": "1 rue TEST", "starts_at": future,
                   "dietary_tags": [], "cuisine_tags": [], "interest_tags": [], "features": [], "status": "published"}
        r = requests.post(f"{API}/meals", json=payload, headers=_h(marie_token), timeout=30)
        assert r.status_code == 200
        mid = r.json()["meal"]["id"]

        # Non-host cannot edit
        r2 = requests.put(f"{API}/meals/{mid}", json={"title": "HACK"}, headers=_h(david_token), timeout=30)
        assert r2.status_code == 403

        # Host can edit
        r3 = requests.put(f"{API}/meals/{mid}", json={"title": "TEST Edited"}, headers=_h(marie_token), timeout=30)
        assert r3.status_code == 200
        assert r3.json()["meal"]["title"] == "TEST Edited"

        # Reservations endpoint host only
        r4 = requests.get(f"{API}/meals/{mid}/reservations", headers=_h(david_token), timeout=30)
        assert r4.status_code == 403
        r5 = requests.get(f"{API}/meals/{mid}/reservations", headers=_h(marie_token), timeout=30)
        assert r5.status_code == 200

        # Withdraw (host)
        r6 = requests.post(f"{API}/meals/{mid}/withdraw", json={"reason": "TEST withdraw"},
                           headers=_h(marie_token), timeout=30)
        assert r6.status_code == 200
        # Meal detail now shows status removed
        r7 = requests.get(f"{API}/meals/{mid}", timeout=30)
        assert r7.status_code == 200
        assert r7.json()["meal"]["status"] == "removed"


# --- Full booking flow ---
class TestBookingFlow:
    """Guest test@buddiz.demo books David's meal_seed_asiat."""

    MEAL_ID = "meal_seed_asiat"

    def test_a_cannot_book_own_meal(self, david_token):
        r = requests.post(f"{API}/bookings",
                          json={"meal_id": self.MEAL_ID, "guest_count": 1},
                          headers=_h(david_token), timeout=30)
        assert r.status_code == 400

    def test_b_overbooking_rejected(self, test_token):
        r = requests.post(f"{API}/bookings",
                          json={"meal_id": self.MEAL_ID, "guest_count": 999},
                          headers=_h(test_token), timeout=30)
        assert r.status_code == 400

    def test_c_full_flow(self, david_token):
        # Use a fresh guest to avoid re-using any prior active booking
        guest_tok, _, _ = _register()
        # 1) Create booking
        r = requests.post(f"{API}/bookings",
                          json={"meal_id": self.MEAL_ID, "guest_count": 1},
                          headers=_h(guest_tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        booking = data["booking"]
        conv_id = data["conversation_id"]
        bid = booking["id"]
        assert booking["state"] == "REQUESTED"
        test_token = guest_tok
        assert booking["subtotal_cents"] > 0
        assert booking["service_fee_cents"] == round(booking["subtotal_cents"] * 0.10)
        assert booking["total_cents"] == booking["subtotal_cents"] + booking["service_fee_cents"]

        # 2) Host got a notification
        r_n = requests.get(f"{API}/notifications", headers=_h(david_token), timeout=30)
        assert r_n.status_code == 200
        notifs = r_n.json()["notifications"]
        assert any(n.get("booking_id") == bid and n["type"] == "booking_request" for n in notifs)

        # 3) Conversation has booking_request message
        r_c = requests.get(f"{API}/conversations/{conv_id}", headers=_h(test_token), timeout=30)
        assert r_c.status_code == 200
        msgs = r_c.json()["messages"]
        assert any(m["type"] == "booking_request" and m.get("booking_id") == bid for m in msgs)

        # 4) Address hidden before payment
        r_m = requests.get(f"{API}/meals/{self.MEAL_ID}", headers=_h(test_token), timeout=30)
        assert r_m.status_code == 200
        assert r_m.json()["meal"]["exact_address"] is None
        assert r_m.json()["meal"]["address_visible"] is False

        # 5) Non-host cannot accept
        marie_tok = _login("marie@buddiz.demo", "buddiz123")
        r_bad = requests.post(f"{API}/bookings/{bid}/accept", headers=_h(marie_tok), timeout=30)
        assert r_bad.status_code == 403

        # 6) Update guest count works while REQUESTED
        r_gc = requests.post(f"{API}/bookings/{bid}/guest-count",
                             json={"guest_count": 1}, headers=_h(test_token), timeout=30)
        assert r_gc.status_code == 200

        # 7) Host accepts
        r_a = requests.post(f"{API}/bookings/{bid}/accept", headers=_h(david_token), timeout=30)
        assert r_a.status_code == 200
        assert r_a.json()["booking"]["state"] == "ACCEPTED_PENDING_PAYMENT"

        # 8) Guest got 'booking_accepted' notif
        r_n2 = requests.get(f"{API}/notifications", headers=_h(test_token), timeout=30)
        assert r_n2.status_code == 200
        assert any(n["type"] == "booking_accepted" and n.get("booking_id") == bid
                   for n in r_n2.json()["notifications"])

        # 9) Address still hidden pre-payment
        r_addr = requests.get(f"{API}/bookings/{bid}/address", headers=_h(test_token), timeout=30)
        assert r_addr.status_code == 403

        # 10) Checkout returns test_mode true
        r_co = requests.post(f"{API}/payments/checkout", json={"booking_id": bid},
                             headers=_h(test_token), timeout=30)
        assert r_co.status_code == 200
        assert r_co.json().get("test_mode") is True

        # 11) Non-participant can't view booking
        stranger_tok, _, _ = _register()
        r_str = requests.get(f"{API}/bookings/{bid}", headers=_h(stranger_tok), timeout=30)
        assert r_str.status_code == 403

        # 12) Confirm payment (test mode)
        r_pay = requests.post(f"{API}/payments/confirm-test", json={"booking_id": bid},
                              headers=_h(test_token), timeout=30)
        assert r_pay.status_code == 200, r_pay.text
        assert r_pay.json()["booking"]["state"] == "CONFIRMED"
        assert r_pay.json()["booking"]["payment_status"] == "succeeded"

        # 13) Address now visible on booking detail
        r_bd = requests.get(f"{API}/bookings/{bid}", headers=_h(test_token), timeout=30)
        assert r_bd.status_code == 200
        b = r_bd.json()["booking"]
        assert b["meal"]["address_visible"] is True
        assert b["meal"]["exact_address"] is not None

        # 14) /bookings/{id}/address returns
        r_addr2 = requests.get(f"{API}/bookings/{bid}/address", headers=_h(test_token), timeout=30)
        assert r_addr2.status_code == 200
        assert r_addr2.json()["address"]

        # 15) Guest count locked after CONFIRMED
        r_gc2 = requests.post(f"{API}/bookings/{bid}/guest-count",
                              json={"guest_count": 2}, headers=_h(test_token), timeout=30)
        assert r_gc2.status_code == 400

        # 16) Cancel booking -> refund (>= 24h before => 100%)
        r_can = requests.post(f"{API}/bookings/{bid}/cancel",
                              json={"reason": "TEST reason"}, headers=_h(test_token), timeout=30)
        assert r_can.status_code == 200
        rj = r_can.json()
        assert rj["ok"] is True
        assert rj["refund_cents"] > 0


class TestDeclineFlow:
    def test_decline(self, david_token):
        # A fresh guest requests on David's meal, then he declines
        tok, uid, _ = _register()
        r = requests.post(f"{API}/bookings",
                          json={"meal_id": "meal_seed_asiat", "guest_count": 1},
                          headers=_h(tok), timeout=30)
        assert r.status_code == 200
        bid = r.json()["booking"]["id"]
        r2 = requests.post(f"{API}/bookings/{bid}/decline", headers=_h(david_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["booking"]["state"] == "DECLINED"


class TestMessagingAuth:
    def test_conversations_require_participant(self, marie_token):
        stranger, _, _ = _register()
        # Marie has a conversation? try listing
        r = requests.get(f"{API}/conversations", headers=_h(marie_token), timeout=30)
        assert r.status_code == 200
        convs = r.json()["conversations"]
        if convs:
            conv_id = convs[0]["id"]
            r2 = requests.get(f"{API}/conversations/{conv_id}", headers=_h(stranger), timeout=30)
            assert r2.status_code == 403
            r3 = requests.post(f"{API}/conversations/{conv_id}/messages",
                               json={"body": "hack"}, headers=_h(stranger), timeout=30)
            assert r3.status_code == 403

    def test_cannot_create_conversation_on_own_meal(self, marie_token):
        r = requests.post(f"{API}/conversations", json={"meal_id": "meal_seed_pates"},
                          headers=_h(marie_token), timeout=30)
        assert r.status_code == 400


class TestReviews:
    """Seed COMPLETED booking is book_seed_past, guest=david, host=marie (meal_seed_pates)."""

    BOOKING_ID = "book_seed_past"

    def test_a_only_guest_can_review(self, sophie_token):
        r = requests.post(f"{API}/reviews",
                          json={"booking_id": self.BOOKING_ID, "overall": 5, "categories": {}},
                          headers=_h(sophie_token), timeout=30)
        # sophie is not the guest -> 404 (booking not found under her guest_id)
        assert r.status_code in (403, 404)

    def test_b_invalid_overall(self, david_token):
        r = requests.post(f"{API}/reviews",
                          json={"booking_id": self.BOOKING_ID, "overall": 9, "categories": {}},
                          headers=_h(david_token), timeout=30)
        # If already reviewed by a previous run, will be 409 — else 400
        assert r.status_code in (400, 409)

    def test_c_submit_or_confirm_already_reviewed(self, david_token):
        r = requests.post(f"{API}/reviews", json={
            "booking_id": self.BOOKING_ID, "overall": 5,
            "categories": {"Hospitalité": 5, "Nourriture": 5, "Conversation": 5, "Ambiance": 5},
            "comment": "TEST comment",
        }, headers=_h(david_token), timeout=30)
        assert r.status_code in (200, 409)
        # Duplicate must yield 409
        r2 = requests.post(f"{API}/reviews", json={
            "booking_id": self.BOOKING_ID, "overall": 5, "categories": {}, "comment": "TEST dup",
        }, headers=_h(david_token), timeout=30)
        assert r2.status_code == 409

    def test_d_host_rating_updated(self):
        r = requests.get(f"{API}/users/user_seed_marie", timeout=30)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u.get("rating_count", 0) >= 1
        assert 1 <= (u.get("rating_avg") or 0) <= 5


class TestNotifications:
    def test_list_and_read_all(self, test_token):
        r = requests.get(f"{API}/notifications", headers=_h(test_token), timeout=30)
        assert r.status_code == 200
        assert "notifications" in r.json()

        r2 = requests.get(f"{API}/notifications/unread-count", headers=_h(test_token), timeout=30)
        assert r2.status_code == 200
        assert "unread" in r2.json()

        r3 = requests.post(f"{API}/notifications/read-all", headers=_h(test_token), timeout=30)
        assert r3.status_code == 200

        r4 = requests.get(f"{API}/notifications/unread-count", headers=_h(test_token), timeout=30)
        assert r4.status_code == 200
        assert r4.json()["unread"] == 0
