# Verana Resolver Helm Chart

This chart deploys the Verana Trust Resolver as a StatefulSet with a Service, Ingress, persistent storage, and optional PostgreSQL and Redis sidecar containers.

## Features

- Deploys the resolver with configurable replicas and image tag
- Optional PostgreSQL sidecar with PersistentVolumeClaim
- Optional Redis sidecar with PersistentVolumeClaim
- Public ingress with TLS via cert-manager
- Configurable environment variables and resource limits
- Node selector support

## Kubernetes Resources

- **Service** — exposes HTTP port, plus db/redis ports when sidecars are enabled
- **Ingress** — public ingress with TLS
- **PersistentVolumeClaim** — for PostgreSQL data (when `database.enabled: true`)
- **PersistentVolumeClaim** — for Redis data (when `redis.enabled: true`)
- **StatefulSet** — runs resolver container with optional PG/Redis sidecars

## Configuration

### General

| Parameter | Description | Default |
| --- | --- | --- |
| `name` | Application name/labels | `verana-resolver` |
| `host` | Subdomain prefix | `resolver` |
| `replicas` | StatefulSet replicas | `1` |
| `image.tag` | Image tag | `{{ .Chart.Version }}` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `service.port` | Service port | `3000` |
| `service.targetPort` | Container port | `3000` |
| `nodeSelector` | Node selector map | see values.yaml |

### Database Configuration (Optional)

| Parameter | Description | Default |
| --- | --- | --- |
| `database.enabled` | Enable PostgreSQL sidecar | `true` |
| `database.host` | PostgreSQL host | `localhost` |
| `database.port` | PostgreSQL port | `5432` |
| `database.user` | PostgreSQL username | `verana` |
| `database.password` | PostgreSQL password | `verana` |
| `database.db` | PostgreSQL database name | `verana_resolver` |
| `database.resources` | PostgreSQL container resources | `256Mi/100m` req, `512Mi/500m` limits |
| `database.storage.size` | PVC size | `10Gi` |
| `database.storage.storageClassName` | Storage class | `csi-cinder-classic` |

### Redis Configuration (Optional)

| Parameter | Description | Default |
| --- | --- | --- |
| `redis.enabled` | Enable Redis sidecar | `true` |
| `redis.host` | Redis host | `localhost` |
| `redis.resources` | Redis container resources | `64Mi/25m` req, `128Mi/100m` limits |

### Application Environment Variables

| Parameter | Description | Default |
| --- | --- | --- |
| `env.INDEXER_API` | URL of the Verana Indexer API | `http://localhost:1317` |
| `env.ECS_ECOSYSTEM_DIDS` | Comma-separated allowed ecosystem DIDs | `""` |
| `env.PORT` | Server port | `3000` |
| `env.LOG_LEVEL` | Pino log level | `info` |
| `env.INSTANCE_ROLE` | Instance role: leader or reader | `leader` |
| `env.POLL_INTERVAL` | Polling interval in seconds | `5` |
| `env.CACHE_TTL` | Cache TTL in seconds | `86400` |
| `env.TRUST_TTL` | Trust evaluation TTL in seconds | `3600` |
| `env.POLL_OBJECT_CACHING_RETRY_DAYS` | Max retry window in days | `7` |
| `extraEnv` | Additional env entries (`[{name, value}]`) | `[]` |

> **Note:** `POSTGRES_*` and `REDIS_URL` env vars are automatically derived from `database.*` and `redis.*` config — do not set them under `env`.

### Resolver Container Resources

| Parameter | Description | Default |
| --- | --- | --- |
| `resources.requests.cpu` | Minimum reserved CPU | `250m` |
| `resources.requests.memory` | Minimum reserved memory | `512Mi` |
| `resources.limits.cpu` | Maximum allowed CPU | `500m` |
| `resources.limits.memory` | Maximum allowed memory | `1Gi` |

### Ingress

| Parameter | Description | Default |
| --- | --- | --- |
| `ingress.host` | Ingress hostname (templated) | `resolver.testnet.verana.network` |
| `ingress.public.enableCors` | Enable CORS for public ingress | `true` |

### Quick examples

Render:

```bash
helm template ./charts
```

Install/upgrade:

```bash
helm upgrade --install verana-resolver ./charts \
  -n vna-testnet-1 \
  --set database.user=verana \
  --set database.password=secret \
  --set database.db=verana_resolver \
  --set env.INDEXER_API=http://indexer:1317 \
  --set env.ECS_ECOSYSTEM_DIDS=did:web:ecosystem.example.com
```

Disable sidecars (external PG/Redis):

```bash
helm upgrade --install verana-resolver ./charts \
  -n vna-testnet-1 \
  --set database.enabled=false \
  --set database.host=external-db \
  --set database.user=verana \
  --set database.password=secret \
  --set database.db=verana_resolver \
  --set redis.enabled=false \
  --set redis.host=external-redis \
  --set env.INDEXER_API=http://indexer:1317 \
  --set env.ECS_ECOSYSTEM_DIDS=did:web:ecosystem.example.com
```
