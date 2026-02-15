# Verana Resolver Helm Chart

This chart deploys the Verana Trust Resolver (Fastify) as a Deployment with a Service, optional ingress, configurable environment variables, and node scheduling controls.

## Features

- Deploys the resolver with configurable image repo/tag and replica count.
- Exposes the app via ClusterIP service; optional ingress block if you need it.
- Captures all required env vars with override support.
- Allows nodeSelector and resource overrides.

## Kubernetes Resources

- Service (ClusterIP by default)
- Deployment
- Optional Ingress (disabled by default)

## Configuration

| Parameter | Description | Default |
| --- | --- | --- |
| `name` | Application name/labels | `verana-resolver` |
| `host` | Subdomain prefix | `resolver` |
| `replicas` | Deployment replicas | `1` |
| `image.tag` | Image tag | `{{ .Chart.Version }}` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `3000` |
| `service.targetPort` | Container port | `3000` |
| `nodeSelector` | Node selector map | `kubernetes.io/hostname: cluster-utc-node-07efe5` |
| `env` | Required env vars (see below) | testnet defaults |
| `extraEnv` | Additional env entries (`[{name, value}]`) | `[]` |
| `resources` | Pod resources | `512Mi/250m` requests, `1Gi/500m` limits |
| `ingress.enabled` | Enable ingress | `true` |

> **Note:** The image tag should match the Chart version by default to ensure deployment consistency. It can be overridden for debugging purposes if needed.

### Required environment variables

Defined under `env` with testnet reference values; override per environment:

- `POSTGRES_HOST` — PostgreSQL host address
- `POSTGRES_PORT` — PostgreSQL port (default: 5432)
- `POSTGRES_USER` — PostgreSQL username
- `POSTGRES_PASSWORD` — PostgreSQL password
- `POSTGRES_DB` — PostgreSQL database name
- `REDIS_URL` — Redis connection string
- `INDEXER_API` — URL of the Verana Indexer API
- `PORT` — Server port (default: 3000)
- `LOG_LEVEL` — Pino log level (default: info)
- `INSTANCE_ROLE` — Instance role: leader or reader (default: leader)
- `POLL_INTERVAL` — Indexer polling interval in seconds (default: 5)
- `CACHE_TTL` — Cache TTL in seconds (default: 86400)
- `TRUST_TTL` — Trust evaluation TTL in seconds (default: 3600)
- `POLL_OBJECT_CACHING_RETRY_DAYS` — Max retry window in days (default: 7)
- `ECS_ECOSYSTEM_DIDS` — Comma-separated list of allowed ECS ecosystem DIDs

### Quick examples

Render:

```bash
helm template ./charts
```

Install/upgrade (override image tag and env vars):

```bash
helm upgrade --install verana-resolver ./charts \
  -n vna-testnet-1 \
  --set env.POSTGRES_HOST=db \
  --set env.POSTGRES_USER=verana \
  --set env.POSTGRES_PASSWORD=secret \
  --set env.POSTGRES_DB=verana_resolver \
  --set env.REDIS_URL=redis://redis:6379 \
  --set env.INDEXER_API=http://indexer:1317
```
