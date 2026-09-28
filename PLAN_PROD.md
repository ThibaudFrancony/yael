# Buddiz — Plan prod exécutable par agent

> Déclencheur : l'utilisateur écrit `ok execute ce plan`.
> Alors : exécute toutes les sections marquées `[AUTO]`, pose les questions marquées `[HUMAIN]` via l'outil question, puis commit + push. Ne jamais deviner un secret ou un domaine.

## 1. Règles d'autonomie

### [AUTO] — agir seul, sans demander
- Lire/éditer code, créer `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `eas.json` template, `app.config.js`, `.env.example`, `GET /api/health`.
- Gater `seed_data()` par `ENV!=production` (`backend/server.py:1831`).
- Validation Pydantic : `Field(min/max_length, ge/le)` sur `MealCreate/MealUpdate/Booking/Message/Review/Feedback` (`backend/server.py:324-367,831-928`), `re.escape(city)` (`server.py:586`).
- Upload : `max_size`, vérif Pillow/magic-bytes, refuser SVG (`server.py:506-528`).
- Capacité atomique : transaction ou `findOneAndUpdate` (`server.py:985-1000,1073-1075`).
- Pagination `skip/limit` partout où `to_list(500/1000/2000)` (`server.py:607,634,910,953,1237,1516`) + index Mongo manquants.
- Batch `$in` pour N+1 `meal_public/host_earnings/host_reviews`.
- Auth sur `connect/refresh/{id}` + ownership (`server.py:1351-1354`), `try/except` Stripe (`server.py:1167-1330`).
- Nettoyer `requirements.txt` (sortir `boto3/pandas/numpy/google/black/flake8/mypy/litellm-URL`), message clair si env absent (`server.py:35,39`), lifespan au lieu de `on_event` (`server.py:1810,1852`).
- Frontend : valider `BASE` (`src/api/client.ts:5`), retirer `LogBox.ignoreAllLogs` (`app/_layout.tsx:19`), defaults `QueryClient` (`query-client.ts:7`), écrans `isError`, intercepteur 401, supprimer `any`/`@ts-nocheck` (`+html.tsx:1`), virer `react-native-dotenv`, `html lang=fr`, scripts `typecheck/lint/test`.
- Lancer `pytest`, `tsc --noEmit`, `eslint`, `expo-doctor`, corriger jusqu'au vert.
- Commit + push sur `main` vers `origin`. Ne jamais committer `.env`, clés, `diagnostic-buddiz.pdf` déjà poussé.

### [HUMAIN] — toujours demander via outil question, jamais deviner
1. Domaines prod : `API_URL`, `APP_PUBLIC_URL`, `EXPO_PUBLIC_BACKEND_URL` (bloque CORS `server.py:1843-1849`, Stripe success/cancel, Connect return/refresh).
2. Stripe : mode test/live, fee %, qui fournit `STRIPE_SECRET_KEY/PUBLISHABLE/WEBHOOK_SECRET` via vault.
3. Vault + rotation : choix Doppler/Infisical/GCP, GO pour révoquer `JWT_SECRET/STRIPE/LLM_KEY`.
4. Mongo : Atlas+PITR ou self-hosted, `DB_NAME`, RPO/RTO, purger seed démo ?
5. Mobile : nouveau `bundleId/package` (remplace `com.emergent.localfeast...` `app.json:12,24`), `EAS projectId`, Apple Dev/Play, activer Apple Sign-In ?
6. Légal/RGPD : DPO, textes CGU/CGV/Confidentialité, rétention, `DELETE /users/me` + export, modération.
7. Providers : garder Google Emergent (`oauth.ts:11`) ou vrai OAuth, storage Emergent ou S3/R2.
8. Temps réel : garder polling ou websocket/Expo Push/Resend.
9. Monitoring : créer Sentry (DSN ?), logs JSON, alertes.

Si une réponse manque : implémente avec valeur dummy `CHANGE-ME` + `TODO(HUMAIN: ...)` et continue le reste.

## 2. Exécution pas à pas

### Phase 0 — sécu immédiate [AUTO]
- [ ] Vérifier `git ls-files | grep -i env` : aucun `.env` tracké. Sinon stop + demander.
- [ ] Créer `backend/.env.example`, `frontend/.env.example`.
- [ ] `JWT_TTL` défaut 7j (config, pas 30j en dur).

### Phase 1 — backend sécu/validation [AUTO]
- [ ] Fichiers : `backend/server.py:35-39,41,124-130,240-278,324-367,474-479,486-541,574-647,649-928,952-1133,1400-1530`.
- [ ] Critères : `pytest backend/tests/` vert, pas de `to_list` sans limit, `re.escape` présent.

### Phase 2 — paiements/connect [AUTO, sauf secrets=HUMAIN]
- [ ] Fichiers : `backend/server.py:1136-1400`.
- [ ] Idempotence `verify/confirm-test`, `refund_cents` persisté, webhook `construct_event` câblé mais inactif sans `whsec` (demander §1.2).

### Phase 3 — frontend [AUTO]
- [ ] Fichiers : `src/api/client.ts:5,32,43-67`, `oauth.ts:11`, `app/_layout.tsx:19`, `AuthContext.tsx`, `query-client.ts:7`, `payment/[bookingId].tsx:60-71`, `storage/index.web.ts:49`.
- [ ] Critères : `tsc --noEmit` + `eslint` verts, 0 `catch{}` muet, deep-link paiement.

### Phase 4 — déployabilité [AUTO template + HUMAIN valeurs]
- [ ] Créer `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `eas.json`, `app.config.js`.
- [ ] Demander §1.1/1.4/1.5 avant de remplir les vraies URLs/IDs.

### Phase 5 — observabilité/backup [AUTO code + HUMAIN DSN/infra]
- [ ] `GET /api/health` (ping DB), logs JSON, `sentry-sdk` câblé derrière `SENTRY_DSN` vide par défaut.

### Phase 6 — vérification [AUTO]
- [ ] `pytest`, `tsc`, `eslint`, `expo-doctor` verts. Résumer fichiers changés + risques restants.

### Phase 7 — push [AUTO]
- [ ] `git add -A`, `git commit -m "feat(prod): <lot>"`, `git push origin main`. Si push rejeté : `git pull --rebase` puis repush une fois, sinon demander.

## 3. Garde-fous
- Ne jamais afficher ni committer un secret. Ne jamais inventer domaine/clef/bundle ID.
- Une question = une décision §1. Options courtes, défaut marqué `(Recommandé)`.
- Après chaque phase : 3 lignes max (fait / reste / question bloquante).
