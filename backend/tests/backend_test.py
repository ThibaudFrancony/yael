"""Buddiz backend API tests.
Covers: auth (register/login/me), meals discovery + filters + search,
meal privacy (address hidden vs visible), config, profile update, upload,
and the /api/meals/mine endpoint auth guard.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-feast-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def marie_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "marie@buddiz.demo", "password": "buddiz123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---- Auth ----
class TestAuth:
    def test_login_success(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "marie@buddiz.demo", "password": "buddiz123"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"] == "marie@buddiz.demo"
        assert data["user"]["first_name"] == "Marie"

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "marie@buddiz.demo", "password": "wrongpass"})
        assert r.status_code == 401

    def test_register_new_and_duplicate(self, s):
        email = f"test_{uuid.uuid4().hex[:8]}@buddiz.demo"
        payload = {
            "first_name": "TEST", "last_name": "User", "email": email,
            "password": "secret123", "city": "Paris", "phone": "+33600000000",
        }
        r = s.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["user"]["email"] == email

        # Duplicate
        r2 = s.post(f"{API}/auth/register", json=payload)
        assert r2.status_code == 409

    def test_me_requires_auth(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, s):
        r = s.get(f"{API}/auth/me", headers={"Authorization": "Bearer invalid.token.value"})
        assert r.status_code == 401

    def test_me_with_valid_token(self, s, marie_token):
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {marie_token}"})
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == "marie@buddiz.demo"
        assert "phone" in u  # private field


# ---- Config ----
class TestConfig:
    def test_config(self, s):
        r = s.get(f"{API}/config")
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["service_fee_percent"] == 10
        assert "cancellation_policy" in cfg
        assert "Halal" in cfg["categories"]
        assert "Musique" in cfg["interests"]
        assert "Végan" in cfg["dietary_options"]


# ---- Meals discovery ----
class TestMeals:
    def test_list_meals_anonymous_hides_address(self, s):
        r = s.get(f"{API}/meals")
        assert r.status_code == 200
        meals = r.json()["meals"]
        assert len(meals) >= 6
        for m in meals:
            assert m["address_visible"] is False
            assert m["exact_address"] is None
            assert "host" in m and m["host"].get("first_name")
            assert "remaining_guests" in m

    def test_search_pizza(self, s):
        r = s.get(f"{API}/meals", params={"search": "pizza"})
        assert r.status_code == 200
        meals = r.json()["meals"]
        assert len(meals) >= 1
        titles = " ".join(m["title"].lower() for m in meals)
        assert "pizza" in titles

    def test_search_marie(self, s):
        r = s.get(f"{API}/meals", params={"search": "Marie"})
        assert r.status_code == 200
        meals = r.json()["meals"]
        assert len(meals) >= 1
        for m in meals:
            assert m["host"]["first_name"].lower() == "marie"

    def test_categories_halal(self, s):
        r = s.get(f"{API}/meals", params={"categories": "Halal"})
        assert r.status_code == 200
        meals = r.json()["meals"]
        assert len(meals) >= 1
        for m in meals:
            assert "Halal" in m.get("dietary_tags", []) or "Halal" in m.get("cuisine_tags", [])

    def test_interests_filter(self, s):
        r = s.get(f"{API}/meals", params={"interests": "Cinéma"})
        assert r.status_code == 200
        meals = r.json()["meals"]
        assert len(meals) >= 1
        for m in meals:
            assert "Cinéma" in m.get("interest_tags", [])

    def test_small_groups(self, s):
        r = s.get(f"{API}/meals", params={"small_groups": "true"})
        assert r.status_code == 200
        for m in r.json()["meals"]:
            assert m["max_guests"] <= 4

    def test_available_now(self, s):
        r = s.get(f"{API}/meals", params={"available_now": "true"})
        assert r.status_code == 200
        # All seed meals are in the future, so should return non-empty
        assert len(r.json()["meals"]) >= 1

    def test_meal_detail_anonymous_hidden(self, s):
        r = s.get(f"{API}/meals/meal_seed_pates")
        assert r.status_code == 200
        m = r.json()["meal"]
        assert m["address_visible"] is False
        assert m["exact_address"] is None
        # Marie's pasta meal has 2 confirmed bookings, max 4 => remaining 2
        assert m["remaining_guests"] == 2

    def test_meal_detail_host_can_see_address(self, s, marie_token):
        r = s.get(f"{API}/meals/meal_seed_pates", headers={"Authorization": f"Bearer {marie_token}"})
        assert r.status_code == 200
        m = r.json()["meal"]
        assert m["address_visible"] is True
        assert m["exact_address"] and "Paris" in m["exact_address"]

    def test_meal_not_found(self, s):
        r = s.get(f"{API}/meals/does_not_exist")
        assert r.status_code == 404


# ---- Profile ----
class TestProfile:
    def test_meals_mine_requires_auth(self, s):
        r = s.get(f"{API}/meals/mine")
        assert r.status_code == 401

    def test_meals_mine_with_token(self, s, marie_token):
        r = s.get(f"{API}/meals/mine", headers={"Authorization": f"Bearer {marie_token}"})
        assert r.status_code == 200
        meals = r.json()["meals"]
        # Marie hosts pates + raclette
        assert len(meals) >= 2
        for m in meals:
            assert m["host_id"] == "user_seed_marie"

    def test_update_profile(self, s):
        # Register fresh user to avoid mutating seed data
        email = f"test_prof_{uuid.uuid4().hex[:8]}@buddiz.demo"
        r = s.post(f"{API}/auth/register", json={
            "first_name": "TEST", "last_name": "Profile", "email": email,
            "password": "secret123", "city": "Nice", "phone": "+33600000000",
        })
        assert r.status_code == 200
        token = r.json()["token"]

        r2 = s.put(f"{API}/users/me",
                   json={"city": "Bordeaux", "first_name": "TESTUpdated"},
                   headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        u = r2.json()["user"]
        assert u["city"] == "Bordeaux"
        assert u["first_name"] == "TESTUpdated"

        # Verify persistence
        r3 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r3.status_code == 200
        assert r3.json()["user"]["city"] == "Bordeaux"

    def test_update_profile_requires_auth(self, s):
        r = s.put(f"{API}/users/me", json={"city": "X"})
        assert r.status_code == 401


# ---- Upload ----
class TestUpload:
    def test_upload_requires_auth(self, s):
        r = requests.post(f"{API}/upload", files={"file": ("x.jpg", b"xx", "image/jpeg")})
        assert r.status_code == 401

    def test_upload_and_fetch(self, s, marie_token):
        # 1x1 PNG bytes
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
            b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05"
            b"\xfe\x02\xfeA\x0e\xd6\xf9\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        r = requests.post(
            f"{API}/upload",
            files={"file": ("test.png", io.BytesIO(png), "image/png")},
            headers={"Authorization": f"Bearer {marie_token}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "path" in data and "url" in data
        assert data["url"].startswith("/api/files/")

        # Fetch it back
        fetch_url = f"{BASE_URL}{data['url']}"
        r2 = requests.get(fetch_url, timeout=30)
        assert r2.status_code == 200
        assert r2.headers.get("Content-Type", "").startswith("image/")
