<img width="1280" height="320" alt="MASSIV CART AI = Realtime price intelligence for almost anything near you" src="https://github.com/user-attachments/assets/19383b63-9c9a-44eb-a9a8-cbfc17d5ccb8" />


<p align="center">
  <strong>Realtime price intelligence for almost anything near you.</strong><br/>
  Find the cheapest deal → upload a receipt to earn Scout Points → let AI do the shopping math.
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/-Quick_Start-00d26a?style=for-the-badge" alt="Quick Start" /></a>&nbsp;
  <a href="#architecture"><img src="https://img.shields.io/badge/-Architecture-00d26a?style=for-the-badge" alt="Architecture" /></a>&nbsp;
  <a href="#api-reference"><img src="https://img.shields.io/badge/-API_Docs-00d26a?style=for-the-badge" alt="API Docs" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22-brightgreen?logo=nodedotjs" alt="Node.js 22" />
  <img src="https://img.shields.io/badge/Express-5.x-black?logo=express" alt="Express 5" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-Postgres_|_Auth-3ecf8e?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Upstash_Redis-Serverless_Cache-00E9A3?logo=redis&logoColor=white" alt="Upstash Redis" />
  <img src="https://img.shields.io/badge/Claude-Sonnet_4.6_|_Vision-d4a574?logo=anthropic&logoColor=white" alt="Claude AI" />
  <img src="https://img.shields.io/badge/GCP-Cloud_Run-4285F4?logo=googlecloud&logoColor=white" alt="GCP Cloud Run" />
  <img src="https://img.shields.io/badge/Docker-node%3A22--alpine-2496ED?logo=docker&logoColor=white" alt="Docker" />
</p>

---
<img width="1720" height="1307" alt="image" src="https://github.com/user-attachments/assets/8a0a89e9-f073-4e4a-86c2-293d3477a257" />

## The Problem

Grocery prices in Jamaica change weekly — sometimes daily — and there is no single source of truth. Shoppers waste time visiting multiple stores or overpay because they cannot compare prices in realtime.

## The Solution

**Massiv Cart AI** solves this with three AI-powered moments:

| # | Feature | What it does |
|---|---------|-------------|
| 1 | **Natural-language search** | "cheapest cooking oil near me" → ranked price list across local stores |
| 2 | **Receipt OCR** | Photo of a receipt → AI extracts items + prices → stored in DB, 100 Scout Points awarded |
| 3 | **Synthetic data seeder** | AI generates realistic store prices for demo/testing via standalone script |

The more people contribute, the smarter the platform gets — a true **crowdsourced price network**.

---

## Architecture

```
Browser / MassivCartUI (Next.js 16)
  │
  ├── POST /api/command      ← NLP command (Claude Sonnet 4.6)
  ├── POST /api/search       ← direct term search
  ├── GET  /api/dashboard    ← user stats (points, tier, streak)
  ├── GET  /api/dashboard/prices         ← global price summary
  ├── GET  /api/dashboard/stores         ← store listing
  ├── GET  /api/dashboard/stores/:id/prices ← per-store prices
  ├── POST /api/receipt      ← Claude Vision OCR (multipart upload)
  ├── POST /api/receipt/confirm ← persist receipt + award 100 pts
  ├── GET  /products         ← raw Supabase product list
  └── GET  /health           ← liveness probe

Express 5 (this repo — port 8000 / 8080 on Cloud Run)
  ├── lib/cache.ts           ← Upstash Redis (serverless REST)
  ├── services/              ← business logic (search, dashboard, receipt)
  ├── ocr/claude-ocr.ts      ← ClaudeVisionOCRProvider
  ├── llm/providers.ts       ← Claude text provider (direct API)
  └── db/                    ← Supabase clients + data-access helpers

Upstash Redis (managed, REST API)
  └── shared cache — search TTL 2 min, dashboard TTL 5 min, user TTL 5 min

Supabase PostgreSQL
  └── source of truth — stores, products, prices, users, receipts
```

| Layer | Technology | Purpose |
|---|---|---|
| **API** | Express 5 + TypeScript | Route handlers, middleware, Zod validation |
| **AI/NLP** | Claude Sonnet 4.6 (Anthropic) | Natural-language command parsing |
| **AI/Vision** | Claude Vision (Anthropic) | Receipt OCR + structured data extraction |
| **Database** | Supabase (Postgres + Auth) | Product catalog, user auth, receipts, stores |
| **Caching** | Upstash Redis (serverless REST) | Sub-50ms reads, 2–10 min TTLs per route |
| **Frontend** | [MassivCartUI](https://github.com/HughScott2002/MassivCartUI) (Next.js 16) | Map-first UI — see separate repo |
| **Infrastructure** | GCP Cloud Run + Docker (node:22-alpine) | Serverless containers, auto-scaling, zero ops |

---

## Quick Start

### Prerequisites

- Node.js 22+
- [Supabase](https://supabase.com) project with `stores`, `products`, `prices`, `users`, and `receipts` tables
- [Upstash Redis](https://upstash.com) database (REST API)
- [Anthropic API key](https://console.anthropic.com) (required for `/api/command` and `/api/receipt`)

### 1. Clone & configure

```bash
git clone https://github.com/HughScott2002/MassivCartAPI.git
cd MassivCartAPI
```

Copy `.example.env` to `.env` and fill in all values:

```env
# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # optional — enables admin writes

# Upstash Redis (serverless REST)
UPSTASH_REDIS_REST_URL=https://<db>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>

# Anthropic — required for /api/command and /api/receipt
ANTHROPIC_API_KEY=<api-key>
ANTHROPIC_MODEL=claude-sonnet-4-6              # optional — this is the default

# Server
PORT=8000                                       # optional — defaults to 8000
FRONTEND_URL=http://localhost:3000             # CORS allow-origin
```

> The server validates the four required variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) at startup via Zod and throws immediately if any are missing.

### 2. Install & run

```bash
npm install
npm run dev        # hot-reload via tsx watch
```

The API is available at `http://localhost:8000`.

### Run with Docker

```bash
docker compose up --build
```

The container maps to `http://localhost:3000` by default (override with `PORT=` in `.env`).

### 3. Verify

```bash
bash scripts/test-endpoints.sh
```

Results are written to `test-results/endpoint-test-results.txt`. Override defaults if needed:

```bash
TEST_BASE_URL=http://localhost:4000 \
TEST_OUTPUT_FILE=test-results/local.txt \
bash scripts/test-endpoints.sh
```

---

## API Reference

All routes return JSON. Error responses follow `{ ok: false, error: string }` (or `{ error: string }` on dashboard routes). Rate-limited routes allow **10 requests per minute** per user ID / IP.

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/health` | — | — | Liveness probe → `{ ok: true }` |
| `GET` | `/products` | — | — | Raw product list from Supabase |
| `POST` | `/api/search` | — | — | Term-based price search |
| `POST` | `/api/command` | — | 10/min | NLP command → Claude → search |
| `GET` | `/api/dashboard` | — | — | User stats (points, tier, streak) |
| `GET` | `/api/dashboard/prices` | — | — | Global price summary |
| `GET` | `/api/dashboard/stores` | — | — | Store listing |
| `GET` | `/api/dashboard/stores/:storeId/prices` | — | — | Per-store product prices |
| `POST` | `/api/receipt` | — | 10/min | Claude Vision OCR (multipart `image` field) |
| `POST` | `/api/receipt/confirm` | — | — | Persist reviewed receipt + award 100 pts |

### `GET /products`

| Query Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer 1–100 | `25` | Max rows returned |
| `category` | string | — | Filter by product category |

### `POST /api/search`

```json
{
  "terms": ["rice", "cooking oil"],
  "savingsMode": 2,
  "userLat": 17.9784,
  "userLng": -76.7827
}
```

`savingsMode` controls search radius:

| Value | Radius | Max Stores |
|---|---|---|
| `0` | 3 km | 1 |
| `1` | 8 km | 2 |
| `2` (default) | 15 km | 3 |
| `3` | 40 km | 5 |

### `POST /api/command`

```json
{
  "message": "cheapest cooking oil near me",
  "intent": "find",
  "budget": "5000",
  "userId": "<supabase-user-id>",
  "savingsMode": 2,
  "userLat": 17.9784,
  "userLng": -76.7827
}
```

Returns the Claude `CommandAction` merged with search `results[]`.

### `GET /api/dashboard`

| Query Param | Required | Description |
|---|---|---|
| `userId` | yes | Supabase user UUID |

### `GET /api/dashboard/stores/:storeId/prices`

| Query Param | Required | Description |
|---|---|---|
| `name` | no | Optional store name hint |

### `POST /api/receipt`

`Content-Type: multipart/form-data` — upload the image in a field named `image` (JPEG, PNG, WebP, or GIF, max 5 MB). Rejects with `422` if the image is not a recognizable receipt, prescription, gas price board, or shopping list.

### `POST /api/receipt/confirm`

```json
{
  "receiptData": { /* ReceiptData object from /api/receipt */ },
  "userId": "<supabase-user-id>",
  "category": "receipt",
  "storeAddress": "123 Main St, Kingston"
}
```

Valid `category` values: `receipt` | `prescription` | `gas_price` | `shopping_list`. Returns `{ receiptId, pointsAwarded: 100 }`.

---

## Caching

All caching uses [Upstash Redis](https://upstash.com) via the `@upstash/redis` REST client. If `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` are absent, the API runs without caching — no crash, no errors.

| Cache Key Pattern | TTL | Invalidated By |
|---|---|---|
| `products:<limit>:<category>` | 5 min | — |
| `search:<terms>:<mode>:<lat>:<lng>` | 2 min | auto-expiry |
| `nlp-command:<intent>:<query>:<budget>` | 30 min | auto-expiry |
| `dashboard:user:<userId>` | 5 min | receipt confirm, budget update |
| `dashboard:prices` | 5 min | receipt confirm |
| `dashboard:stores` | 10 min | receipt confirm |
| `store:prices:<storeId>` | 5 min | receipt confirm |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot-reload (`tsx watch`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled server from `dist/` |
| `npm test` | Run unit tests (Node built-in test runner) |
| `npm run test:endpoints` | Run integration tests against a live server |

### GCP Cloud Run Deployment

The `Makefile` wraps the full release cycle:

```bash
make release       # build → push → deploy (requires gcloud auth)
make build         # docker build only
make push          # push both :sha and :latest tags
make deploy        # deploy sha-tagged image to Cloud Run
```

---

## Project Structure

```
MassivCartAPI/
├── data/
│   └── stores-cache.json         # Google Places store data (populated by places-sync)
├── scripts/
│   ├── places-sync.ts            # Sync Google Places → stores-cache.json
│   ├── seed-prices.sql           # Manual SQL price seeder
│   ├── seed-synthetic.ts         # Standalone AI synthetic price generator
│   └── test-endpoints.sh         # Integration test runner (curl-based)
├── src/
│   ├── api/                      # Express route handlers
│   │   ├── command.ts            #   POST /api/command — NLP via Claude
│   │   ├── dashboard.ts          #   GET  /api/dashboard + sub-routes
│   │   ├── receipt.ts            #   POST /api/receipt + /receipt/confirm
│   │   └── search.ts             #   GET  /products, POST /api/search
│   ├── config/
│   │   ├── constants.ts          #   Claude API URL, version, default model
│   │   └── env.ts                #   Zod env schema — throws on startup if invalid
│   ├── database/
│   │   ├── in-memory-db.ts       #   searchProducts() — synonym expansion + Haversine sort
│   │   └── schema.ts             #   TypeScript DB row types
│   ├── db/
│   │   ├── data-access.ts        #   Supabase query helpers (stores, products, prices)
│   │   ├── supabase-client.ts    #   Supabase anon + service-role clients
│   │   └── synthetic-store.ts    #   AI-driven price generation for seeder script
│   ├── lib/
│   │   └── cache.ts              #   Upstash Redis wrapper (get / set / delete / prefix scan)
│   ├── llm/
│   │   ├── prompts.ts            #   System prompts (command + receipt structuring)
│   │   ├── providers.ts          #   Claude text provider (direct fetch)
│   │   ├── registry.ts           #   Provider registry
│   │   └── types.ts              #   LLMMessage, LLMProvider interfaces
│   ├── middleware/
│   │   ├── admin-guard.ts        #   Admin secret header check
│   │   ├── auth.ts               #   Supabase JWT verification
│   │   ├── error-handler.ts      #   Global Express error handler
│   │   └── validate.ts           #   Zod request validation helper
│   ├── ocr/
│   │   ├── claude-ocr.ts         #   ClaudeVisionOCRProvider (base64 → ReceiptData)
│   │   ├── factory.ts            #   OCRFactory.getDefaultProvider()
│   │   ├── index.ts              #   OCR exports
│   │   └── types.ts              #   IOCRProvider, OCRUpload, SupportedMediaType
│   ├── processing/
│   │   ├── receipt-processor.ts  #   Persist receipt rows + award 100 pts
│   │   └── store-processor.ts    #   Store name matching helpers
│   ├── services/
│   │   ├── dashboard-service.ts  #   User stats, tier, streak business logic
│   │   ├── receipt-service.ts    #   Receipt validation + orchestration
│   │   └── search-service.ts     #   Search orchestration (cache → in-memory-db)
│   ├── types/
│   │   ├── api.types.ts          #   SearchRequestBody, SearchResult, etc.
│   │   ├── database.types.ts     #   Database row shapes
│   │   └── receipt.types.ts      #   ReceiptData, ReceiptItem
│   ├── utils/
│   │   ├── geo.ts                #   Haversine distance calculation
│   │   ├── hash.ts               #   MD5 hashing (duplicate receipt detection)
│   │   ├── json.ts               #   parseEmbeddedJson (strip markdown fences)
│   │   ├── logger.ts             #   Structured JSON logger
│   │   ├── normalize.ts          #   Query normalization (lowercase, trim)
│   │   └── validators.ts         #   Shared Zod helpers
│   ├── app.ts                    # Express app — middleware, routers, error handler
│   └── server.ts                 # Entry point — starts HTTP server, graceful shutdown
├── tests/                        # Node built-in test runner suites (*.test.ts)
├── .example.env                  # Environment variable template
├── docker-compose.yml            # Local development container
├── Dockerfile                    # Multi-stage build (node:22-alpine)
├── Makefile                      # GCP Cloud Run release targets
├── package.json
└── tsconfig.json
```

---

## Roadmap

- [ ] Multi-store receipt support (batch upload)
- [ ] Price trend analytics per product per parish
- [ ] WhatsApp bot interface (broader reach)
- [ ] Community leaderboard — top contributors
- [ ] Public API for third-party integrations

---

## Related Repos

| Repo | Description |
|---|---|
| **[MassivCartUI](https://github.com/HughScott2002/MassivCartUI)** | Next.js 16 frontend — map, command bar, receipt upload, budget tracker |
| **MassivCartAPI** (this repo) | Express 5 backend — Claude AI, receipt OCR, Upstash Redis, Supabase |

---

## Built With

**Massiv Cart AI** was built in 24 hours at the [Intellibus Hackathon](https://intellibus.com) (March 2026).

---

## License

This project is licensed under the **MIT No Commercial License (MIT-NC)** — free to view, study, and fork for personal and educational use. Commercial use is not permitted. See [LICENSE](LICENSE) for details.

© 2026 Massiv Cart
