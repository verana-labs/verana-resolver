# Verana Trust Resolver

Verana Trust Resolver Container - Implements verifiable trust resolution with REST API using NestJS framework.

## Overview

The Verana Trust Resolver is a core infrastructure component that:
- Continuously ingests state from the Verana Indexer
- Resolves decentralized identifiers (DIDs)
- Dereferences verifiable credentials (VCs) and presentations (VPs)
- Validates trust according to the Verifiable Trust Specification
- Exposes a REST API for querying trusted services, ecosystems, credentials, and more

## Architecture

Built with **NestJS** framework following module-based architecture:
- **Modules**: Feature-based organization (services, ecosystems, credentials, etc.)
- **WebSocket-based ingestion**: Real-time block processing via WebSocket connections
- **Two-pass processing**: Pass1 (caching & assembly) and Pass2 (trust evaluation)
- **TTL-based caching**: Configurable cache and trust evaluation TTLs
- **Consistency model**: Queries reflect state at `lastProcessedBlock`

See [docs/](docs/) for detailed documentation.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose (for database)
- PostgreSQL 16+ (via Docker or existing instance)

## Quick Start

### Development

**Option 1: With Docker (Recommended)**
```bash
# Install dependencies
pnpm install

# Start database and development server
pnpm run dev:docker
```

**Option 2: Without Docker**
```bash
# Install dependencies
pnpm install

# Start database only (if needed)
docker-compose -f src/docker/docker-compose.yml up -d postgres

# Start development server
pnpm run start:dev
```

### Production

**Option 1: Run directly (no Docker for app)**
```bash
pnpm run prod
```

**Option 2: Run with Docker Compose (everything in containers)**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Stop Everything

```bash
pnpm run stop
```

## Configuration

Configuration can be done via:
1. **Environment variables** (`.env` file) - Recommended for production
2. **Config file** (`src/config/config.json`) - Recommended for development

### Quick Setup

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your values
# Or edit src/config/config.json
```

### Environment Variables

See `.env.example` for all available environment variables:

**Core Settings:**
- `POLL_INTERVAL` - Polling fallback interval in seconds (default: 10, used only if WebSocket fails)
- `CACHE_TTL` - Cache TTL in seconds (default: 3600)
- `TRUST_TTL` - Trust evaluation TTL in seconds (default: 1800)
- `OBJECT_CACHING_RETRY_DAYS` - Retry window for failed dereferencing (default: 7)

**Database:**
- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 5435)
- `DB_NAME` - Database name (default: verana_resolver)
- `DB_USER` - Database user (default: verana_resolver_user)
- `DB_PASSWORD` - Database password
- `DB_SYNCHRONIZE` - Auto-sync database schema (default: false, set to true for dev)
- `DB_LOGGING` - Enable SQL logging (default: false)

**API:**
- `API_PORT` - API server port (default: 4000)
- `LOG_LEVEL` - Logging level: error, warn, info, debug (default: info)

**VPR Configuration (optional, can also use config.json):**
- `VPR_NAME` - Verifiable Public Registry name
- `VPR_BASE_URLS` - Comma-separated list of indexer URLs
- `VPR_VERSION` - VPR version (default: 1)
- `VPR_PRODUCTION` - Production mode (default: true)

**ECS Ecosystems (optional):**
- `ECS_ECOSYSTEM_DIDS` - Comma-separated list of ecosystem DIDs
- `ECS_ECOSYSTEM_VPRS` - Comma-separated list of corresponding VPRs

### Config File

See `src/config/config.json` for VPR configuration:
- `verifiablePublicRegistries` - List of VPRs and their indexer URLs
- `ecsEcosystems` - Essential Credential Schema ecosystems

For detailed configuration guide, see [docs/config-setup.md](docs/config-setup.md).

For detailed configuration guide, see [docs/config-setup.md](docs/config-setup.md).

## API Endpoints

Once running, access:
- **API Base**: http://localhost:4000/api
- **Swagger Docs**: http://localhost:4000/api-docs
- **Health Check**: http://localhost:4000/health

### Available Endpoints

- `GET /api/services` - List verifiable services
- `GET /api/ecosystems` - List trust ecosystems
- `GET /api/credentials` - List credentials
- `GET /api/did/:did/usage` - Get DID usage information
- `GET /api/search?text=...` - Search across entities
- `GET /api/trust-evaluation/:did` - Get trust evaluation for a DID

See Swagger documentation at `/api-docs` for detailed API specifications.

## Database

Containers use non-conflicting ports by default:
- PostgreSQL: `5435` (configurable via `DB_PORT`)

To use existing containers, just run `pnpm run dev` - it will connect to your existing setup.

## Project Structure

```
src/
├── main.ts                    # NestJS entry point
├── app.module.ts              # Root module
├── modules/                   # Feature modules
│   ├── services/              # Services module
│   ├── ecosystems/            # Ecosystems module
│   ├── credentials/           # Credentials module
│   ├── did/                   # DID module
│   ├── search/                # Search module
│   ├── trust/                 # Trust evaluation module
│   ├── processing/            # Processing engine (WebSocket & ingestion)
│   ├── health/                # Health check
│   ├── shared/                # Shared services
│   └── database/              # Database module
├── config/                    # Configuration
├── database/                  # Database entities & utilities
├── indexer/                   # Indexer client
└── ... (other directories)
```

## Development

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:cov

# Run tests in debug mode
pnpm run test:debug
```

**Testing Framework**: Jest (official NestJS recommendation)

See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for detailed testing documentation.

### Linting

```bash
pnpm run lint
```

### Building

```bash
pnpm run build
```

## Docker

The project includes:
- `Dockerfile` - Multi-stage build for production
- `docker-compose.yml` - Database service
- `docker-compose.prod.yml` - Production stack

See [docs/docker-setup.md](docs/docker-setup.md) for detailed Docker setup instructions.

## Documentation

All documentation is located in the [docs/](docs/) directory:

- [docker-setup.md](docs/docker-setup.md) - Docker setup and configuration
- [TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Testing framework and examples
- [TESTING_SUMMARY.md](docs/TESTING_SUMMARY.md) - Testing framework migration summary
- [config-setup.md](docs/config-setup.md) - Configuration guide
- [VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md) - Specification compliance report

## Specification Compliance

This implementation follows the [Verana Trust Resolver Container Specification](docs/VALIDATION_REPORT.md).

### Implemented Features

- NestJS module-based architecture
- REST API (not GraphQL)
- WebSocket-based ingestion for real-time block processing
- Two-pass processing structure (Pass1 & Pass2 stubs)
- Consistency model (lastProcessedBlock)
- Database entities matching spec
- Configuration structure

### TODO (Per Specification)

- Pass1 implementation (Section 7.1): Caching, dereferencing, DID document invalidation
- Pass2 implementation (Section 7.2): Trust evaluation algorithm
- TTL logic (Section 12): CACHE_TTL and TRUST_TTL enforcement

See [docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md) for detailed compliance status.

## License

MIT

## Author

Verana Labs
