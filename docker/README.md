# Docker Development Environment

Runs PostgreSQL and Redis locally for the Verana Trust Resolver.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

## Quick Start

```bash
# Start services
cd docker && docker compose up -d

# Verify
docker compose ps

# View logs
docker compose logs -f
```

## Connection Details

| Service    | Host        | Port   | Credentials              |
|------------|-------------|--------|--------------------------|
| PostgreSQL | `localhost` | `5432` | `verana` / `verana`      |
| Redis      | `localhost` | `6379` | —                        |

These match the defaults in `.env.example` at the project root.

## Stop & Cleanup

```bash
# Stop (preserves data)
docker compose down

# Stop and delete volumes
docker compose down -v
```
