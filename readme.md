# MassivCartAPI

## Docker setup

This project now includes:

- `Dockerfile` for building the API container
- `docker-compose.yml` for running the API with Redis

### Environment variables

Create a local `.env` file with:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3000
REDIS_TTL_SECONDS=300
```

Redis is provided by Docker Compose and is exposed to the API as:

```env
REDIS_HOST=redis
REDIS_PORT=6379
```

You can also use a single `REDIS_URL` instead of `REDIS_HOST` and `REDIS_PORT`.

### Run with Docker

```bash
docker compose up --build
```

The API will be available at `http://localhost:3000` and Redis at `localhost:6379`.

## Caching

Redis is now wired into the API for response caching.

- `GET /health` reports Redis status
- `GET /products?limit=25&category=produce` fetches product data from Supabase and caches the response in Redis

When Redis is unavailable, the API still runs and simply skips caching.
