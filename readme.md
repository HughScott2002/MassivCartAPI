<img width="1280" height="640" alt="MASSIV CART AI — Crowdsourced Grocery Price Intelligence for Jamaica" src="https://github.com/user-attachments/assets/e22ddae2-8e3a-4766-8a0c-6e6ba21ecd5a" />

<p align="center">
  <strong>Crowdsourced grocery price intelligence for Jamaica.</strong><br/>
  Snap a receipt → AI extracts every line item → real-time price map for the entire island.
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/-Quick_Start-00d26a?style=for-the-badge" alt="Quick Start" /></a>&nbsp;
  <a href="#architecture"><img src="https://img.shields.io/badge/-Architecture-00d26a?style=for-the-badge" alt="Architecture" /></a>&nbsp;
  <a href="#api-reference"><img src="https://img.shields.io/badge/-API_Docs-00d26a?style=for-the-badge" alt="API Docs" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" alt="Next.js 14" />
  <img src="https://img.shields.io/badge/Supabase-Postgres_|_Auth_|_Realtime-3ecf8e?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Kafka-Event_Streaming-231F20?logo=apachekafka&logoColor=white" alt="Kafka" />
  <img src="https://img.shields.io/badge/Redis-Caching-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/GCP-Cloud_Run-4285F4?logo=googlecloud&logoColor=white" alt="GCP Cloud Run" />
  <img src="https://img.shields.io/badge/Claude_Vision-Receipt_OCR-d4a574?logo=anthropic&logoColor=white" alt="Claude Vision" />
  <img src="https://img.shields.io/badge/Telegram-Bot_Interface-26A5E4?logo=telegram&logoColor=white" alt="Telegram Bot" />
  <img src="https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker&logoColor=white" alt="Docker" />
</p>

---

## The Problem

Jamaican consumers have **zero price transparency** across grocery retailers. The same basket of goods can vary 20–40 % between stores within the same parish — and there is no centralized, real-time data source to compare.

## The Solution

**Massiv Cart AI** turns every grocery receipt into structured price intelligence:

1. **Snap & Send** — Users photograph receipts via a Telegram bot.
2. **AI Extraction** — Claude Vision parses store name, line items, prices, and quantities from receipt images with high accuracy.
3. **Event Pipeline** — Extracted data streams through Kafka into a normalized Supabase product catalog.
4. **Live Price Map** — A Next.js frontend renders a real-time, searchable map of grocery prices across Jamaica.

The more people contribute, the smarter the platform gets — a true **crowdsourced price network**.

---

## Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Telegram Bot │─────▶│  Claude Vision    │─────▶│  Kafka Producer  │
│  (User Input) │      │  Receipt Parser   │      │  (Event Stream)  │
└──────────────┘      └──────────────────┘      └────────┬────────┘
                                                         │
                                                         ▼
┌──────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Next.js UI   │◀─────│  REST API + Redis │◀─────│  Kafka Consumer  │
│  Price Map    │      │  (Cached Reads)   │      │  → Supabase      │
└──────────────┘      └──────────────────┘      └─────────────────┘
```

| Layer | Technology | Purpose |
|---|---|---|
| **Interface** | Telegram Bot | Zero-friction receipt submission — no app install required |
| **AI/ML** | Claude Vision (Anthropic) | Receipt OCR + structured data extraction |
| **Event Streaming** | Apache Kafka (Confluent Cloud) | Decoupled, ordered ingestion of price events |
| **Database** | Supabase (Postgres + Auth + Realtime) | Product catalog, user auth, real-time subscriptions |
| **Caching** | Redis | Sub-50ms read latency on hot product queries |
| **Frontend** | Next.js 14 | Map-first UI with AI command bar and glassmorphism design |
| **Infrastructure** | GCP Cloud Run + Docker | Serverless containers, auto-scaling, zero ops |

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Supabase project (free tier works)
- Anthropic API key (for Claude Vision)

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_ORG/massiv-cart-ai.git
cd massiv-cart-ai
```

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API
PORT=3000

# Redis (auto-configured by Docker Compose — override only if using external Redis)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_TTL_SECONDS=300
# Or use a single connection string:
# REDIS_URL=redis://redis:6379
```

### 2. Run

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| **API** | `http://localhost:3000` |
| **Redis** | `localhost:6379` |

### 3. Verify

```bash
bash scripts/test-endpoints.sh
```

Results are written to `test-results/endpoint-test-results.txt`.

Override defaults if needed:

```bash
TEST_BASE_URL=http://localhost:4000 \
TEST_OUTPUT_FILE=test-results/local.txt \
bash scripts/test-endpoints.sh
```

Or use the npm alias:

```bash
npm run test:endpoints
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check — includes Redis connectivity status |
| `GET` | `/products?limit=25&category=produce` | Query products by category with Redis-backed response caching |

### Caching behavior

All product queries are cached in Redis with a configurable TTL (default 300 s). When Redis is unavailable, the API degrades gracefully — queries hit Supabase directly and caching is skipped. No downtime, no errors.

---

## Design System

The UI follows a custom design system built around the Massiv Cart brand:

| Token | Value | Role |
|---|---|---|
| `--primary` | `#00d26a` | Primary actions, active states, focus rings |
| `--accent` | `#00d26a` | Accent highlights |
| `--destructive` | `#ef4444` | Errors, warnings, over-budget indicators |
| `--background` | `#1a1a2e` / `#ffffff` | Page background (dark/light) |
| `--card` | `rgba(20,20,40,0.85)` | Card and panel surfaces (glassmorphism) |
| `--muted-foreground` | `#9ca3af` | Subdued text, labels |
| `--border` | `rgba(255,255,255,0.1)` | Dividers, outlines |

---

## Project Structure

```
massiv-cart-ai/
├── src/
│   ├── api/              # Express API — routes, middleware, Redis client
│   ├── bot/              # Telegram bot — receipt upload handler
│   ├── extraction/       # Claude Vision integration — receipt parsing
│   ├── kafka/            # Producer & consumer — event pipeline
│   └── ui/               # Next.js 14 frontend — map, command bar
├── scripts/
│   └── test-endpoints.sh # API smoke tests
├── docker-compose.yml    # API + Redis orchestration
├── Dockerfile            # API container build
└── .env.example          # Environment variable template
```

---

## Roadmap

- [ ] Multi-store receipt support (batch upload)
- [ ] Price trend analytics per product per parish
- [ ] WhatsApp bot interface (broader reach)
- [ ] Community leaderboard — top contributors
- [ ] Public API for third-party integrations

---

## Built With

**Massiv Cart AI** was built in 24 hours at the [Intellibus Hackathon](https://intellibus.com) (March 2025).

---

## License

MIT © Massiv Cart AI
