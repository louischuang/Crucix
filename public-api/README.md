# Crucix Public API

Public API endpoints are mounted separately from the internal dashboard API.

- Internal dashboard API: `/api/*`
- Third-party API: `/public-api/v1/*`
- OpenAPI JSON: `/public-api/openapi.json`
- Swagger UI: `/public-api/docs`

## Endpoints

```text
GET /public-api/v1/health
GET /public-api/v1/brief?lang=en|zh
GET /public-api/v1/ideas?lang=en|zh
GET /public-api/v1/news?lang=en|zh
GET /public-api/v1/sources
GET /public-api/v1/locales
```

Localized endpoints default to `lang=en`. Use `lang=zh` for Traditional Chinese when LLM translations are available.

## Authentication

By default, the MVP is open. To require API keys, set `PUBLIC_API_KEYS` in runtime environment:

```text
PUBLIC_API_KEYS=example-key-1,example-key-2
```

Clients can pass the key as either:

```text
x-api-key: example-key-1
Authorization: Bearer example-key-1
```

Usage logs store only the SHA-256 hash of the provided API key, never the raw key.

## PostgreSQL Usage Logs

Set either `DATABASE_URL` or standard `PG*` environment variables at runtime:

```text
DATABASE_URL=postgres://user:password@db.example.com:5432/crucix-db
```

If no database is configured, the API still responds normally and usage logging runs in no-op mode.

The schema lives in `public-api/schema.sql` and is initialized automatically on startup.
