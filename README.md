# Buddiz

Buddiz est une marketplace de repas partagés qui met en relation des hôtes et des invités autour d’une expérience conviviale. L’application n’est ni un service de livraison, ni une plateforme de réservation de restaurant, ni une application de rencontre.

## Fonctionnalités

- inscription, connexion et gestion du profil ;
- découverte de repas avec recherche et filtres ;
- publication et gestion d’annonces par les hôtes ;
- demandes de réservation, messagerie et notifications ;
- paiement Stripe, remboursements et versements aux hôtes ;
- révélation de l’adresse exacte après confirmation ;
- avis après le repas et historique des revenus.

## Architecture

```text
YAEL/
├── backend/       API FastAPI, MongoDB, authentification et paiements
├── frontend/      Application Expo Router / React Native / TypeScript
├── backend/tests/ Tests pytest de l’API
└── memory/        Documentation produit et notes d’architecture
```

### Stack

- Frontend : Expo, React Native, Expo Router, TypeScript et TanStack Query
- Backend : FastAPI, Python, MongoDB/Motor et JWT
- Paiements : Stripe et Stripe Connect
- Stockage d’images : stockage objet compatible avec l’environnement de déploiement

## Prérequis

- Python 3 et `pip`
- Node.js et Yarn ou npm
- une instance MongoDB accessible
- un compte Stripe pour activer les paiements réels (facultatif en mode test)

## Installation

### Backend

Depuis la racine du projet :

```bash
python -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\Activate.ps1      # Windows PowerShell
pip install -r backend/requirements.txt
```

Créer ensuite `backend/.env` localement. Ce fichier est ignoré par Git :

```dotenv
MONGO_URL=mongodb://localhost:27017
DB_NAME=buddiz
JWT_SECRET=change-me-in-local-development
SERVICE_FEE_PERCENT=10

# Facultatif : activer Stripe et Stripe Connect
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

Lancer l’API :

```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

L’API est disponible sur `http://localhost:8000` et ses routes sont préfixées par `/api`. Le point de contrôle de base est `GET /api/`.

### Frontend

Créer `frontend/.env` localement :

```dotenv
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

`/api` est ajouté automatiquement par le client frontend. Sur un téléphone physique, remplacer `localhost` par l’adresse IP LAN de la machine qui exécute l’API.

Installer et démarrer Expo :

```bash
cd frontend
yarn install
yarn start
```

Commandes utiles :

```bash
yarn web
yarn android
yarn ios
```

## Tests

```bash
cd backend
pytest
```

Les tests backend se trouvent dans `backend/tests/`. Les parcours frontend sont accessibles via Expo sur web, Android ou iOS.

## Paiements Stripe

Sans clés Stripe, l’application peut fonctionner en mode de confirmation de paiement de test. Pour activer Stripe Checkout et Stripe Connect, renseigner les clés de test dans `backend/.env`, configurer le webhook Stripe et activer Connect Express dans le tableau de bord Stripe.

Ne jamais committer de clés Stripe, de secrets JWT, d’identifiants MongoDB ou de fichiers `.env`.

## Développement

Les routes Expo sont définies dans `frontend/app/`, les composants partagés dans `frontend/src/components/` et le client API dans `frontend/src/api/client.ts`. Le serveur FastAPI est regroupé dans `backend/server.py`.
