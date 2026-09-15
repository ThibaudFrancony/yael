# BUDDIZ — Product Requirements & Build Log
## Original Problem Statement
Build BUDDIZ, a production social dining marketplace mobile app. Concept: meet people around a shared meal (not delivery, not restaurant booking, not dating). Market: France — French UI, EUR, fr-FR, Europe/Paris, 24h time. One account acts as both guest and host. Full-stack, persistent, with auth, meals, messaging, bookings, Stripe payments, address-privacy, notifications, reviews. Delivered incrementally across 5 phases.

## Architecture
- **Frontend**: Expo Router (React Native, TypeScript), @tanstack/react-query, react-native-keyboard-controller, expo-image, expo-linear-gradient, @react-native-vector-icons/feather (Feather icons), Inter fonts (expo-font). Theme tokens in `src/theme.ts` (Buddiz palette: bg #F9FAFB, text #101828, dark-purple CTA #1D003B, orange accent #F54900).
- **Backend**: FastAPI + MongoDB (motor). All routes `/api`. JWT (bcrypt) for email/password + Emergent Google session tokens (`/api/auth/session`). Emergent Object Storage for image uploads. Amounts stored in integer cents. Service fee configurable (default 10%).
- **Auth gate**: root-layout redirect pattern; token in expo-secure-store, session survives refresh.

## Data Model (MongoDB, string uuid ids, `_id` excluded)
- `users` (guest+host in one): id, first/last name, email, password_hash, city, phone, avatar_url, email_verified, phone_verified, identity_verification_status (not_started/pending/verified/rejected), rating_avg, rating_count, meals_hosted_count, guests_welcomed_count, auth_provider, is_seed, timestamps.
- `user_sessions`: session_token, user_id, expires_at (TTL) — Google flow.
- `meals`: id, host_id, title, description, image, price_cents, service_fee_percent, max_guests, city, exact_address, latitude/longitude, starts_at, status (draft/published/full/completed/cancelled/removed), dietary_tags, cuisine_tags, interest_tags, features, special_notes, is_seed, timestamps.
- `bookings`: id, meal_id, guest_id, guest_count, subtotal_cents, service_fee_cents, total_cents, state (REQUESTED→ACCEPTED_PENDING_PAYMENT→CONFIRMED→COMPLETED + DECLINED/CANCELLED_*/PAYMENT_FAILED/REFUND_*), payment_reference, cancellation_reason, timestamps. (State machine + capacity rule live in backend; consumed by Phases 3-5.)
- `uploads`, `app_config`. (Reserved for later: conversations, messages, payments, refunds, reviews, notifications, app_feedback.)

## Security / Privacy (enforced server-side)
- Exact meal address returned ONLY to the host or a guest with a CONFIRMED/COMPLETED booking. Otherwise `address_visible=false`, `exact_address=null`; UI shows "Adresse communiquée après confirmation de la réservation." Approximate lat/lng (rounded) always available.
- Private profile fields (email/phone) only via `/auth/me`; public host view is sanitized.
- Capacity computed from CONFIRMED/COMPLETED bookings (prevents overbooking).

## Routes (frontend)
`/(auth)/welcome`, `/(auth)/login`, `/(auth)/register`, `/(tabs)` [index=Découvrir, add, messages, profile], `/meal/[id]`, `/filters` (modal), `/edit-profile`.

## Implemented — Phase 1 (2026-09-15) ✅
- Email/password auth (register/login/me/logout) + Google architecture (`/api/auth/session`) + Apple button (native-build only).
- Onboarding welcome screen, profile foundation + edit (avatar upload to Object Storage).
- Bottom nav (Recherche/Ajouter/Messages/Profil), all reachable.
- Discovery feed "Découvrir": real DB meals, live search (title/cuisine/city/host), Filters modal (distance, categories, interests, quick filters) that actually filters the query.
- Meal detail with hero + host trust + address-privacy block + tags.
- Profile: hosting stats from DB, verification states, my listings, settings, logout.
- Seed data: Marie/David/Sophie + 6 meals (incl. Soirée Pâtes Maison 5€ with 2 confirmed bookings → "2 places disponibles"), French times (19h55).
- Config endpoint (service fee 10%, cancellation policy). UX states (loading skeletons, empty, error) everywhere.
- **Tested**: 23/23 backend pytest pass; all critical frontend flows pass (login, refresh-persist, search, filters, detail privacy, nav, profile edit, register, logout).

## Implemented — Phases 2-5 (2026-09-15) ✅
- **Phase 2 — Publier / gérer un repas**: `Ajouter` tab full publish form (photo upload → Object Storage, price €→cents, max guests, address, city, date+heure interpreted as Europe/Paris, description, dietary/cuisine/interest chips, validation). Host management: edit (`PUT /meals/{id}`), withdraw (`/meals/{id}/withdraw` → status removed, cancels active bookings, notifies + refunds guests), reservations view (`/meals/{id}/reservations`). "Mes annonces" → "Gérer l'annonce".
- **Phase 3 — Messagerie + réservation**: conversations + messages (participants-only authz), Messages tab list w/ unread, conversation screen (text bubbles orange/white, system + booking cards), poll-based updates. Booking via "Demander une place" → REQUESTED → host Accepter/Refuser → system card "Réservation acceptée" + "Procéder au paiement" CTA. State machine: REQUESTED→ACCEPTED_PENDING_PAYMENT→CONFIRMED→COMPLETED (+ DECLINED/CANCELLED_*). Overbooking prevented; capacity consumed only on CONFIRMED.
- **Phase 4 — Paiement + révélation adresse**: Stripe architected (Checkout Session + webhook `/api/stripe/webhook`, idempotent, cents, EUR, refunds). No keys yet → `payments_test_mode=true` and `/api/payments/confirm-test` does server-side confirm. Payment screen (order summary, service fee 10%, guest count +/- via `/bookings/{id}/guest-count`, cancellation policy, secure note). On CONFIRMED → success screen "Réservation confirmée 🎉" reveals exact address + next steps + CTAs; guest+host notified.
- **Phase 5 — Notifications / avis / annulation**: in-app notifications center (bell + unread badge + "Tout marquer comme lu", events wired). Reviews after COMPLETED meal (overall + Hospitalité/Nourriture/Conversation/Ambiance + comment), dedupe (409), eligibility enforced, host `rating_avg`/`rating_count` recomputed. Guest cancellation (reason selector, refund per policy ≥24h=100%/<24h=50%, restores capacity, notifies host). App feedback screen (`/feedback`).
- **Tested**: 15/15 new backend pytest + 23/23 regression pass; 7 mobile flows validated at 390×844 (publish, message→book→accept, payment→confirm→address reveal, review, notifications, profile bookings, host edit/withdraw).

## Implemented — Stripe Connect marketplace (2026-09-15) ✅
- Split payments (destination charge): guest pays total; `application_fee_amount` = 10% Buddiz fee kept on platform, remainder transferred to the host's connected Express account → host's bank.
- Host onboarding: `POST /api/connect/account` (creates Express account + Account Link), `GET /api/connect/status` (charges_enabled/payouts_enabled/ready), `/api/connect/return|refresh/{id}`; app screen `connect-return.tsx`; profile "Versements (hôte)" section with "Configurer mes versements".
- Checkout blocked unless host `charges_enabled && payouts_enabled`. Refunds use `reverse_transfer=True` + `refund_application_fee=True` (guest cancel + host withdraw).
- Webhook handles `account.updated` (+ payment events). No webhook secret yet → payment confirmed via server-side `/payments/verify`.
- **BLOCKER (user action)**: Connect must be enabled in the Stripe Dashboard (Test): Connect → Get started → Express + branding + countries. Until then `Account.create` returns "sign up for Connect".

## Implemented — Payout history (2026-09-15) ✅
- `GET /api/host/earnings` (net earnings, Buddiz fees, gross, refunds, per-booking breakdown) + `GET /api/connect/dashboard` (Stripe Express login link). Screen `app/earnings.tsx` (hero net, mini cards, refund note, per-meal list Reversé/Remboursé) linked from profile "Historique des versements".

## Fixed — Connect onboarding button (2026-09-15) ✅
- User enabled Connect (Express) on their Stripe TEST account → `POST /api/connect/account` now creates/reuses `acct_...` + returns hosted onboarding URL (no more "sign up for Connect"). Added `onboarding_complete` to status. Profile shows pill "Versements configurés" / "Versements à configurer". Hosted onboarding via external browser (embedded not usable in RN). Verified by testing_agent: 9/9 + 23/23 regression pass.

## To activate real Stripe (user action)
Add `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` to `/app/backend/.env` (test keys from dashboard.stripe.com). App auto-switches from test mode to real Stripe Checkout (opens hosted page in browser / redirect on web); webhook confirms bookings. Native in-app PaymentSheet would require a dev build.

## Backlog / Remaining
- **P2**: Apple Sign-In activation (native build + Apple Developer), real identity verification provider, maps/geo distance filtering, confirmation emails (Emergent Resend), realtime (websockets) instead of polling.
- **LOW**: migrate web `shadow*`→`boxShadow`, move `pointerEvents` into style; optionally split server.py into per-domain routers.

## Notes
- Deprecation warnings on web (`shadow*`, `pointerEvents`, `useNativeDriver`) are cosmetic RN-web logs; harmless on native.
- Test credentials in `/app/memory/test_credentials.md`. Seed `book_seed_past` = COMPLETED booking (guest david) for review testing.
