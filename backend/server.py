"""
BUDDIZ backend — social dining marketplace.
FastAPI + MongoDB. All routes prefixed with /api.

Phase 1 scope implemented here (with data model + authorization already
anticipating Phases 2-5): auth (email/password JWT + Emergent Google session),
profile, image upload via Emergent Object Storage, meals discovery with real
search + filters, meal detail with address-privacy, config, seed data.
"""

import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import jwt
import bcrypt
import requests
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, UploadFile, File, Query, Request
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field, EmailStr

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --------------------------------------------------------------------------- #
# Config / clients
# --------------------------------------------------------------------------- #
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 30

SERVICE_FEE_PERCENT = int(os.environ.get("SERVICE_FEE_PERCENT") or "10")

STRIPE_SECRET_KEY = (os.environ.get("STRIPE_SECRET_KEY") or "").strip()
STRIPE_PUBLISHABLE_KEY = (os.environ.get("STRIPE_PUBLISHABLE_KEY") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.environ.get("STRIPE_WEBHOOK_SECRET") or "").strip()
PAYMENTS_TEST_MODE = not bool(STRIPE_SECRET_KEY)  # no Stripe key -> dev/test confirm
APP_PUBLIC_URL = (os.environ.get("APP_PUBLIC_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").strip().rstrip("/")
try:
    import stripe as stripe_sdk
    if STRIPE_SECRET_KEY:
        stripe_sdk.api_key = STRIPE_SECRET_KEY
except Exception:
    stripe_sdk = None

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "buddiz"

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("buddiz")

app = FastAPI(title="Buddiz API")
api = APIRouter(prefix="/api")

# --------------------------------------------------------------------------- #
# Booking state machine constants (used across phases)
# --------------------------------------------------------------------------- #
BOOKING_REQUESTED = "REQUESTED"
BOOKING_ACCEPTED_PENDING_PAYMENT = "ACCEPTED_PENDING_PAYMENT"
BOOKING_CONFIRMED = "CONFIRMED"
BOOKING_COMPLETED = "COMPLETED"
BOOKING_DECLINED = "DECLINED"
BOOKING_CANCELLED_BY_GUEST = "CANCELLED_BY_GUEST"
BOOKING_CANCELLED_BY_HOST = "CANCELLED_BY_HOST"
BOOKING_PAYMENT_FAILED = "PAYMENT_FAILED"
BOOKING_REFUND_PENDING = "REFUND_PENDING"
BOOKING_REFUNDED = "REFUNDED"

# states that consume capacity
CAPACITY_STATES = [BOOKING_CONFIRMED, BOOKING_COMPLETED]

MEAL_DRAFT = "draft"
MEAL_PUBLISHED = "published"
MEAL_FULL = "full"
MEAL_COMPLETED = "completed"
MEAL_CANCELLED = "cancelled"
MEAL_REMOVED = "removed"

DEFAULT_CANCELLATION_POLICY = {
    "full_refund_hours": 24,   # >= 24h before meal -> full refund
    "partial_refund_percent": 50,  # < 24h before meal -> 50% refund
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=JWT_TTL_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def public_user(u: dict) -> dict:
    """Public-safe host profile (no email/phone/private data)."""
    if not u:
        return {}
    return {
        "id": u["id"],
        "first_name": u.get("first_name"),
        "last_name_initial": (u.get("last_name") or " ")[0:1].upper() if u.get("last_name") else "",
        "city": u.get("city"),
        "avatar_url": u.get("avatar_url"),
        "rating_avg": round(u.get("rating_avg") or 0, 1),
        "rating_count": u.get("rating_count") or 0,
        "identity_verification_status": u.get("identity_verification_status", "not_started"),
        "member_since": u.get("created_at", "")[:4] if u.get("created_at") else "",
    }


def private_user(u: dict) -> dict:
    """Full profile for the account owner."""
    if not u:
        return {}
    return {
        "id": u["id"],
        "first_name": u.get("first_name"),
        "last_name": u.get("last_name"),
        "email": u.get("email"),
        "phone": u.get("phone"),
        "city": u.get("city"),
        "avatar_url": u.get("avatar_url"),
        "email_verified": u.get("email_verified", False),
        "phone_verified": u.get("phone_verified", False),
        "identity_verification_status": u.get("identity_verification_status", "not_started"),
        "rating_avg": round(u.get("rating_avg") or 0, 1),
        "rating_count": u.get("rating_count") or 0,
        "meals_hosted_count": u.get("meals_hosted_count") or 0,
        "guests_welcomed_count": u.get("guests_welcomed_count") or 0,
        "created_at": u.get("created_at"),
        "auth_provider": u.get("auth_provider", "email"),
    }


async def seats_taken(meal_id: str) -> int:
    cur = db.bookings.find({"meal_id": meal_id, "state": {"$in": CAPACITY_STATES}}, {"_id": 0, "guest_count": 1})
    total = 0
    async for b in cur:
        total += int(b.get("guest_count") or 0)
    return total


async def meal_public(meal: dict, viewer_id: Optional[str]) -> dict:
    """Serialize a meal for API. Hides exact address unless viewer is host or a
    confirmed/completed guest (privacy rule)."""
    host = await db.users.find_one({"id": meal["host_id"]}, {"_id": 0})
    taken = await seats_taken(meal["id"])
    remaining = max(0, int(meal["max_guests"]) - taken)

    can_see_address = False
    if viewer_id:
        if viewer_id == meal["host_id"]:
            can_see_address = True
        else:
            b = await db.bookings.find_one({
                "meal_id": meal["id"],
                "guest_id": viewer_id,
                "state": {"$in": CAPACITY_STATES},
            })
            can_see_address = b is not None

    subtotal = int(meal["price_cents"])
    fee = round(subtotal * (meal.get("service_fee_percent", SERVICE_FEE_PERCENT) / 100.0))

    out = {
        "id": meal["id"],
        "host": public_user(host),
        "host_id": meal["host_id"],
        "title": meal["title"],
        "description": meal.get("description", ""),
        "image": meal.get("image"),
        "price_cents": subtotal,
        "service_fee_cents": fee,
        "service_fee_percent": meal.get("service_fee_percent", SERVICE_FEE_PERCENT),
        "max_guests": meal["max_guests"],
        "remaining_guests": remaining,
        "seats_taken": taken,
        "city": meal.get("city"),
        "starts_at": meal.get("starts_at"),
        "status": meal.get("status"),
        "dietary_tags": meal.get("dietary_tags", []),
        "cuisine_tags": meal.get("cuisine_tags", []),
        "interest_tags": meal.get("interest_tags", []),
        "features": meal.get("features", []),
        "special_notes": meal.get("special_notes"),
        # approximate location always available; exact only when allowed
        "approx_latitude": round(meal["latitude"], 2) if meal.get("latitude") is not None else None,
        "approx_longitude": round(meal["longitude"], 2) if meal.get("longitude") is not None else None,
        "address_visible": can_see_address,
        "exact_address": meal.get("exact_address") if can_see_address else None,
        "latitude": meal.get("latitude") if can_see_address else None,
        "longitude": meal.get("longitude") if can_see_address else None,
        "created_at": meal.get("created_at"),
    }
    return out


# --------------------------------------------------------------------------- #
# Auth dependency
# --------------------------------------------------------------------------- #
async def _user_from_token(token: str) -> Optional[dict]:
    # 1) Emergent Google session token
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if sess:
        exp = sess.get("expires_at")
        if isinstance(exp, str):
            try:
                exp = datetime.fromisoformat(exp)
            except Exception:
                exp = None
        if exp is not None:
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < now_utc():
                return None
        return await db.users.find_one({"id": sess["user_id"]}, {"_id": 0})
    # 2) Self-minted JWT (email/password)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    except Exception:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Non authentifié")
    token = authorization.split(" ", 1)[1].strip()
    user = await _user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session invalide")
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    return await _user_from_token(token)


# --------------------------------------------------------------------------- #
# Object storage
# --------------------------------------------------------------------------- #
_storage_key = None


def _init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str):
    global _storage_key
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# --------------------------------------------------------------------------- #
# Pydantic request bodies
# --------------------------------------------------------------------------- #
class RegisterBody(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str = Field(min_length=6)
    city: str
    phone: str
    avatar_url: Optional[str] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class SessionBody(BaseModel):
    session_id: str


class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None


class MealCreate(BaseModel):
    title: str
    description: str
    image: Optional[str] = None
    price_cents: int
    max_guests: int
    city: str
    exact_address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    starts_at: str  # ISO datetime string
    dietary_tags: List[str] = []
    cuisine_tags: List[str] = []
    interest_tags: List[str] = []
    features: List[str] = []
    special_notes: Optional[str] = None
    status: str = MEAL_PUBLISHED


# --------------------------------------------------------------------------- #
# Auth routes
# --------------------------------------------------------------------------- #
@api.post("/auth/register")
async def register(body: RegisterBody):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email.")
    uid = "user_" + uuid.uuid4().hex[:12]
    doc = {
        "id": uid,
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "city": body.city.strip(),
        "phone": body.phone.strip(),
        "avatar_url": body.avatar_url,
        "email_verified": False,
        "phone_verified": False,
        "identity_verification_status": "not_started",
        "rating_avg": 0.0,
        "rating_count": 0,
        "meals_hosted_count": 0,
        "guests_welcomed_count": 0,
        "auth_provider": "email",
        "is_seed": False,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    token = make_jwt(uid)
    return {"token": token, "user": private_user(doc)}


@api.post("/auth/login")
async def login(body: LoginBody):
    email = body.email.lower().strip()
    u = await db.users.find_one({"email": email})
    if not u or not u.get("password_hash") or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    token = make_jwt(u["id"])
    return {"token": token, "user": private_user(u)}


@api.post("/auth/session")
async def google_session(body: SessionBody):
    """Exchange an Emergent OAuth session_id for a 7-day session_token."""
    try:
        r = requests.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": body.session_id}, timeout=30)
    except Exception:
        raise HTTPException(status_code=502, detail="Service d'authentification indisponible")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Session Google invalide")
    data = r.json()
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=401, detail="Session Google invalide")

    u = await db.users.find_one({"email": email})
    if not u:
        uid = "user_" + uuid.uuid4().hex[:12]
        name = (data.get("name") or "").strip()
        first = name.split(" ")[0] if name else email.split("@")[0]
        last = " ".join(name.split(" ")[1:]) if len(name.split(" ")) > 1 else ""
        u = {
            "id": uid,
            "first_name": first,
            "last_name": last,
            "email": email,
            "password_hash": None,
            "city": "",
            "phone": "",
            "avatar_url": data.get("picture"),
            "email_verified": True,
            "phone_verified": False,
            "identity_verification_status": "not_started",
            "rating_avg": 0.0,
            "rating_count": 0,
            "meals_hosted_count": 0,
            "guests_welcomed_count": 0,
            "auth_provider": "google",
            "is_seed": False,
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        }
        await db.users.insert_one(u)

    session_token = data.get("session_token") or ("sess_" + uuid.uuid4().hex)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": u["id"],
        "created_at": iso(now_utc()),
        "expires_at": now_utc() + timedelta(days=7),
    })
    return {"token": session_token, "user": private_user(u)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": private_user(user)}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_many({"session_token": token})
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Profile routes
# --------------------------------------------------------------------------- #
@api.put("/users/me")
async def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        updates["updated_at"] = iso(now_utc())
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": private_user(fresh)}


@api.get("/users/{user_id}")
async def get_user_public(user_id: str):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {"user": public_user(u)}


# --------------------------------------------------------------------------- #
# Upload routes
# --------------------------------------------------------------------------- #
@api.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    ext = (file.filename or "img.jpg").split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic", "heif"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4().hex}.{ext}"
    ctype = file.content_type or "image/jpeg"
    try:
        result = await run_in_threadpool(_put_object, path, data, ctype)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 500
        if code == 402:
            raise HTTPException(status_code=402, detail="Quota de stockage atteint")
        raise HTTPException(status_code=500, detail="Échec du téléversement")
    await db.uploads.insert_one({
        "id": uuid.uuid4().hex,
        "owner_id": user["id"],
        "storage_path": result["path"],
        "content_type": ctype,
        "created_at": iso(now_utc()),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}


@api.get("/files/{path:path}")
async def get_file(path: str, token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    # Reads are non-sensitive here (public meal/profile photos). Existence checked in DB.
    rec = await db.uploads.find_one({"storage_path": path}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    try:
        content, ctype = await run_in_threadpool(_get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return Response(content=content, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
@api.get("/config")
async def get_config():
    cfg = await db.app_config.find_one({"id": "global"}, {"_id": 0})
    if not cfg:
        cfg = {
            "id": "global",
            "service_fee_percent": SERVICE_FEE_PERCENT,
            "cancellation_policy": DEFAULT_CANCELLATION_POLICY,
        }
    return {
        "service_fee_percent": cfg.get("service_fee_percent", SERVICE_FEE_PERCENT),
        "cancellation_policy": cfg.get("cancellation_policy", DEFAULT_CANCELLATION_POLICY),
        "currency": "EUR",
        "locale": "fr-FR",
        "timezone": "Europe/Paris",
        "payments_test_mode": PAYMENTS_TEST_MODE,
        "stripe_publishable_key": STRIPE_PUBLISHABLE_KEY,
        "categories": ["Asiatique", "Africain", "Mexicain", "Végétarien", "Végan", "Halal", "Casher", "Dessert"],
        "interests": ["Musique", "Sport", "Cinéma", "Jeux vidéo", "Études"],
        "dietary_options": ["Végétarien", "Végan", "Sans gluten", "Sans porc", "Halal", "Casher"],
    }


# --------------------------------------------------------------------------- #
# Meals — discovery, detail, host management
# --------------------------------------------------------------------------- #
@api.get("/meals")
async def list_meals(
    search: Optional[str] = None,
    city: Optional[str] = None,
    categories: Optional[str] = None,   # comma-separated cuisine/dietary tags
    interests: Optional[str] = None,    # comma-separated
    available_now: Optional[bool] = False,
    small_groups: Optional[bool] = False,
    viewer: Optional[dict] = Depends(get_optional_user),
):
    q: dict = {"status": {"$in": [MEAL_PUBLISHED, MEAL_FULL]}}

    if city:
        q["city"] = {"$regex": f"^{city}$", "$options": "i"}

    if categories:
        cats = [c.strip() for c in categories.split(",") if c.strip()]
        if cats:
            q["$or"] = [
                {"cuisine_tags": {"$in": cats}},
                {"dietary_tags": {"$in": cats}},
            ]

    if interests:
        ints = [i.strip() for i in interests.split(",") if i.strip()]
        if ints:
            q["interest_tags"] = {"$in": ints}

    if small_groups:
        q["max_guests"] = {"$lte": 4}

    if available_now:
        q["starts_at"] = {"$gte": iso(now_utc())}

    docs = await db.meals.find(q, {"_id": 0}).to_list(500)

    results = []
    for m in docs:
        results.append(await meal_public(m, viewer["id"] if viewer else None))

    if search:
        s = search.lower().strip()
        filtered = []
        for r in results:
            hay = " ".join([
                r.get("title", ""),
                r.get("city", "") or "",
                " ".join(r.get("cuisine_tags", [])),
                " ".join(r.get("dietary_tags", [])),
                (r.get("host") or {}).get("first_name", "") or "",
            ]).lower()
            if s in hay:
                filtered.append(r)
        results = filtered

    results.sort(key=lambda r: r.get("starts_at") or "")
    return {"meals": results}


@api.get("/meals/mine")
async def my_meals(user: dict = Depends(get_current_user)):
    docs = await db.meals.find({"host_id": user["id"], "status": {"$ne": MEAL_REMOVED}}, {"_id": 0}).to_list(200)
    out = [await meal_public(m, user["id"]) for m in docs]
    out.sort(key=lambda r: r.get("starts_at") or "")
    return {"meals": out}


@api.get("/meals/{meal_id}")
async def get_meal(meal_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    m = await db.meals.find_one({"id": meal_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Repas introuvable")
    return {"meal": await meal_public(m, viewer["id"] if viewer else None)}


@api.post("/meals")
async def create_meal(body: MealCreate, user: dict = Depends(get_current_user)):
    if body.price_cents < 0:
        raise HTTPException(status_code=400, detail="Le prix doit être positif.")
    if body.max_guests <= 0:
        raise HTTPException(status_code=400, detail="Le nombre d'invités doit être supérieur à 0.")
    if not body.title.strip() or not body.description.strip() or not body.exact_address.strip():
        raise HTTPException(status_code=400, detail="Titre, description et adresse sont requis.")
    try:
        starts = datetime.fromisoformat(body.starts_at.replace("Z", "+00:00"))
        if starts.tzinfo is None:
            from zoneinfo import ZoneInfo
            starts = starts.replace(tzinfo=ZoneInfo("Europe/Paris")).astimezone(timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Date invalide.")
    if body.status == MEAL_PUBLISHED:
        if starts <= now_utc():
            raise HTTPException(status_code=400, detail="La date doit être dans le futur.")
        if not body.image:
            raise HTTPException(status_code=400, detail="Une photo est requise pour publier.")

    mid = "meal_" + uuid.uuid4().hex[:12]
    doc = {
        "id": mid,
        "host_id": user["id"],
        "title": body.title.strip(),
        "description": body.description.strip(),
        "image": body.image,
        "price_cents": body.price_cents,
        "service_fee_percent": SERVICE_FEE_PERCENT,
        "max_guests": body.max_guests,
        "city": body.city.strip(),
        "exact_address": body.exact_address.strip(),
        "latitude": body.latitude,
        "longitude": body.longitude,
        "starts_at": iso(starts),
        "status": body.status,
        "dietary_tags": body.dietary_tags,
        "cuisine_tags": body.cuisine_tags,
        "interest_tags": body.interest_tags,
        "features": body.features,
        "special_notes": body.special_notes,
        "is_seed": False,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.meals.insert_one(doc)
    await db.users.update_one({"id": user["id"]}, {"$inc": {"meals_hosted_count": 1}})
    return {"meal": await meal_public(doc, user["id"])}


# --------------------------------------------------------------------------- #
# Phase 2-5 helpers
# --------------------------------------------------------------------------- #
def compute_fee(subtotal_cents: int, pct: int = SERVICE_FEE_PERCENT) -> int:
    return round(subtotal_cents * pct / 100.0)


async def notify(user_id: str, ntype: str, title: str, body: str, **refs):
    doc = {
        "id": "notif_" + uuid.uuid4().hex[:12],
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "body": body,
        "read": False,
        "meal_id": refs.get("meal_id"),
        "booking_id": refs.get("booking_id"),
        "conversation_id": refs.get("conversation_id"),
        "created_at": iso(now_utc()),
    }
    await db.notifications.insert_one(doc)


async def capacity_left(meal_id: str, max_guests: int) -> int:
    return max(0, max_guests - await seats_taken(meal_id))


async def recompute_host_rating(host_id: str):
    reviews = await db.reviews.find({"host_id": host_id}, {"_id": 0, "overall": 1}).to_list(2000)
    if not reviews:
        return
    avg = sum(r["overall"] for r in reviews) / len(reviews)
    await db.users.update_one({"id": host_id}, {"$set": {"rating_avg": round(avg, 1), "rating_count": len(reviews)}})


async def ensure_conversation(guest_id: str, host_id: str, meal_id: str) -> dict:
    conv = await db.conversations.find_one(
        {"meal_id": meal_id, "participant_ids": {"$all": [guest_id, host_id]}}, {"_id": 0}
    )
    if conv:
        return conv
    conv = {
        "id": "conv_" + uuid.uuid4().hex[:12],
        "participant_ids": [guest_id, host_id],
        "guest_id": guest_id,
        "host_id": host_id,
        "meal_id": meal_id,
        "last_message": None,
        "last_message_at": iso(now_utc()),
        "unread": {guest_id: 0, host_id: 0},
        "created_at": iso(now_utc()),
    }
    await db.conversations.insert_one(conv)
    return conv


async def add_message(conv_id: str, sender_id: str, mtype: str, body: str, booking_id: str = None) -> dict:
    msg = {
        "id": "msg_" + uuid.uuid4().hex[:12],
        "conversation_id": conv_id,
        "sender_id": sender_id,
        "type": mtype,
        "body": body,
        "booking_id": booking_id,
        "created_at": iso(now_utc()),
    }
    await db.messages.insert_one(msg)
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if conv:
        other = [p for p in conv["participant_ids"] if p != sender_id]
        inc = {f"unread.{o}": 1 for o in other}
        await db.conversations.update_one(
            {"id": conv_id},
            {"$set": {"last_message": body[:120], "last_message_at": msg["created_at"]}, "$inc": inc},
        )
    return msg


async def serialize_conversation(conv: dict, me_id: str) -> dict:
    other_id = next((p for p in conv["participant_ids"] if p != me_id), conv["participant_ids"][0])
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    meal = await db.meals.find_one({"id": conv.get("meal_id")}, {"_id": 0})
    return {
        "id": conv["id"],
        "other_user": public_user(other),
        "meal_id": conv.get("meal_id"),
        "meal_title": meal["title"] if meal else None,
        "meal_image": meal.get("image") if meal else None,
        "last_message": conv.get("last_message"),
        "last_message_at": conv.get("last_message_at"),
        "unread": (conv.get("unread") or {}).get(me_id, 0),
        "created_at": conv.get("created_at"),
    }


async def auto_complete_booking(b: dict):
    if b.get("state") == BOOKING_CONFIRMED:
        meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
        if meal and meal.get("starts_at") and meal["starts_at"] < iso(now_utc()):
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"state": BOOKING_COMPLETED, "updated_at": iso(now_utc())}})
            b["state"] = BOOKING_COMPLETED


async def serialize_booking(b: dict, me_id: str) -> dict:
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    meal_pub = await meal_public(meal, me_id) if meal else None
    guest = await db.users.find_one({"id": b["guest_id"]}, {"_id": 0})
    existing_review = await db.reviews.find_one({"booking_id": b["id"], "guest_id": b["guest_id"]})
    return {
        "id": b["id"],
        "meal_id": b["meal_id"],
        "meal": meal_pub,
        "guest": public_user(guest),
        "guest_id": b["guest_id"],
        "host_id": meal["host_id"] if meal else None,
        "guest_count": b["guest_count"],
        "subtotal_cents": b["subtotal_cents"],
        "service_fee_cents": b["service_fee_cents"],
        "total_cents": b["total_cents"],
        "state": b["state"],
        "payment_status": b.get("payment_status", "pending"),
        "cancellation_reason": b.get("cancellation_reason"),
        "conversation_id": b.get("conversation_id"),
        "can_review": b["state"] == BOOKING_COMPLETED and existing_review is None,
        "reviewed": existing_review is not None,
        "created_at": b.get("created_at"),
    }


# --------------------------------------------------------------------------- #
# Phase 2 — meal edit / withdraw / reservations
# --------------------------------------------------------------------------- #
class MealUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    price_cents: Optional[int] = None
    max_guests: Optional[int] = None
    city: Optional[str] = None
    exact_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    starts_at: Optional[str] = None
    dietary_tags: Optional[List[str]] = None
    cuisine_tags: Optional[List[str]] = None
    interest_tags: Optional[List[str]] = None
    features: Optional[List[str]] = None
    special_notes: Optional[str] = None
    status: Optional[str] = None


class WithdrawBody(BaseModel):
    reason: str
    message: Optional[str] = None


@api.put("/meals/{meal_id}")
async def edit_meal(meal_id: str, body: MealUpdate, user: dict = Depends(get_current_user)):
    meal = await db.meals.find_one({"id": meal_id}, {"_id": 0})
    if not meal:
        raise HTTPException(status_code=404, detail="Repas introuvable")
    if meal["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Tu ne peux modifier que tes propres repas.")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "price_cents" in updates and updates["price_cents"] < 0:
        raise HTTPException(status_code=400, detail="Le prix doit être positif.")
    if "max_guests" in updates and updates["max_guests"] <= 0:
        raise HTTPException(status_code=400, detail="Le nombre d'invités doit être supérieur à 0.")
    if updates:
        updates["updated_at"] = iso(now_utc())
        await db.meals.update_one({"id": meal_id}, {"$set": updates})
    fresh = await db.meals.find_one({"id": meal_id}, {"_id": 0})
    return {"meal": await meal_public(fresh, user["id"])}


@api.post("/meals/{meal_id}/withdraw")
async def withdraw_meal(meal_id: str, body: WithdrawBody, user: dict = Depends(get_current_user)):
    meal = await db.meals.find_one({"id": meal_id}, {"_id": 0})
    if not meal:
        raise HTTPException(status_code=404, detail="Repas introuvable")
    if meal["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Tu ne peux retirer que tes propres repas.")
    await db.meals.update_one({"id": meal_id}, {"$set": {"status": MEAL_REMOVED, "withdraw_reason": body.reason, "updated_at": iso(now_utc())}})
    # cancel active bookings, refund, notify guests
    active = await db.bookings.find({"meal_id": meal_id, "state": {"$in": [BOOKING_REQUESTED, BOOKING_ACCEPTED_PENDING_PAYMENT, BOOKING_CONFIRMED]}}, {"_id": 0}).to_list(500)
    for b in active:
        refunded = b["state"] == BOOKING_CONFIRMED
        await db.bookings.update_one({"id": b["id"]}, {"$set": {
            "state": BOOKING_CANCELLED_BY_HOST,
            "payment_status": "refunded" if refunded else b.get("payment_status", "pending"),
            "cancellation_reason": body.reason,
            "updated_at": iso(now_utc()),
        }})
        if refunded and not PAYMENTS_TEST_MODE and stripe_sdk and b.get("stripe_payment_intent_id"):
            try:
                stripe_sdk.Refund.create(payment_intent=b["stripe_payment_intent_id"], reverse_transfer=True, refund_application_fee=True, idempotency_key=f"refund-{b['id']}")
            except Exception as e:
                logger.warning(f"Refund failed: {e}")
        await notify(b["guest_id"], "meal_cancelled", "Repas annulé par l'hôte",
                     f"« {meal['title']} » a été annulé. {'Un remboursement a été initié.' if refunded else ''}",
                     meal_id=meal_id, booking_id=b["id"])
    return {"ok": True, "cancelled": len(active)}


@api.get("/meals/{meal_id}/reservations")
async def meal_reservations(meal_id: str, user: dict = Depends(get_current_user)):
    meal = await db.meals.find_one({"id": meal_id}, {"_id": 0})
    if not meal:
        raise HTTPException(status_code=404, detail="Repas introuvable")
    if meal["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé.")
    bookings = await db.bookings.find({"meal_id": meal_id, "state": {"$nin": [BOOKING_DECLINED]}}, {"_id": 0}).to_list(500)
    out = [await serialize_booking(b, user["id"]) for b in bookings]
    return {"reservations": out, "remaining": await capacity_left(meal_id, meal["max_guests"])}


# --------------------------------------------------------------------------- #
# Phase 3 — messaging + booking requests
# --------------------------------------------------------------------------- #
class ConversationCreate(BaseModel):
    meal_id: str


class MessageCreate(BaseModel):
    body: str


class BookingCreate(BaseModel):
    meal_id: str
    guest_count: int = 1


async def require_participant(conv_id: str, user_id: str) -> dict:
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    if user_id not in conv["participant_ids"]:
        raise HTTPException(status_code=403, detail="Accès refusé.")
    return conv


@api.post("/conversations")
async def create_conversation(body: ConversationCreate, user: dict = Depends(get_current_user)):
    meal = await db.meals.find_one({"id": body.meal_id}, {"_id": 0})
    if not meal:
        raise HTTPException(status_code=404, detail="Repas introuvable")
    if meal["host_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Tu es l'hôte de ce repas.")
    conv = await ensure_conversation(user["id"], meal["host_id"], meal["id"])
    return {"conversation": await serialize_conversation(conv, user["id"])}


@api.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    convs = await db.conversations.find({"participant_ids": user["id"]}, {"_id": 0}).to_list(500)
    out = [await serialize_conversation(c, user["id"]) for c in convs]
    out.sort(key=lambda c: c.get("last_message_at") or "", reverse=True)
    return {"conversations": out}


@api.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await require_participant(conv_id, user["id"])
    msgs = await db.messages.find({"conversation_id": conv_id}, {"_id": 0}).to_list(1000)
    msgs.sort(key=lambda m: m.get("created_at") or "")
    # attach booking snapshots for booking messages
    for m in msgs:
        if m.get("booking_id"):
            b = await db.bookings.find_one({"id": m["booking_id"]}, {"_id": 0})
            m["booking"] = await serialize_booking(b, user["id"]) if b else None
    await db.conversations.update_one({"id": conv_id}, {"$set": {f"unread.{user['id']}": 0}})
    return {"conversation": await serialize_conversation(conv, user["id"]), "messages": msgs}


@api.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    conv = await require_participant(conv_id, user["id"])
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Message vide.")
    msg = await add_message(conv_id, user["id"], "text", body.body.strip())
    other = next(p for p in conv["participant_ids"] if p != user["id"])
    await notify(other, "new_message", "Nouveau message", f"{user['first_name']} : {body.body.strip()[:60]}", conversation_id=conv_id)
    return {"message": msg}


@api.post("/bookings")
async def create_booking(body: BookingCreate, user: dict = Depends(get_current_user)):
    meal = await db.meals.find_one({"id": body.meal_id}, {"_id": 0})
    if not meal:
        raise HTTPException(status_code=404, detail="Repas introuvable")
    if meal["host_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Tu ne peux pas réserver ton propre repas.")
    if meal["status"] not in (MEAL_PUBLISHED, MEAL_FULL):
        raise HTTPException(status_code=400, detail="Ce repas n'est plus disponible.")
    if body.guest_count < 1:
        raise HTTPException(status_code=400, detail="Nombre d'invités invalide.")
    remaining = await capacity_left(body.meal_id, meal["max_guests"])
    if body.guest_count > remaining:
        raise HTTPException(status_code=400, detail=f"Il ne reste que {remaining} place(s).")
    # reuse an active booking if one exists
    existing = await db.bookings.find_one({"meal_id": body.meal_id, "guest_id": user["id"],
                                           "state": {"$in": [BOOKING_REQUESTED, BOOKING_ACCEPTED_PENDING_PAYMENT, BOOKING_CONFIRMED]}}, {"_id": 0})
    conv = await ensure_conversation(user["id"], meal["host_id"], meal["id"])
    if existing:
        return {"booking": await serialize_booking(existing, user["id"]), "conversation_id": conv["id"]}
    subtotal = meal["price_cents"] * body.guest_count
    fee = compute_fee(subtotal, meal.get("service_fee_percent", SERVICE_FEE_PERCENT))
    bid = "book_" + uuid.uuid4().hex[:12]
    doc = {
        "id": bid, "meal_id": body.meal_id, "guest_id": user["id"], "guest_count": body.guest_count,
        "subtotal_cents": subtotal, "service_fee_cents": fee, "total_cents": subtotal + fee,
        "state": BOOKING_REQUESTED, "payment_status": "pending", "payment_reference": None,
        "stripe_payment_intent_id": None, "stripe_checkout_session_id": None,
        "cancellation_reason": None, "conversation_id": conv["id"], "is_seed": False,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.bookings.insert_one(doc)
    await add_message(conv["id"], user["id"], "booking_request",
                      f"Demande de réservation pour {body.guest_count} personne(s).", booking_id=bid)
    await notify(meal["host_id"], "booking_request", "Nouvelle demande de réservation",
                 f"{user['first_name']} souhaite réserver « {meal['title']} ».", meal_id=meal["id"], booking_id=bid, conversation_id=conv["id"])
    return {"booking": await serialize_booking(doc, user["id"]), "conversation_id": conv["id"]}


async def _load_booking_for_host(booking_id: str, host_id: str) -> dict:
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    if not meal or meal["host_id"] != host_id:
        raise HTTPException(status_code=403, detail="Accès refusé.")
    return b


@api.post("/bookings/{booking_id}/accept")
async def accept_booking(booking_id: str, user: dict = Depends(get_current_user)):
    b = await _load_booking_for_host(booking_id, user["id"])
    if b["state"] != BOOKING_REQUESTED:
        raise HTTPException(status_code=400, detail="Cette demande ne peut plus être acceptée.")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"state": BOOKING_ACCEPTED_PENDING_PAYMENT, "updated_at": iso(now_utc())}})
    b["state"] = BOOKING_ACCEPTED_PENDING_PAYMENT
    await add_message(b["conversation_id"], user["id"], "booking_accepted",
                      f"{user['first_name']} a accepté ta demande. Tu peux maintenant procéder au paiement.", booking_id=booking_id)
    await notify(b["guest_id"], "booking_accepted", "Réservation acceptée !",
                 f"{user['first_name']} a accepté ta demande. Procède au paiement pour confirmer.", booking_id=booking_id, conversation_id=b["conversation_id"])
    return {"booking": await serialize_booking(b, user["id"])}


@api.post("/bookings/{booking_id}/decline")
async def decline_booking(booking_id: str, user: dict = Depends(get_current_user)):
    b = await _load_booking_for_host(booking_id, user["id"])
    if b["state"] not in (BOOKING_REQUESTED, BOOKING_ACCEPTED_PENDING_PAYMENT):
        raise HTTPException(status_code=400, detail="Cette demande ne peut plus être refusée.")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"state": BOOKING_DECLINED, "updated_at": iso(now_utc())}})
    b["state"] = BOOKING_DECLINED
    await add_message(b["conversation_id"], user["id"], "system", "La demande de réservation a été refusée.", booking_id=booking_id)
    await notify(b["guest_id"], "booking_declined", "Demande refusée", "L'hôte n'a pas pu accepter ta demande cette fois.", booking_id=booking_id)
    return {"booking": await serialize_booking(b, user["id"])}


class GuestCountBody(BaseModel):
    guest_count: int


@api.post("/bookings/{booking_id}/guest-count")
async def update_guest_count(booking_id: str, body: GuestCountBody, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["state"] not in (BOOKING_REQUESTED, BOOKING_ACCEPTED_PENDING_PAYMENT):
        raise HTTPException(status_code=400, detail="Le nombre d'invités ne peut plus être modifié.")
    if body.guest_count < 1:
        raise HTTPException(status_code=400, detail="Au moins 1 invité.")
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    remaining = await capacity_left(b["meal_id"], meal["max_guests"])
    if body.guest_count > remaining:
        raise HTTPException(status_code=400, detail=f"Il ne reste que {remaining} place(s).")
    subtotal = meal["price_cents"] * body.guest_count
    fee = compute_fee(subtotal, meal.get("service_fee_percent", SERVICE_FEE_PERCENT))
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "guest_count": body.guest_count, "subtotal_cents": subtotal,
        "service_fee_cents": fee, "total_cents": subtotal + fee, "updated_at": iso(now_utc()),
    }})
    fresh = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return {"booking": await serialize_booking(fresh, user["id"])}


@api.get("/bookings/mine")
async def my_bookings(user: dict = Depends(get_current_user)):
    bookings = await db.bookings.find({"guest_id": user["id"]}, {"_id": 0}).to_list(500)
    for b in bookings:
        await auto_complete_booking(b)
    out = [await serialize_booking(b, user["id"]) for b in bookings]
    out.sort(key=lambda x: (x.get("meal") or {}).get("starts_at") or "", reverse=True)
    return {"bookings": out}


@api.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    if user["id"] != b["guest_id"] and (not meal or meal["host_id"] != user["id"]):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    await auto_complete_booking(b)
    return {"booking": await serialize_booking(b, user["id"])}


# --------------------------------------------------------------------------- #
# Phase 4 — payment
# --------------------------------------------------------------------------- #
class CheckoutBody(BaseModel):
    booking_id: str


async def _confirm_booking(b: dict):
    """Mark a booking CONFIRMED, reveal address, notify, update host stats."""
    await db.bookings.update_one(
        {"id": b["id"], "payment_status": {"$ne": "refunded"}},
        {"$set": {"state": BOOKING_CONFIRMED, "payment_status": "succeeded",
                  "confirmed_at": iso(now_utc()), "updated_at": iso(now_utc())}},
    )
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    if meal:
        remaining = await capacity_left(b["meal_id"], meal["max_guests"])
        if remaining <= 0:
            await db.meals.update_one({"id": meal["id"]}, {"$set": {"status": MEAL_FULL}})
        await db.users.update_one({"id": meal["host_id"]}, {"$inc": {"guests_welcomed_count": b["guest_count"]}})
        await notify(meal["host_id"], "payment_confirmed", "Paiement confirmé",
                     f"Une réservation pour « {meal['title']} » est confirmée.", meal_id=meal["id"], booking_id=b["id"])
    await notify(b["guest_id"], "payment_confirmed", "Réservation confirmée 🎉",
                 "Ton paiement est confirmé. L'adresse exacte est maintenant disponible.", booking_id=b["id"])
    if b.get("conversation_id"):
        await add_message(b["conversation_id"], b["guest_id"], "system", "Paiement effectué — réservation confirmée ✅", booking_id=b["id"])


@api.post("/payments/checkout")
async def payments_checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": body.booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["state"] == BOOKING_CONFIRMED:
        raise HTTPException(status_code=409, detail="Réservation déjà confirmée.")
    if b["state"] != BOOKING_ACCEPTED_PENDING_PAYMENT:
        raise HTTPException(status_code=400, detail="La réservation doit être acceptée par l'hôte avant le paiement.")
    remaining = 0
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    if meal:
        remaining = await capacity_left(b["meal_id"], meal["max_guests"])
    if b["guest_count"] > remaining:
        raise HTTPException(status_code=409, detail="Plus assez de places disponibles.")

    if PAYMENTS_TEST_MODE or not stripe_sdk:
        return {"test_mode": True, "total_cents": b["total_cents"]}

    # Stripe Connect: the host must have completed onboarding (payouts enabled).
    host = await db.users.find_one({"id": meal["host_id"]}, {"_id": 0}) if meal else None
    account_id = (host or {}).get("stripe_connect_account_id")
    if not account_id:
        raise HTTPException(status_code=409, detail="L'hôte n'a pas encore configuré ses versements. Contacte-le avant de payer.")
    try:
        acct = stripe_sdk.Account.retrieve(account_id)
    except Exception:
        raise HTTPException(status_code=409, detail="Compte de versement de l'hôte indisponible.")
    if not (acct.charges_enabled and acct.payouts_enabled):
        raise HTTPException(status_code=409, detail="L'hôte doit finaliser la configuration de ses versements Stripe.")

    session = stripe_sdk.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {"currency": "eur",
                           "product_data": {"name": meal["title"] if meal else "Repas Buddiz"},
                           "unit_amount": b["total_cents"]},
            "quantity": 1,
        }],
        metadata={"booking_id": b["id"]},
        payment_intent_data={
            "application_fee_amount": b["service_fee_cents"],
            "transfer_data": {"destination": account_id},
            "metadata": {"booking_id": b["id"], "host_id": meal["host_id"]},
        },
        success_url=f"{APP_PUBLIC_URL}/payment-success?booking_id={b['id']}",
        cancel_url=f"{APP_PUBLIC_URL}/payment-cancelled",
        idempotency_key=f"checkout-{b['id']}",
    )
    await db.bookings.update_one({"id": b["id"]}, {"$set": {"stripe_checkout_session_id": session.id}})
    return {"test_mode": False, "checkout_url": session.url, "total_cents": b["total_cents"]}


@api.post("/payments/confirm-test")
async def payments_confirm_test(body: CheckoutBody, user: dict = Depends(get_current_user)):
    if not PAYMENTS_TEST_MODE:
        raise HTTPException(status_code=400, detail="Le paiement réel Stripe est configuré.")
    b = await db.bookings.find_one({"id": body.booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["state"] != BOOKING_ACCEPTED_PENDING_PAYMENT:
        raise HTTPException(status_code=400, detail="La réservation doit d'abord être acceptée.")
    await _confirm_booking(b)
    fresh = await db.bookings.find_one({"id": b["id"]}, {"_id": 0})
    return {"booking": await serialize_booking(fresh, user["id"])}


@api.get("/payments/status/{booking_id}")
async def payment_status(booking_id: str, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    return {"payment_status": b.get("payment_status"), "state": b["state"]}


@api.post("/payments/verify")
async def payments_verify(body: CheckoutBody, user: dict = Depends(get_current_user)):
    """Server-side verification of a Stripe Checkout Session (used when no webhook)."""
    b = await db.bookings.find_one({"id": body.booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["state"] in (BOOKING_CONFIRMED, BOOKING_COMPLETED):
        fresh = await db.bookings.find_one({"id": b["id"]}, {"_id": 0})
        return {"booking": await serialize_booking(fresh, user["id"]), "confirmed": True}
    if not stripe_sdk or not b.get("stripe_checkout_session_id"):
        raise HTTPException(status_code=400, detail="Aucune session de paiement à vérifier.")
    try:
        session = stripe_sdk.checkout.Session.retrieve(b["stripe_checkout_session_id"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Vérification impossible: {e}")
    if session.get("payment_status") == "paid":
        pi = session.get("payment_intent")
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"stripe_payment_intent_id": pi, "payment_reference": session.get("id")}})
        await _confirm_booking(b)
        fresh = await db.bookings.find_one({"id": b["id"]}, {"_id": 0})
        return {"booking": await serialize_booking(fresh, user["id"]), "confirmed": True}
    return {"booking": await serialize_booking(b, user["id"]), "confirmed": False}


@api.get("/host/earnings")
async def host_earnings(user: dict = Depends(get_current_user)):
    meals = await db.meals.find({"host_id": user["id"]}, {"_id": 0, "id": 1, "title": 1, "image": 1, "starts_at": 1}).to_list(1000)
    meal_map = {m["id"]: m for m in meals}
    if not meal_map:
        return {"summary": {"net_earnings_cents": 0, "buddiz_fees_cents": 0, "gross_cents": 0, "paid_count": 0, "refunded_count": 0, "refunded_cents": 0}, "items": []}
    bookings = await db.bookings.find(
        {"meal_id": {"$in": list(meal_map.keys())}, "payment_status": {"$in": ["succeeded", "refunded"]}},
        {"_id": 0},
    ).to_list(2000)
    items, net, fees, gross, paid, ref_count, ref_cents = [], 0, 0, 0, 0, 0, 0
    for b in bookings:
        m = meal_map.get(b["meal_id"], {})
        refunded = b.get("payment_status") == "refunded"
        host_net = b["subtotal_cents"]
        if refunded:
            ref_count += 1
            ref_cents += b.get("refund_cents", 0)
        else:
            paid += 1
            net += host_net
            fees += b["service_fee_cents"]
            gross += b["total_cents"]
        guest = await db.users.find_one({"id": b["guest_id"]}, {"_id": 0})
        items.append({
            "booking_id": b["id"], "meal_title": m.get("title", "Repas"), "meal_image": m.get("image"),
            "date": m.get("starts_at"), "guest_first_name": (guest or {}).get("first_name", ""),
            "guest_count": b["guest_count"], "gross_cents": b["total_cents"], "fee_cents": b["service_fee_cents"],
            "net_cents": host_net, "refunded": refunded, "refund_cents": b.get("refund_cents", 0),
            "created_at": b.get("confirmed_at") or b.get("updated_at") or b.get("created_at"),
        })
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {
        "summary": {"net_earnings_cents": net, "buddiz_fees_cents": fees, "gross_cents": gross,
                    "paid_count": paid, "refunded_count": ref_count, "refunded_cents": ref_cents},
        "items": items,
    }


@api.get("/connect/dashboard")
async def connect_dashboard(user: dict = Depends(get_current_user)):
    account_id = user.get("stripe_connect_account_id")
    if not account_id or not stripe_sdk:
        raise HTTPException(status_code=409, detail="Aucun compte Stripe connecté.")
    try:
        link = stripe_sdk.Account.create_login_link(account_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Tableau de bord indisponible: {e}")
    return {"url": link.url}


# --------------------------------------------------------------------------- #
# Stripe Connect — host onboarding (Express) + payout status
# --------------------------------------------------------------------------- #
async def _connect_status_dict(account_id: str) -> dict:
    acct = stripe_sdk.Account.retrieve(account_id)
    return {
        "connected": True,
        "account_id": account_id,
        "details_submitted": bool(acct.details_submitted),
        "onboarding_complete": bool(acct.details_submitted),
        "charges_enabled": bool(acct.charges_enabled),
        "payouts_enabled": bool(acct.payouts_enabled),
        "ready": bool(acct.charges_enabled and acct.payouts_enabled),
    }


def _account_link(account_id: str):
    return stripe_sdk.AccountLink.create(
        account=account_id,
        type="account_onboarding",
        collect="eventually_due",
        refresh_url=f"{APP_PUBLIC_URL}/api/connect/refresh/{account_id}",
        return_url=f"{APP_PUBLIC_URL}/api/connect/return/{account_id}",
    )


@api.post("/connect/account")
async def connect_account(user: dict = Depends(get_current_user)):
    if not stripe_sdk or PAYMENTS_TEST_MODE:
        raise HTTPException(status_code=400, detail="Stripe n'est pas configuré.")
    account_id = user.get("stripe_connect_account_id")
    if not account_id:
        try:
            account = stripe_sdk.Account.create(
                type="express",
                capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
                business_type="individual",
                business_profile={"product_description": "Hôte de repas partagés sur Buddiz"},
                metadata={"buddiz_user_id": user["id"]},
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Impossible de créer le compte Stripe (Connect activé ?): {e}")
        account_id = account.id
        await db.users.update_one({"id": user["id"]}, {"$set": {"stripe_connect_account_id": account_id, "updated_at": iso(now_utc())}})
    link = _account_link(account_id)
    return {"account_id": account_id, "onboarding_url": link.url}


@api.get("/connect/status")
async def connect_status(user: dict = Depends(get_current_user)):
    account_id = user.get("stripe_connect_account_id")
    if not account_id or not stripe_sdk:
        return {"connected": False, "ready": False, "onboarding_complete": False}
    status = await _connect_status_dict(account_id)
    await db.users.update_one({"id": user["id"]}, {"$set": {"stripe_connect_status": status, "updated_at": iso(now_utc())}})
    return status


@app.get("/api/connect/return/{account_id}")
async def connect_return(account_id: str):
    from fastapi.responses import RedirectResponse
    return RedirectResponse(f"{APP_PUBLIC_URL}/connect-return?account_id={account_id}")


@app.get("/api/connect/refresh/{account_id}")
async def connect_refresh(account_id: str):
    from fastapi.responses import RedirectResponse
    link = _account_link(account_id)
    return RedirectResponse(link.url)


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    if not stripe_sdk or not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=400, detail="Webhook non configuré")
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe_sdk.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Signature invalide")
    eid = event["id"]
    ins = await db.stripe_events.update_one({"_id": eid}, {"$setOnInsert": {"type": event["type"]}}, upsert=True)
    if not ins.upserted_id:
        return {"ok": True, "duplicate": True}
    obj = event["data"]["object"]
    etype = event["type"]
    if etype == "account.updated":
        status = {
            "connected": True, "account_id": obj["id"],
            "details_submitted": obj.get("details_submitted", False),
            "onboarding_complete": obj.get("details_submitted", False),
            "charges_enabled": obj.get("charges_enabled", False),
            "payouts_enabled": obj.get("payouts_enabled", False),
            "ready": bool(obj.get("charges_enabled") and obj.get("payouts_enabled")),
        }
        await db.users.update_one({"stripe_connect_account_id": obj["id"]}, {"$set": {"stripe_connect_status": status}})
        return {"ok": True}
    booking_id = (obj.get("metadata") or {}).get("booking_id")
    if booking_id:
        b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if b:
            if etype in ("payment_intent.succeeded", "checkout.session.completed"):
                await _confirm_booking(b)
            elif etype == "payment_intent.payment_failed":
                await db.bookings.update_one({"id": booking_id}, {"$set": {"payment_status": "failed"}})
            elif etype == "payment_intent.canceled":
                await db.bookings.update_one({"id": booking_id}, {"$set": {"payment_status": "cancelled"}})
            elif etype == "charge.refunded":
                await db.bookings.update_one({"id": booking_id}, {"$set": {"payment_status": "refunded"}})
    return {"ok": True}


@api.get("/bookings/{booking_id}/address")
async def booking_address(booking_id: str, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b or b["state"] not in (BOOKING_CONFIRMED, BOOKING_COMPLETED):
        raise HTTPException(status_code=403, detail="Adresse disponible après confirmation du paiement.")
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    return {"address": meal.get("exact_address"), "latitude": meal.get("latitude"), "longitude": meal.get("longitude")}


# --------------------------------------------------------------------------- #
# Phase 5 — cancellation, reviews, feedback, notifications
# --------------------------------------------------------------------------- #
class CancelBody(BaseModel):
    reason: str
    message: Optional[str] = None


class ReviewBody(BaseModel):
    booking_id: str
    overall: int
    categories: dict = {}
    comment: Optional[str] = None


class FeedbackBody(BaseModel):
    options: List[str] = []
    message: Optional[str] = None
    rating: Optional[int] = None


@api.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, body: CancelBody, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["state"] not in (BOOKING_REQUESTED, BOOKING_ACCEPTED_PENDING_PAYMENT, BOOKING_CONFIRMED):
        raise HTTPException(status_code=400, detail="Cette réservation ne peut pas être annulée.")
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    cfg = await db.app_config.find_one({"id": "global"}, {"_id": 0}) or {}
    policy = cfg.get("cancellation_policy", DEFAULT_CANCELLATION_POLICY)
    refund_cents = 0
    if b["state"] == BOOKING_CONFIRMED and b.get("payment_status") == "succeeded":
        hours_before = 999
        if meal and meal.get("starts_at"):
            try:
                start = datetime.fromisoformat(meal["starts_at"])
                hours_before = (start - now_utc()).total_seconds() / 3600.0
            except Exception:
                pass
        pct = 100 if hours_before >= policy.get("full_refund_hours", 24) else policy.get("partial_refund_percent", 50)
        refund_cents = round(b["total_cents"] * pct / 100.0)
        if not PAYMENTS_TEST_MODE and stripe_sdk and b.get("stripe_payment_intent_id"):
            try:
                stripe_sdk.Refund.create(payment_intent=b["stripe_payment_intent_id"], amount=refund_cents, reverse_transfer=True, refund_application_fee=True, idempotency_key=f"refund-{b['id']}")
            except Exception as e:
                logger.warning(f"Refund failed: {e}")
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "state": BOOKING_CANCELLED_BY_GUEST,
        "payment_status": "refunded" if refund_cents > 0 else b.get("payment_status", "pending"),
        "cancellation_reason": body.reason, "refund_cents": refund_cents, "updated_at": iso(now_utc()),
    }})
    if meal:
        if meal.get("status") == MEAL_FULL:
            await db.meals.update_one({"id": meal["id"]}, {"$set": {"status": MEAL_PUBLISHED}})
        await notify(meal["host_id"], "booking_cancelled", "Réservation annulée",
                     f"Un invité a annulé sa réservation pour « {meal['title']} ».", meal_id=meal["id"], booking_id=booking_id)
    return {"ok": True, "refund_cents": refund_cents}


@api.post("/reviews")
async def create_review(body: ReviewBody, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": body.booking_id, "guest_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    await auto_complete_booking(b)
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if b["state"] != BOOKING_COMPLETED:
        raise HTTPException(status_code=403, detail="Tu peux évaluer seulement après un repas terminé.")
    if await db.reviews.find_one({"booking_id": body.booking_id, "guest_id": user["id"]}):
        raise HTTPException(status_code=409, detail="Tu as déjà évalué ce repas.")
    if not (1 <= body.overall <= 5):
        raise HTTPException(status_code=400, detail="Note invalide.")
    meal = await db.meals.find_one({"id": b["meal_id"]}, {"_id": 0})
    review = {
        "id": "rev_" + uuid.uuid4().hex[:12], "booking_id": body.booking_id, "meal_id": b["meal_id"],
        "host_id": meal["host_id"], "guest_id": user["id"], "overall": body.overall,
        "categories": body.categories, "comment": body.comment, "created_at": iso(now_utc()),
    }
    await db.reviews.insert_one(review)
    await recompute_host_rating(meal["host_id"])
    review.pop("_id", None)
    return {"review": review}


@api.get("/reviews/host/{host_id}")
async def host_reviews(host_id: str):
    revs = await db.reviews.find({"host_id": host_id}, {"_id": 0}).to_list(500)
    revs.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    out = []
    for r in revs:
        guest = await db.users.find_one({"id": r["guest_id"]}, {"_id": 0})
        out.append({**r, "guest": public_user(guest)})
    return {"reviews": out}


@api.post("/feedback")
async def app_feedback(body: FeedbackBody, user: dict = Depends(get_current_user)):
    await db.app_feedback.insert_one({
        "id": "fb_" + uuid.uuid4().hex[:12], "user_id": user["id"],
        "options": body.options, "message": body.message, "rating": body.rating,
        "created_at": iso(now_utc()),
    })
    return {"ok": True}


@api.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    notifs.sort(key=lambda n: n.get("created_at") or "", reverse=True)
    return {"notifications": notifs, "unread": sum(1 for n in notifs if not n.get("read"))}


@api.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    c = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"unread": c}


@api.post("/notifications/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# --------------------------------------------------------------------------- #
# AI — Buddiz help assistant + messaging reply suggestions (OpenAI gpt-5.4-mini)
# --------------------------------------------------------------------------- #
from emergentintegrations.llm.chat import LlmChat, UserMessage

AI_PROVIDER = "openai"
AI_MODEL = "gpt-5.4-mini"

BUDDIZ_ASSISTANT_PROMPT = (
    "Tu es l'assistant d'aide de Buddiz, une application de repas partagés entre particuliers en France. "
    "Tu réponds toujours en français, de façon chaleureuse, concise et utile (2 à 5 phrases max). "
    "Tu connais le fonctionnement de l'app : découvrir des repas près de chez soi, contacter l'hôte par messagerie, "
    "demander une place, l'hôte accepte, payer en ligne (paiement sécurisé Stripe, commission Buddiz de 10%), "
    "l'adresse exacte est révélée seulement après confirmation du paiement, se rendre au repas, puis laisser un avis. "
    "N'importe quel utilisateur peut aussi devenir hôte et publier un repas, et configurer ses versements Stripe pour être payé. "
    "Politique d'annulation : remboursement intégral à 24h ou plus avant le repas, 50% en dessous. "
    "Ne donne jamais l'adresse exacte d'un hôte. Si une question sort du cadre de Buddiz, invite gentiment à contacter le support. "
    "N'invente pas de fonctionnalités qui n'existent pas."
)


class AssistantBody(BaseModel):
    message: str
    history: List[dict] = []


class SuggestBody(BaseModel):
    conversation_id: str


@api.post("/ai/assistant")
async def ai_assistant(body: AssistantBody, user: dict = Depends(get_current_user)):
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="Assistant indisponible.")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message vide.")
    transcript = ""
    for h in (body.history or [])[-8:]:
        role = h.get("role")
        content = (h.get("content") or "").strip()
        if not content:
            continue
        transcript += f"{'Utilisateur' if role == 'user' else 'Assistant'}: {content}\n"
    prompt = (f"{transcript}Utilisateur: {body.message.strip()}\nAssistant:") if transcript else body.message.strip()
    try:
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"assist_{user['id']}",
                       system_message=BUDDIZ_ASSISTANT_PROMPT).with_model(AI_PROVIDER, AI_MODEL)
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning(f"AI assistant error: {e}")
        raise HTTPException(status_code=503, detail="L'assistant est momentanément indisponible.")
    return {"reply": (reply or "").strip()}


@api.post("/ai/reply-suggestions")
async def ai_reply_suggestions(body: SuggestBody, user: dict = Depends(get_current_user)):
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="Suggestions indisponibles.")
    conv = await require_participant(body.conversation_id, user["id"])
    msgs = await db.messages.find({"conversation_id": body.conversation_id}, {"_id": 0}).to_list(1000)
    msgs.sort(key=lambda m: m.get("created_at") or "")
    recent = msgs[-10:]
    other_id = next((p for p in conv["participant_ids"] if p != user["id"]), None)
    other = await db.users.find_one({"id": other_id}, {"_id": 0}) if other_id else None
    other_name = (other or {}).get("first_name", "l'autre personne")
    is_host = conv.get("host_id") == user["id"]
    role_desc = "l'hôte du repas" if is_host else "un invité intéressé par le repas"
    transcript = ""
    for m in recent:
        if m.get("type") not in ("text", "booking_request", "booking_accepted"):
            continue
        who = "Toi" if m.get("sender_id") == user["id"] else other_name
        transcript += f"{who}: {m.get('body')}\n"
    system = (
        "Tu aides un utilisateur de l'app de repas partagés Buddiz à répondre dans une conversation. "
        f"L'utilisateur est {role_desc}. Propose exactement 3 réponses courtes (max 12 mots), naturelles, "
        "chaleureuses et en français, qu'il pourrait envoyer maintenant. "
        "Réponds UNIQUEMENT avec un tableau JSON de 3 chaînes, sans texte autour. Exemple : [\"Bonjour !\", \"Avec plaisir\", \"À quelle heure ?\"]"
    )
    prompt = f"Conversation avec {other_name} :\n{transcript}\nPropose 3 réponses pour Toi :"
    try:
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"suggest_{body.conversation_id}_{now_utc().timestamp()}",
                       system_message=system).with_model(AI_PROVIDER, AI_MODEL)
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning(f"AI suggestions error: {e}")
        raise HTTPException(status_code=503, detail="Suggestions momentanément indisponibles.")
    suggestions = []
    try:
        import json as _json, re as _re
        match = _re.search(r"\[.*\]", raw or "", _re.DOTALL)
        if match:
            suggestions = [str(s).strip() for s in _json.loads(match.group(0)) if str(s).strip()]
    except Exception:
        suggestions = []
    if not suggestions:
        suggestions = [line.strip("-•\"' \t") for line in (raw or "").splitlines() if line.strip()][:3]
    return {"suggestions": suggestions[:3]}


# --------------------------------------------------------------------------- #
# Startup: indexes + seed
# --------------------------------------------------------------------------- #
SEED_IMAGES = {
    "pates": "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "asiatique": "https://images.unsplash.com/photo-1512058564366-18510be2db19?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "pizza": "https://images.unsplash.com/photo-1513104890138-7c749659a591?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "raclette": "https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "brunch": "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "couscous": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
}
SEED_AVATARS = {
    "marie": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
    "david": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
    "sophie": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
}


async def seed_data():
    if not await db.app_config.find_one({"id": "global"}):
        await db.app_config.insert_one({
            "id": "global",
            "service_fee_percent": SERVICE_FEE_PERCENT,
            "cancellation_policy": DEFAULT_CANCELLATION_POLICY,
            "currency": "EUR",
            "locale": "fr-FR",
            "timezone": "Europe/Paris",
        })

    if await db.meals.count_documents({"is_seed": True}) > 0:
        return

    def seed_user(uid, first, last, email, city, avatar, rating, count, hosted, guests):
        return {
            "id": uid, "first_name": first, "last_name": last, "email": email,
            "password_hash": hash_password("buddiz123"), "city": city, "phone": "+33600000000",
            "avatar_url": avatar, "email_verified": True, "phone_verified": True,
            "identity_verification_status": "verified", "rating_avg": rating, "rating_count": count,
            "meals_hosted_count": hosted, "guests_welcomed_count": guests, "auth_provider": "email",
            "is_seed": True, "created_at": "2023-05-01T10:00:00+00:00", "updated_at": iso(now_utc()),
        }

    marie = seed_user("user_seed_marie", "Marie", "Dupont", "marie@buddiz.demo", "Paris", SEED_AVATARS["marie"], 4.8, 24, 12, 38)
    david = seed_user("user_seed_david", "David", "Martin", "david@buddiz.demo", "Lyon", SEED_AVATARS["david"], 4.6, 15, 8, 26)
    sophie = seed_user("user_seed_sophie", "Sophie", "Bernard", "sophie@buddiz.demo", "Marseille", SEED_AVATARS["sophie"], 4.9, 31, 20, 64)
    for u in (marie, david, sophie):
        if not await db.users.find_one({"email": u["email"]}):
            await db.users.insert_one(u)

    def dt(days, hour, minute=0):
        # Build the time as Europe/Paris local, store as UTC ISO so it renders
        # back as the intended local time (e.g. 19h55).
        from zoneinfo import ZoneInfo
        paris = ZoneInfo("Europe/Paris")
        base = (datetime.now(paris) + timedelta(days=days)).replace(
            hour=hour, minute=minute, second=0, microsecond=0
        )
        return iso(base.astimezone(timezone.utc))

    meals = [
        {
            "id": "meal_seed_pates", "host_id": marie["id"], "title": "Soirée Pâtes Maison",
            "description": "Viens partager une soirée conviviale autour de pâtes fraîches faites maison, "
                           "accompagnées d'un bon verre de vin. Ambiance détendue et chaleureuse dans mon "
                           "appartement parisien. Parfait pour rencontrer de nouvelles personnes !",
            "image": SEED_IMAGES["pates"], "price_cents": 500, "max_guests": 4, "city": "Paris",
            "exact_address": "12 rue des Martyrs, 75009 Paris", "latitude": 48.8788, "longitude": 2.3387,
            "starts_at": dt(1, 19, 55), "status": MEAL_PUBLISHED,
            "dietary_tags": ["Végétarien"], "cuisine_tags": ["Italien"], "interest_tags": ["Musique", "Cinéma"],
            "features": ["Option végé", "Sans cacahuète", "Vin inclus"], "special_notes": "Apportez votre bonne humeur !",
        },
        {
            "id": "meal_seed_asiat", "host_id": david["id"], "title": "Dîner Fusion Asiatique",
            "description": "Un voyage culinaire à travers l'Asie : bao, gyozas et curry thaï préparés avec passion. "
                           "Grande tablée conviviale à Lyon pour les amateurs de cuisine asiatique.",
            "image": SEED_IMAGES["asiatique"], "price_cents": 3000, "max_guests": 6, "city": "Lyon",
            "exact_address": "8 quai Saint-Antoine, 69002 Lyon", "latitude": 45.7640, "longitude": 4.8290,
            "starts_at": dt(2, 20, 0), "status": MEAL_PUBLISHED,
            "dietary_tags": ["Sans porc"], "cuisine_tags": ["Asiatique"], "interest_tags": ["Sport", "Jeux vidéo"],
            "features": ["Épicé", "Options sans porc"], "special_notes": None,
        },
        {
            "id": "meal_seed_pizza", "host_id": sophie["id"], "title": "Atelier Fabrication Pizza",
            "description": "Mettez la main à la pâte ! Atelier où l'on prépare ensemble nos pizzas avant de les "
                           "déguster autour d'une grande table ensoleillée à Marseille. Farine, tomates et fous rires garantis.",
            "image": SEED_IMAGES["pizza"], "price_cents": 2000, "max_guests": 8, "city": "Marseille",
            "exact_address": "24 rue Sainte, 13001 Marseille", "latitude": 43.2930, "longitude": 5.3720,
            "starts_at": dt(3, 19, 30), "status": MEAL_PUBLISHED,
            "dietary_tags": ["Végétarien"], "cuisine_tags": ["Italien"], "interest_tags": ["Musique", "Études"],
            "features": ["Atelier participatif", "Végétarien friendly"], "special_notes": None,
        },
        {
            "id": "meal_seed_raclette", "host_id": marie["id"], "title": "Raclette entre amis",
            "description": "La raclette conviviale par excellence ! Fromage fondant, charcuterie et pommes de terre. "
                           "Une soirée cocooning idéale pour discuter et se réchauffer.",
            "image": SEED_IMAGES["raclette"], "price_cents": 1500, "max_guests": 6, "city": "Paris",
            "exact_address": "5 rue Oberkampf, 75011 Paris", "latitude": 48.8650, "longitude": 2.3720,
            "starts_at": dt(4, 20, 30), "status": MEAL_PUBLISHED,
            "dietary_tags": [], "cuisine_tags": ["Français"], "interest_tags": ["Cinéma"],
            "features": ["Boissons incluses"], "special_notes": None,
        },
        {
            "id": "meal_seed_couscous", "host_id": david["id"], "title": "Couscous Royal du Dimanche",
            "description": "Un couscous royal généreux préparé selon la recette familiale. Semoule légère, "
                           "légumes mijotés et viandes savoureuses. Halal.",
            "image": SEED_IMAGES["couscous"], "price_cents": 1800, "max_guests": 8, "city": "Lyon",
            "exact_address": "17 rue de la République, 69001 Lyon", "latitude": 45.7670, "longitude": 4.8360,
            "starts_at": dt(5, 12, 30), "status": MEAL_PUBLISHED,
            "dietary_tags": ["Halal"], "cuisine_tags": ["Africain"], "interest_tags": ["Musique"],
            "features": ["Halal", "Fait maison"], "special_notes": None,
        },
        {
            "id": "meal_seed_brunch", "host_id": sophie["id"], "title": "Brunch Végan Ensoleillé",
            "description": "Brunch 100% végan et coloré : pancakes, bowls et jus frais. Sur la terrasse, "
                           "au soleil marseillais. Parfait pour bien commencer la journée.",
            "image": SEED_IMAGES["brunch"], "price_cents": 1200, "max_guests": 4, "city": "Marseille",
            "exact_address": "3 place aux Huiles, 13001 Marseille", "latitude": 43.2940, "longitude": 5.3710,
            "starts_at": dt(6, 11, 0), "status": MEAL_PUBLISHED,
            "dietary_tags": ["Végan", "Sans gluten"], "cuisine_tags": ["Dessert"], "interest_tags": ["Sport", "Études"],
            "features": ["100% végan", "Sans gluten"], "special_notes": None,
        },
    ]
    for m in meals:
        m.update({
            "service_fee_percent": SERVICE_FEE_PERCENT,
            "is_seed": True,
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        })
        if not await db.meals.find_one({"id": m["id"]}):
            await db.meals.insert_one(m)

    seed_bookings = [
        ("book_seed_1", "meal_seed_pates", david["id"], 1),
        ("book_seed_2", "meal_seed_pates", sophie["id"], 1),
    ]
    for bid, meal_id, guest_id, count in seed_bookings:
        if not await db.bookings.find_one({"id": bid}):
            meal = next(m for m in meals if m["id"] == meal_id)
            subtotal = meal["price_cents"] * count
            fee = round(subtotal * SERVICE_FEE_PERCENT / 100.0)
            await db.bookings.insert_one({
                "id": bid, "meal_id": meal_id, "guest_id": guest_id, "guest_count": count,
                "subtotal_cents": subtotal, "service_fee_cents": fee, "total_cents": subtotal + fee,
                "state": BOOKING_CONFIRMED, "payment_reference": None, "cancellation_reason": None,
                "is_seed": True, "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
            })
    # A PAST completed meal so reviews are demoable: Marie hosted, David attended.
    past_meal = {
        "id": "meal_seed_past", "host_id": marie["id"], "title": "Brunch dominical (passé)",
        "description": "Un brunch convivial qui a déjà eu lieu — sert de démonstration pour les avis.",
        "image": SEED_IMAGES["brunch"], "price_cents": 1000, "service_fee_percent": SERVICE_FEE_PERCENT,
        "max_guests": 4, "city": "Paris", "exact_address": "10 rue Cler, 75007 Paris",
        "latitude": 48.8560, "longitude": 2.3050,
        "starts_at": iso(now_utc() - timedelta(days=2)), "status": MEAL_COMPLETED,
        "dietary_tags": ["Végétarien"], "cuisine_tags": ["Français"], "interest_tags": ["Musique"],
        "features": ["Café à volonté"], "special_notes": None, "is_seed": True,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    if not await db.meals.find_one({"id": past_meal["id"]}):
        await db.meals.insert_one(past_meal)
    if not await db.bookings.find_one({"id": "book_seed_past"}):
        sub = past_meal["price_cents"]
        fee = round(sub * SERVICE_FEE_PERCENT / 100.0)
        conv = await ensure_conversation(david["id"], marie["id"], past_meal["id"])
        await db.bookings.insert_one({
            "id": "book_seed_past", "meal_id": past_meal["id"], "guest_id": david["id"], "guest_count": 1,
            "subtotal_cents": sub, "service_fee_cents": fee, "total_cents": sub + fee,
            "state": BOOKING_COMPLETED, "payment_status": "succeeded", "payment_reference": None,
            "stripe_payment_intent_id": None, "conversation_id": conv["id"],
            "cancellation_reason": None, "is_seed": True,
            "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
        })

    logger.info("Seed data inserted.")


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.meals.create_index("id", unique=True)
        await db.meals.create_index("host_id")
        await db.meals.create_index("status")
        await db.bookings.create_index("meal_id")
        await db.bookings.create_index("guest_id")
    except Exception as e:
        logger.warning(f"Index creation: {e}")
    try:
        if EMERGENT_KEY:
            await run_in_threadpool(_init_storage)
    except Exception as e:
        logger.warning(f"Storage init failed (non-fatal): {e}")
    try:
        await seed_data()
    except Exception as e:
        logger.error(f"Seed failed: {e}")


@app.get("/api/")
async def root():
    return {"service": "buddiz", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
