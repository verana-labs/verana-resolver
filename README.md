# Verana Trust Resolver

The **Verana Trust Resolver** is a core infrastructure component of the [Verana](https://verana.io) ecosystem. It continuously ingests state from the **Verana Indexer**, resolves decentralized identifiers (DIDs), dereferences verifiable credentials (VCs) presented as [linked-vp](https://identity.foundation/linked-vp/) in DID Documents, and validates trust according to the **Verifiable Trust Specification**.

## Features

- **Block-based ingestion** — polls the Verana Indexer at configurable intervals
- **Two-pass trust evaluation** — Pass1 (caching/dereferencing) + Pass2 (trust evaluation)
- **Retry subsystem** — automatic retry of transient failures with permanent error detection
- **REST API** — four trust resolution endpoints (Q1–Q4)
- **Leader election** — only one instance runs the polling loop in multi-instance deployments
- **TTL-based caching** — separate TTLs for dereferenced objects and trust evaluations

## REST API Endpoints

| Endpoint | Description |
|---|---|
| `GET /v1/trust/resolve` | Q1 — Full trust resolution for a DID |
| `GET /v1/trust/issuer-authorization` | Q2 — Check if a DID is an authorized issuer for a credential schema |
| `GET /v1/trust/verifier-authorization` | Q3 — Check if a DID is an authorized verifier for a credential schema |
| `GET /v1/trust/ecosystem-participant` | Q4 — Check if a DID holds any active permissions in an ecosystem |
| `GET /v1/health` | Health check |

## Container Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db`) |
| `REDIS_URL` | Redis connection string (e.g. `redis://host:6379`) |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `INSTANCE_ROLE` | `leader` | Instance role: `leader` (runs polling loop) or `reader` (API-only) |
| `POLL_INTERVAL` | `5` | Seconds between polling cycles |
| `CACHE_TTL` | `86400` | Dereferenced object cache TTL in seconds (24h) |
| `TRUST_TTL` | `3600` | Trust evaluation result TTL in seconds (1h) |
| `POLL_OBJECT_CACHING_RETRY_DAYS` | `7` | Maximum retry window for failed dereferencing (days) |
| `VPR_ALLOWLIST_PATH` | `config/vpr-allowlist.json` | Path to the VPR allowlist configuration file |

## Tech Stack

- **Runtime**: Node.js 22
- **Language**: TypeScript
- **Web framework**: Fastify
- **SSI framework**: Credo-ts (OpenWallet Foundation)
- **Database**: PostgreSQL
- **Cache**: Redis
- **Testing**: Vitest

## Development

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Run tests
npm test

# Start in dev mode (with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## License

See [LICENSE](LICENSE).
