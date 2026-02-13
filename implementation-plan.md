# Verana Trust Resolver — Implementation Plan

## Governing Documents

| Document | Role |
|----------|------|
| [spec.md](spec.md) | Container specification: ingestion, caching, consistency, trust resolution algorithm |
| [trust-resolution.md](trust-resolution.md) | **Normative** REST API: Q1–Q4 request/response contracts |
| [openapi-indexer.json](openapi-indexer.json) | Indexer API: sole data source for on-chain state |

---

## Design Principles

1. **Horizontally scalable** — the resolver MUST support multiple stateless API instances behind a load balancer, all sharing a common **PostgreSQL** database and **Redis** cache. Adding instances increases query throughput linearly.
2. **Two-tier storage: PostgreSQL + Redis** — PostgreSQL is the durable store for pre-computed Q1 trust evaluations (re-evaluated periodically per `TRUST_TTL`). Redis caches only **downloaded external files** (DID docs, VCs, VPs) with `CACHE_TTL`. The Indexer is always queried live ("hot") — it is co-located and fast. Both tiers scale to **millions of DIDs**.
3. **Pre-compute Q1, compute Q2–Q4 on demand** — Q1 trust evaluations are pre-computed by the leader and stored in PostgreSQL with TTLs. Q2/Q3 are evaluated on demand using Redis-cached files + hot Indexer queries. Q4 is a pure hot Indexer query.
4. **Minimal storage footprint** — PostgreSQL stores only trust evaluation facts (~100–200 bytes/DID). Redis caches only downloaded files (DID docs, VCs, VPs). The Indexer is the source of truth for all on-chain data and is queried live — nothing is copied into Redis or PostgreSQL.
5. **Indexer is the source of truth** — permissions, schemas, trust registries, deposits, sessions, digests are all fetched live from the Indexer (with `At-Block-Height` for consistency). Nothing is cached locally — the Indexer is co-located and fast.
6. **Recursive evaluation with memoization** — Q1 is the core primitive; Q2/Q3 verify credentials using cached files + hot Indexer; Q4 is a pure permission lookup. A single DID evaluation is never performed twice within one request or within the TTL of its cached facts.
7. **Survive restarts** — all cached data is durable in PostgreSQL. On restart (or new instance spin-up), the resolver resumes from `lastProcessedBlock` with a warm Redis cache — no re-sync needed.
8. **Single-writer ingestion** — exactly one instance runs the polling loop (leader election via Redis or PostgreSQL advisory lock). All instances serve read queries.

---

## Phase 1: Core Infrastructure

### 1.1 Project Bootstrap

- Language/runtime: **TypeScript + Node.js** (or Rust — TBD by team preference).
- REST framework: Express/Fastify (or Actix-web for Rust).
- **PostgreSQL** (v15+): durable store. Connection pooling via PgBouncer or built-in pool (`pg` npm pool, `deadpool-postgres` for Rust).
- **Redis** (v7+ / Valkey): distributed hot cache. All instances share the same Redis, so a cache write by the ingestion leader is instantly visible to all query instances.
- Configuration: environment variables per spec §5.2 (`POLL_INTERVAL`, `CACHE_TTL`, `TRUST_TTL`, `POLL_OBJECT_CACHING_RETRY_DAYS`) plus `DATABASE_URL`, `REDIS_URL`, `INSTANCE_ROLE` (`leader` | `reader`).
- VPR allowlist config: list of recognized VPRs with Indexer URLs and recognized Ecosystem DIDs per [WL-VPR] and [WL-ECS].

### 1.2 Indexer Client

Build a typed HTTP client wrapping the Indexer OpenAPI. Key operations:

| Indexer endpoint | Used by | Notes |
|------------------|---------|-------|
| `getBlockHeight` | Polling loop | Always live |
| `listChanges(block_height)` | Incremental sync | Process once, discard |
| `getCredentialSchema(id)` | Q1, Q2, Q3, Q4 | Schemas change rarely — hot query is cheap |
| `listCredentialSchemas(tr_id)` | Q4 (ecosystem lookup) | Hot query |
| `listPermissions(did, schema_id, type, only_valid)` | Q1, Q2, Q3, Q4 | Hot query with `At-Block-Height` |
| `getPermission(id)` | Permission chain | Hot query |
| `findBeneficiaries(issuer_perm_id, verifier_perm_id)` | Q2, Q3 (fees) | Hot query |
| `getPermissionSession(id)` | Q2, Q3 (session check) | Hot query |
| `getTrustRegistry(id)` | Ecosystem metadata | Hot query |
| `getTrustDepositByAccount(account)` | Permission chain deposit | Hot query |
| `getDigest(digest_sri)` | Effective issuance time (§9.3) | Immutable once created |
| `getExchangeRate / getPrice` | Q2, Q3 (fee conversion) | Hot query |

All Indexer calls are **hot queries** — the Indexer is co-located and returns in <1ms for indexed lookups. No Indexer data is cached in Redis or PostgreSQL; the Indexer is the single source of truth for on-chain state.

**Performance optimization**: batch independent Indexer calls in parallel (`Promise.all`). The permission chain for a credential typically requires 2–4 permission lookups + their trust deposits — these can be parallelized.

### 1.3 DID Resolution & VP Dereferencing

- Resolve DID Documents via Universal Resolver or method-specific resolvers.
- Extract `linked-vp` service endpoints from DID Document.
- Fetch and parse VPs → extract VCs.
- For W3C VTCs: verify JWS/proof, extract `credentialSchema.id` (→ VTJSC), extract claims.
- For AnonCreds VTCs: verify ZKP, resolve Credential Definition, extract `relatedJsonSchemaCredentialId`.
- Cache all dereferenced objects keyed by URL/DID with `cachedAt` timestamp.
- Enforce `validUntil` expiry independent of CACHE_TTL.

### 1.4 Storage Architecture

The resolver uses a **two-tier** storage design shared across all instances:

**Tier 1 — PostgreSQL (normalized fact store):**

PostgreSQL stores **pre-computed Q1 trust evaluations** — no raw objects, no JSON blobs. Q1 responses are served directly from these facts. Q2/Q3/Q4 are computed on demand.

```sql
-- Trust evaluation results (Pass2 output) — scalar facts only
CREATE TABLE trust_results (
  did             TEXT PRIMARY KEY,
  trust_status    TEXT NOT NULL,       -- TRUSTED / PARTIAL / UNTRUSTED
  production      BOOLEAN NOT NULL,
  evaluated_at    TIMESTAMPTZ NOT NULL,
  evaluated_block BIGINT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_trust_expires ON trust_results(expires_at) WHERE expires_at <= NOW();

-- Per-credential evaluation results, linked to the DID
CREATE TABLE credential_results (
  id              BIGSERIAL PRIMARY KEY,
  did             TEXT NOT NULL REFERENCES trust_results(did) ON DELETE CASCADE,
  credential_id   TEXT NOT NULL,       -- VC id or hash
  result_status   TEXT NOT NULL,       -- VALID / IGNORED / FAILED
  ecs_type        TEXT,                -- ECS-SERVICE, ECS-ORG, ECS-PERSONA, ECS-UA, or NULL
  schema_id       BIGINT,             -- Indexer CredentialSchema id
  issuer_did      TEXT,
  presented_by    TEXT,                -- DID that presented this credential
  issued_by       TEXT,                -- DID that issued (may differ from presented_by)
  perm_id         BIGINT,             -- Issuer permission id used for this credential
  error_reason    TEXT,                -- populated when result_status = FAILED
  UNIQUE (did, credential_id)
);
CREATE INDEX idx_cred_did ON credential_results(did);

-- NOTE: Downloaded files (DID docs, VPs, VCs) are cached in Redis only
-- (TTL = CACHE_TTL). On Redis miss, re-fetched from source:
--   - DID docs → Universal Resolver / method-specific resolver
--   - VPs/VCs → linked-vp service endpoints in the DID doc
-- Indexer entities (permissions, schemas, etc.) are NEVER cached —
-- always queried live from the co-located Indexer API.

-- Retry tracking
CREATE TABLE reattemptable (
  resource_id     TEXT PRIMARY KEY,
  resource_type   TEXT NOT NULL,
  first_failure   TIMESTAMPTZ NOT NULL,
  last_retry      TIMESTAMPTZ NOT NULL,
  error_type      TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0
);

-- Resolver state (singleton rows)
CREATE TABLE resolver_state (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);  -- stores lastProcessedBlock, leader lock, etc.
```

**Tier 2 — Redis (downloaded file cache):**

Redis caches only **downloaded external files** (DID docs, VPs, VCs) used during Q1 evaluation and Q2/Q3 credential verification. Indexer entities are **never** cached in Redis — they are always queried live.

```
resolver:obj:{url_or_did}      → downloaded file (DID doc, VP, VC)  TTL = CACHE_TTL
resolver:state:lastBlock       → integer                            no TTL
```

**Data flow:**

1. **Ingestion** (leader): fetches changes from Indexer → downloads DID docs/VPs/VCs (cached in Redis) → evaluates Q1 trust status → stores results in PostgreSQL (`trust_results`, `credential_results`).
2. **Q1 query** (all instances): reads pre-computed facts from PostgreSQL → assembles JSON response → returns. Sub-millisecond for summary.
3. **Q2/Q3 query** (all instances): fetches cached files from Redis (re-downloading on miss) → computes `digest-sri` → hot-queries Indexer for permissions/sessions → assembles response on demand.
4. **Q4 query** (all instances): pure hot Indexer query → no Redis, no PostgreSQL needed.

**Why PostgreSQL stores only scalar facts?**
- **Minimal footprint** — only `trust_results` (~100 bytes/row) and `credential_results` (~200 bytes/row) live in PostgreSQL. No raw objects, no JSON blobs. 1M DIDs ≈ 100–200 MB total.
- **Queryable** — `trust_status`, `evaluated_block`, `expires_at` are indexed scalar columns. TTL refresh is a cheap index scan.
- **Downloaded files in Redis** — DID docs, VPs, VCs live in Redis with native TTL. On miss, re-fetched from source (Universal Resolver, VP endpoints).
- **Indexer is always live** — permissions, schemas, trust registries, deposits are always queried from the Indexer. Never duplicated into Redis or PostgreSQL.
- **Evolvable** — changing the API response format doesn't require a data migration; Q1 results are rebuilt from facts, Q2–Q4 are computed on demand.

### 1.5 Horizontal Scaling Model

```
                    ┌─────────────┐
                    │ Load Balancer│
                    └──────┬──────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Resolver │ │ Resolver │ │ Resolver │   (N stateless instances)
        │ Reader   │ │ Reader   │ │ Leader   │   (leader runs polling loop)
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │             │
             ▼             ▼             ▼
        ┌─────────────────────────────────────┐
        │              Redis                  │   (shared hot cache)
        └─────────────────┬───────────────────┘
                          │
        ┌─────────────────▼───────────────────┐
        │           PostgreSQL                │   (durable store)
        │    (+ optional read replicas)       │
        └─────────────────────────────────────┘
```

- **Reader instances**: serve Q1–Q4 API queries. Q1 reads from PostgreSQL; Q2/Q3 read from Redis + hot Indexer; Q4 queries Indexer directly. Stateless — scale out by adding pods/containers.
- **Leader instance**: runs the polling loop (Pass1 + Pass2). Acquires leadership via `pg_advisory_lock` or Redis `SET NX EX`. Writes to PostgreSQL + Redis. Also serves API queries.
- **Failover**: if the leader dies, another instance acquires the lock and resumes from `lastProcessedBlock`.
- **Read replicas** (optional): for extreme Q1 read loads, PostgreSQL read replicas add throughput.

---

## Phase 2: Polling & Ingestion (spec §7–§8)

### 2.1 Polling Loop

```
lastProcessedBlock: persisted in PostgreSQL (resolver_state) + Redis (resolver:state:lastBlock)
Leader lock: pg_advisory_lock or Redis SET NX EX

while true:
  H = indexer.getBlockHeight()
  while lastProcessedBlock < H:
    target = lastProcessedBlock + 1
    changes = indexer.listChanges(target)
    runPass1(changes)           // dereference affected DIDs
    retryEligiblePass1()        // retry failures per retry rules
    runPass2(changes)           // re-evaluate trust for affected DIDs
    retryEligiblePass2()
    lastProcessedBlock = target // atomic with cache updates
  sleep(POLL_INTERVAL)
```

### 2.2 Pass1 — per changed entity

For each entity in `changes.activity`:
1. Identify the affected DID(s) from `entity_type` + `entity_id`.
2. Invalidate cached DID Document for that DID.
3. Re-fetch DID Document → dereference linked-vps → cache VCs.
4. For W3C VTCs: compute `digestSRI` via JCS, fetch `getDigest(digestSRI)` from Indexer.
5. Query Indexer live for permissions, schemas, trust registries as needed (not cached — always fresh).
6. On failure → add to `reattemptable`.

### 2.3 Pass2 — per affected DID

1. Run Q1 evaluation (see Phase 3).
2. UPSERT result in PostgreSQL `trust_results`.
3. On failure → add to `reattemptable`.

### 2.4 TTL-Driven Refresh

On each polling cycle, query the DB for expired evaluations:

```sql
SELECT did FROM trust_results WHERE expires_at <= :now ORDER BY expires_at ASC LIMIT :batch_size
```

- Re-run Pass1 + Pass2 for each expired DID (in batches of e.g. 100).
- Does NOT advance `lastProcessedBlock`.
- The `idx_trust_expires` index makes this O(log N) even at millions of rows.

### 2.5 Retry Rules

- At most 1 retry per day per failing resource.
- Up to `POLL_OBJECT_CACHING_RETRY_DAYS` days.
- After that: permanently failed, remove from `reattemptable`, mark trust as UNTRUSTED.

---

## Phase 3: Trust Resolution (Q1 — the core primitive)

### 3.1 Algorithm: `resolveTrust(did, visitedDids?)`

```
function resolveTrust(did, visitedDids = new Set()):
  // 1. Check cache
  cached = trustResults.get(did)
  if cached && cached.expiresAt > now:
    return cached

  // 2. Cycle detection
  if visitedDids.has(did):
    return { trustStatus: "UNTRUSTED", reason: "circular reference" }
  visitedDids.add(did)

  // 3. Resolve DID Document
  didDoc = resolveDIDDocument(did)  // cached or fresh
  linkedVps = extractLinkedVPs(didDoc)

  // 4. Dereference and verify each credential
  credentials = []
  failedCredentials = []
  for each vp in linkedVps:
    for each vc in vp.verifiableCredential:
      result = evaluateCredential(vc, did, visitedDids)
      if result.error:
        failedCredentials.push(result)
      else:
        credentials.push(result)

  // 5. Classify credentials
  validCredentials = credentials.filter(c => c.result == "VALID")
  ignoredCredentials = credentials.filter(c => c.result == "IGNORED")

  // 6. Check VS-REQ-2/3/4
  trustStatus = evaluateVSRequirements(did, validCredentials, visitedDids)

  // 7. Derive production flag
  production = deriveProduction(validCredentials)

  return { did, trustStatus, production, credentials: [...validCredentials, ...ignoredCredentials], failedCredentials }
```

### 3.2 `evaluateCredential(vc, presentedBy, visitedDids)`

1. Verify signature (W3C: JWS; AnonCreds: ZKP).
2. Resolve VTJSC → map to `CredentialSchema` via Indexer `listCredentialSchemas(json_schema=vtjscId)`.
3. Verify VTJSC is presented in Ecosystem DID's DID Document.
4. Determine effective issuance time:
   - W3C: compute digestSRI → `getDigest` → use `created` timestamp.
   - AnonCreds: use current time.
5. Verify issuer has ISSUER permission at effective issuance time:
   - `listPermissions(did=issuerDid, schema_id=schemaId, type=ISSUER, only_valid=true)` with `At-Block-Height`.
6. **Recursively** verify issuer is a VS: `resolveTrust(issuerDid, visitedDids)`.
7. Build permission chain: walk ISSUER → parent (ISSUER_GRANTOR if `issuerPermManagementMode=GRANTOR_VALIDATION`) → ECOSYSTEM.
8. For each chain participant: fetch trust deposit via `getTrustDepositByAccount`, derive `serviceName`/`organizationName`/`countryCode` from their own ECS credentials (via memoized Q1 result).
9. Classify: if schema matches ECS requirement → assign `ecsType`; otherwise non-ECS.
10. If all checks pass → `result: "VALID"`. If checks pass but credential is non-ECS or doesn't satisfy a required ECS → `result: "IGNORED"`. If any check fails → move to `failedCredentials`.

### 3.3 VS-REQ Evaluation

```
function evaluateVSRequirements(did, validCredentials, visitedDids):
  // Group valid credentials by ecosystem
  byEcosystem = groupBy(validCredentials, c => c.schema.ecosystemDid)

  satisfiedEcosystems = 0
  totalEcosystems = byEcosystem.size

  for each (ecosystemDid, creds) in byEcosystem:
    hasService = creds.some(c => c.ecsType == "ECS-SERVICE")
    if !hasService: continue

    serviceCred = creds.find(c => c.ecsType == "ECS-SERVICE")

    // VS-REQ-3: self-issued → VS must also present ECS-ORG or ECS-PERSONA
    if serviceCred.issuedBy == did:
      hasOrgOrPersona = creds.some(c =>
        c.ecsType in ["ECS-ORG", "ECS-PERSONA"] && c.presentedBy == did)
      if hasOrgOrPersona: satisfiedEcosystems++

    // VS-REQ-4: issued by another DID → issuer's DID must present ECS-ORG or ECS-PERSONA
    else:
      issuerResult = resolveTrust(serviceCred.issuedBy, visitedDids)
      issuerHasOrgOrPersona = issuerResult.credentials.some(c =>
        c.ecsType in ["ECS-ORG", "ECS-PERSONA"] && c.presentedBy == serviceCred.issuedBy)
      if issuerHasOrgOrPersona: satisfiedEcosystems++

  if satisfiedEcosystems == totalEcosystems && totalEcosystems > 0: return "TRUSTED"
  if satisfiedEcosystems > 0: return "PARTIAL"
  return "UNTRUSTED"
```

**Performance**: The recursive `resolveTrust` calls are memoized in `trustResults`. In practice, most ecosystems share a small set of issuer/grantor/ecosystem DIDs — the cache hit rate is very high after initial sync.

---

## Phase 4: Q2, Q3, Q4 Endpoints

### 4.1 Q2 — Is DID an Authorized Issuer?

```
GET /v1/trust/issuer-authorization?did=...&vtjscId=...&sessionId=...&at=...
```

1. Map `vtjscId` → `CredentialSchema` via hot Indexer query (`listCredentialSchemas(json_schema=vtjscId)`).
2. `listPermissions(did=did, schema_id=schemaId, type=ISSUER, only_valid=true)` → find ACTIVE permission.
3. If no permission → `{ authorized: false, reason: "No active ISSUER permission..." }`.
4. Fetch cached VC/VP from Redis (re-download on miss) → compute `digest-sri` → establish effective issuance time.
5. Verify ISSUER had active permission at effective issuance time via Indexer (`At-Block-Height`).
6. Build permission chain via Indexer: walk ISSUER → ISSUER_GRANTOR → ECOSYSTEM (on-chain facts only, no VS trust check).
7. Compute fees via `findBeneficiaries(issuer_perm_id=permId)` + schema pricing fields.
8. If fees > 0 and no `sessionId` → HTTP 402 with fee breakdown.
9. If `sessionId` provided → `getPermissionSession(sessionId)` → verify it references the correct `issuer_perm_id`.

### 4.2 Q3 — Is DID an Authorized Verifier?

```
GET /v1/trust/verifier-authorization?did=...&vtjscId=...&sessionId=...&at=...
```

Identical to Q2 but with `type=VERIFIER`, `verifier_perm_id`, and `verification_fees`. Same on-demand evaluation model: cached files from Redis + hot Indexer queries.

### 4.3 Q4 — Is DID a Participant of an Ecosystem?

```
GET /v1/trust/ecosystem-participant?did=...&ecosystemDid=...&at=...
```

1. Resolve `ecosystemDid` → `getTrustRegistry` via hot Indexer query → get `tr_id`.
2. `listCredentialSchemas(tr_id=tr_id)` → get all schema IDs for this ecosystem.
3. For each schema: `listPermissions(did=did, schema_id=schemaId, only_valid=true)` → collect all ACTIVE permissions.
4. Return aggregated result with on-chain facts only (no VS trust check — call Q1 separately if needed).

This is a **pure hot Indexer query** — no Redis reads, no PostgreSQL reads. Response time depends only on Indexer latency.

**Optimization**: The `listPermissions` call supports filtering by `did` and `schema_id` — a single call per schema. If the Indexer adds a bulk endpoint for "all permissions for a DID across schemas", this collapses to one call.

### 4.4 Q1 — Resolve Trust Status

```
GET /v1/trust/resolve?did=...&detail=summary|full
```

1. Look up pre-computed Q1 result from PostgreSQL (`trust_results` + `credential_results`).
2. If `detail=summary` → return only `{ did, trustStatus, production, evaluatedAt, evaluatedAtBlock, expiresAt }`.
3. If `detail=full` → return full credential list with claims and permission chains.

---

## Phase 5: Performance & Data Optimization

### 5.1 Latency Targets

| Request type | Source | Warm | Cold |
|---|---|---|---|
| Q1 summary | PostgreSQL | <1ms | N/A (always pre-computed) |
| Q1 full | PostgreSQL | <5ms | N/A (always pre-computed) |
| Q2/Q3 | Redis files + hot Indexer | <10ms | <2s (file download on Redis miss) |
| Q4 | Hot Indexer only | <5ms | <5ms (no cache dependency) |

- **Q1** is always pre-computed — the leader evaluates trust for all DIDs and stores results in PostgreSQL. Queries are pure PG reads.
- **Q2/Q3** fetch cached files from Redis and hot-query the Indexer. Cold = Redis miss requiring file re-download.
- **Q4** is a pure Indexer query — always fast, no cache dependency.

### 5.2 Storage Budget

**Per-DID estimates (PostgreSQL):**

| Table | Row size | Rows per DID |
|-------|----------|--------------|
| `trust_results` | ~100 bytes (scalars only) | 1 |
| `credential_results` | ~200 bytes per credential | 1–5 |
| Redis: downloaded files (DID doc, VCs, VPs) | ~1–5 KB per file | 2–6 |

**At scale:**

| DIDs | PostgreSQL (facts only) | Redis (downloaded files) |
|------|------------------------|--------------------------|
| 100K | ~30–100 MB | ~100–300 MB |
| 1M | ~100–300 MB | ~1–3 GB |
| 10M | ~1–3 GB | ~10–30 GB (or Redis Cluster) |

Redis memory depends on how many downloaded files are actively cached (TTL eviction prunes inactive entries). For >5M active DIDs, use **Redis Cluster** to shard across nodes. PostgreSQL storage is bounded by `VACUUM` and partial indexes. Indexer data is never stored locally.

### 5.3 Indexer Call Optimization

- **Batch on sync**: during incremental sync, fetch all changes for a block in one `listChanges` call, then batch-fetch affected entities.
- **Parallel fetches**: for a single Q1 evaluation with N credentials, fetch all N permission chains from the Indexer in parallel (`Promise.all`).
- **Schema stability**: credential schemas change rarely — the Indexer serves them from its own cache in <1ms.
- **Permission chain sharing**: many credentials share the same ISSUER_GRANTOR → ECOSYSTEM chain. Within a single request, memoize Indexer responses to avoid duplicate calls.

### 5.4 PostgreSQL Tuning

- **Connection pooling**: PgBouncer in transaction mode, or built-in pool (`pg` pool size = 2× CPU cores per instance).
- **Partial indexes**: `idx_trust_expires` only indexes rows where `expires_at <= NOW()`, keeping the index small.
- **Narrow rows**: `trust_results` has no JSONB — only scalar columns (~100 bytes/row). Scans for TTL refresh are fast even at millions of rows.
- **Read replicas**: for extreme read loads, point reader instances to PostgreSQL streaming replicas for cache-miss fallback.
- **Autovacuum tuning**: increase `autovacuum_vacuum_scale_factor` for large tables to avoid frequent vacuums during ingestion bursts.

### 5.5 Redis Strategy

Redis caches only **downloaded external files** (DID docs, VPs, VCs) used during Q1 evaluation and Q2/Q3 credential verification. No Indexer data is stored in Redis.

- **Write-through on ingestion**: after downloading files during Pass1, the leader SETs them in Redis with `CACHE_TTL`.
- **TTL eviction**: Redis keys use native `EXPIRE` set to `CACHE_TTL`. No manual eviction logic needed. Inactive entries are automatically pruned.
- **Pipeline batching**: during ingestion, the leader uses Redis `PIPELINE` to batch SET commands (e.g., 100 keys per pipeline) — reduces round trips.
- **Invalidation**: when a DID’s documents change (detected via block change), the leader DELETEs stale Redis keys and re-downloads.
- **Fallback**: if Redis is temporarily unreachable, instances re-download files from their sources. Redis is a performance optimization, not a correctness requirement.

### 5.6 Horizontal Throughput

| Instances | Q1 summary QPS (PG only) | Q4 QPS (Indexer only) |
|-----------|--------------------------|------------------------|
| 1 | ~5,000–10,000 | ~2,000–5,000 |
| 3 | ~15,000–30,000 | ~6,000–15,000 |
| 10 | ~50,000–100,000 | ~20,000–50,000 |

- **Q1 summary** is a single PostgreSQL row lookup (~100 bytes) — no Redis, no Indexer. Extremely fast.
- **Q1 full** adds credential_results rows from PG — still sub-5ms.
- **Q2/Q3** involve Redis file reads + Indexer hot queries — sub-10ms warm.
- **Q4** is pure Indexer — throughput limited by Indexer capacity.
- PostgreSQL read replicas add Q1 throughput for high-load scenarios.

---

## Phase 6: REST API Layer

### 6.1 Endpoints

| Method | Path | Maps to |
|--------|------|---------|
| GET | `/v1/trust/resolve` | Q1 |
| GET | `/v1/trust/issuer-authorization` | Q2 |
| GET | `/v1/trust/verifier-authorization` | Q3 |
| GET | `/v1/trust/ecosystem-participant` | Q4 |
| GET | `/v1/health` | Liveness + `lastProcessedBlock` |

### 6.2 Common Response Headers

- `X-Evaluated-At-Block`: the block height at which the result was evaluated.
- `X-Cache-Hit`: `true` if served from cache, `false` if freshly computed.

### 6.3 Error Responses

- `400` — invalid parameters.
- `402` — payment required (Q2/Q3 when fees are enabled but no `sessionId`).
- `404` — DID not found or not resolvable.
- `500` — internal error.
- `503` — resolver not yet synced (initial sync in progress).

---

## Phase 7: Testing

### 7.1 Unit Tests

- VS-REQ-2/3/4 evaluation logic (all cases from trust-resolution.md).
- Permission chain building (ISSUER → ISSUER_GRANTOR → ECOSYSTEM, ISSUER → ECOSYSTEM).
- Effective issuance time determination (W3C digestSRI, AnonCreds current).
- Fee calculation and session verification.
- Cycle detection in recursive resolution.
- Cache TTL expiry and eviction.

### 7.2 Integration Tests

- Mock Indexer returning fixture data.
- Full Q1–Q4 request/response validation against trust-resolution.md examples.
- Polling loop with simulated block progression.
- Retry behavior for failed dereferencing.

### 7.3 Performance Tests

- Benchmark Q1 summary latency (target: <1ms from PG).
- Benchmark Q1 full latency (target: <5ms from PG).
- Benchmark Q2/Q3 latency (target: <10ms warm, <2s cold).
- Benchmark Q4 latency (target: <5ms, pure Indexer).
- PostgreSQL query latency and DB size at 100K / 1M / 10M DIDs.
- Redis file cache hit ratio under realistic query distributions (Zipf).
- Horizontal throughput: QPS scaling with 1 / 3 / 10 reader instances.
- Indexer call count per ingestion cycle.
- Polling loop throughput: blocks/second during incremental sync.
- Leader failover time: seconds to acquire lock and resume ingestion.

---

## Implementation Order

| Step | Description | Dependencies |
|------|-------------|-------------|
| 1 | Project bootstrap + config | — |
| 2 | PostgreSQL schema + migrations | 1 |
| 3 | Redis client + downloaded file cache (DID docs, VPs, VCs) | 2 |
| 4 | Indexer client (typed, hot queries — no local caching) | 3 |
| 5 | DID resolution + VP/VC dereferencing | 3 |
| 6 | Q1 core: `resolveTrust` algorithm | 4, 5 |
| 7 | Q1 REST endpoint (`/v1/trust/resolve`) | 6 |
| 8 | Polling loop + Pass1/Pass2 + leader election | 4, 6 |
| 9 | Q2 endpoint (issuer authorization) | 6, 7 |
| 10 | Q3 endpoint (verifier authorization) | 6, 7 |
| 11 | Q4 endpoint (ecosystem participant) | 6, 7 |
| 12 | Retry subsystem | 8 |
| 13 | Health endpoint + observability | 8 |
| 14 | Integration tests | 7–11 |
| 15 | Horizontal scaling tests (multi-instance, leader failover) | 14 |
| 16 | Performance benchmarks (100K–10M DIDs, 1–10 instances) | 15 |

---

EOF
