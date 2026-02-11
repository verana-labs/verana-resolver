# Verana Trust Resolver - TypeScript Implementation Plan

## Version 0.1 (Draft)

**Author**: Cascade AI  
**Date**: February 2026  
**Status**: Proposal

---

## 1. Executive Summary

This document outlines the implementation plan for the **Verana Trust Resolver Container** in TypeScript. The resolver is a core infrastructure component that ingests state from the Verana Indexer, resolves DIDs, dereferences verifiable credentials, validates trust according to the Verifiable Trust Specification, and exposes a GraphQL API for querying trusted services and ecosystems.

### Key Design Principles

- **Deterministic Processing**: Block-by-block ingestion with strict ordering
- **TTL-Based Caching**: Separate caches for dereferenced objects and trust evaluations
- **Consistency Guarantees**: GraphQL only exposes fully processed block state
- **Resilient Retry Logic**: Graceful handling of transient failures
- **Modular Architecture**: Clean separation of concerns for testability and maintainability

---

## 2. High-Level Architecture

```mermaid
flowchart TB
    subgraph External["External Systems"]
        IDX[("Verana Indexer<br/>(REST API)")]
        DID[("DID Resolvers<br/>(did:web, did:webvh, etc.)")]
        EXT[("External Resources<br/>(VCs, VPs, JSON Schemas)")]
    end

    subgraph Resolver["Verana Trust Resolver Container"]
        subgraph Ingestion["Ingestion Layer"]
            POLL[Polling Engine]
            SYNC[Block Sync Manager]
        end

        subgraph Processing["Processing Pipeline"]
            P1[Pass1: Cache & Dereference]
            P2[Pass2: Trust Evaluation]
            RETRY[Retry Manager]
        end

        subgraph Cache["Caching Layer"]
            OBJ_CACHE[(Object Cache<br/>CACHE_TTL)]
            TRUST_CACHE[(Trust Cache<br/>TRUST_TTL)]
        end

        subgraph Storage["Storage Layer"]
            DB[(PostgreSQL<br/>Local Projection)]
            BLOB[(Blob Store<br/>S3 / Filesystem)]
        end

        subgraph API["API Layer"]
            GQL[GraphQL Server]
        end
    end

    subgraph Clients["Clients"]
        APP[Applications]
        UI[Web UI]
    end

    IDX --> POLL
    POLL --> SYNC
    SYNC --> P1
    P1 --> DID
    P1 --> EXT
    P1 --> OBJ_CACHE
    P1 --> BLOB
    P1 --> P2
    P2 --> TRUST_CACHE
    P2 --> DB
    RETRY --> P1
    RETRY --> P2
    DB --> GQL
    GQL --> APP
    GQL --> UI
```

---

## 3. Component Architecture

```mermaid
flowchart LR
    subgraph Core["@verana/resolver-core"]
        CONFIG[ConfigService]
        LOGGER[LoggerService]
        METRICS[MetricsService]
    end

    subgraph Indexer["@verana/indexer-client"]
        IDX_CLIENT[IndexerClient]
        IDX_TYPES[IndexerTypes]
    end

    subgraph DID["@verana/did-resolver"]
        DID_RES[DIDResolver]
        DID_DOC[DIDDocumentParser]
        VP_DEREF[LinkedVPDereferencer]
    end

    subgraph Trust["@verana/trust-engine"]
        EVAL[TrustEvaluator]
        RULES[TrustRules]
        PERM[PermissionValidator]
        VTJSC_V[VTJSCValidator]
        FMT[FormatHandlers<br/>W3C / AnonCreds]
    end

    subgraph Cache["@verana/cache"]
        OBJ[ObjectCache]
        TRUST[TrustCache]
        RETRY_Q[RetryQueue]
    end

    subgraph Store["@verana/store"]
        REPO[Repositories]
        ENTITIES[Entities]
        MIGRATIONS[Migrations]
    end

    subgraph Blob["@verana/blob-store"]
        BLOB_SVC[BlobService]
        BLOB_S3[S3Adapter]
        BLOB_FS[FilesystemAdapter]
    end

    subgraph GraphQL["@verana/graphql"]
        SCHEMA[Schema]
        RESOLVERS[Resolvers]
        LOADERS[DataLoaders]
    end

    subgraph App["@verana/resolver-app"]
        MAIN[Main]
        PIPELINE[Pipeline]
        SCHEDULER[Scheduler]
    end

    Core --> App
    Indexer --> App
    DID --> App
    Trust --> App
    Cache --> App
    Store --> App
    Blob --> App
    GraphQL --> App
```

---

## 4. Module Breakdown

### 4.1 Core Modules

| Module | Responsibility |
|--------|----------------|
| `@verana/resolver-core` | Configuration, logging, metrics, shared utilities |
| `@verana/indexer-client` | HTTP client for Verana Indexer API |
| `@verana/did-resolver` | DID resolution, document parsing, linked-VP dereferencing |
| `@verana/trust-engine` | Trust evaluation logic per Verifiable Trust spec |
| `@verana/cache` | TTL-based caching for objects and trust results |
| `@verana/store` | PostgreSQL persistence layer (TypeORM) |
| `@verana/blob-store` | Content-addressed blob storage (S3 / filesystem) |
| `@verana/graphql` | GraphQL schema, resolvers, data loaders |
| `@verana/resolver-app` | Main application, pipeline orchestration |

### 4.2 Directory Structure

```
verana-resolver/
├── packages/
│   ├── core/                    # Shared utilities
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── logger/
│   │   │   ├── metrics/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── indexer-client/          # Indexer API client
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── did-resolver/            # DID resolution
│   │   ├── src/
│   │   │   ├── resolver.ts
│   │   │   ├── document-parser.ts
│   │   │   ├── linked-vp.ts
│   │   │   ├── methods/
│   │   │   │   ├── did-web.ts
│   │   │   │   └── did-webvh.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── trust-engine/            # Trust evaluation
│   │   ├── src/
│   │   │   ├── evaluator.ts
│   │   │   ├── rules/
│   │   │   │   ├── verifiable-service.ts
│   │   │   │   ├── credential-validation.ts
│   │   │   │   ├── vtjsc-validation.ts
│   │   │   │   ├── permission-check.ts
│   │   │   │   └── digest-computation.ts
│   │   │   ├── formats/
│   │   │   │   ├── w3c-vtc.ts
│   │   │   │   └── anoncreds-vtc.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── blob-store/              # Content-addressed blob storage
│   │   ├── src/
│   │   │   ├── blob-service.ts
│   │   │   ├── adapters/
│   │   │   │   ├── s3.adapter.ts
│   │   │   │   └── filesystem.adapter.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── cache/                   # Caching layer
│   │   ├── src/
│   │   │   ├── object-cache.ts
│   │   │   ├── trust-cache.ts
│   │   │   ├── retry-queue.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── store/                   # Database layer
│   │   ├── src/
│   │   │   ├── entities/
│   │   │   │   ├── service.entity.ts
│   │   │   │   ├── ecosystem.entity.ts
│   │   │   │   ├── credential.entity.ts
│   │   │   │   ├── credential-schema.entity.ts
│   │   │   │   ├── permission.entity.ts
│   │   │   │   ├── did-document.entity.ts
│   │   │   │   └── sync-state.entity.ts
│   │   │   ├── repositories/
│   │   │   ├── migrations/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── graphql/                 # GraphQL API
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── types/
│   │   │   │   ├── queries/
│   │   │   │   └── schema.graphql
│   │   │   ├── resolvers/
│   │   │   ├── loaders/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── app/                     # Main application
│       ├── src/
│       │   ├── pipeline/
│       │   │   ├── pass1.ts
│       │   │   ├── pass2.ts
│       │   │   └── index.ts
│       │   ├── scheduler/
│       │   ├── main.ts
│       │   └── index.ts
│       └── package.json
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## 5. Data Flow

### 5.1 Block Ingestion Flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant SyncManager
    participant Indexer
    participant Pass1
    participant Pass2
    participant Cache
    participant Store

    loop Every POLL_INTERVAL
        Scheduler->>SyncManager: triggerSync()
        SyncManager->>Store: getLastProcessedBlock()
        Store-->>SyncManager: lastBlock
        SyncManager->>Indexer: getBlockHeight()
        Indexer-->>SyncManager: currentHeight
        
        alt currentHeight > lastBlock
            loop For each block
                SyncManager->>Indexer: listChanges(blockHeight)
                Indexer-->>SyncManager: changes[]
                
                SyncManager->>Pass1: process(changes)
                Pass1->>Cache: invalidate(changedDIDs)
                Pass1->>Pass1: dereferenceDIDs()
                Pass1->>Pass1: dereferenceLinkedVPs()
                Pass1->>Cache: store(objects)
                Pass1-->>SyncManager: pass1Result
                
                SyncManager->>Pass2: evaluate(affectedDIDs)
                Pass2->>Cache: getTrustResult(did)
                Pass2->>Pass2: evaluateTrust()
                Pass2->>Store: updateIndex(trustResults)
                Pass2-->>SyncManager: pass2Result
                
                SyncManager->>Store: setLastProcessedBlock(blockHeight)
            end
        end
    end
```

### 5.2 Trust Evaluation Flow

```mermaid
flowchart TD
    START([Evaluate DID]) --> VISITED{In visitedDids?}
    VISITED -->|Yes| RETURN_VISITED([Return cached/in-progress result])
    VISITED -->|No| ADD_VISITED[Add to visitedDids]
    ADD_VISITED --> CHECK_CACHE{Trust Cache<br/>Valid?}
    CHECK_CACHE -->|Yes| RETURN_CACHED[Return Cached Result]
    CHECK_CACHE -->|No| RESOLVE_DID[Resolve DID Document]
    
    RESOLVE_DID --> PARSE_DOC[Parse DID Document]
    PARSE_DOC --> FIND_VP[Find linked-vp Services]
    
    FIND_VP --> DEREF_VP[Dereference VPs]
    DEREF_VP --> EXTRACT_VC[Extract VCs from VPs]
    
    EXTRACT_VC --> DETECT_FMT{Detect Credential Format}
    
    DETECT_FMT -->|W3C VTC| W3C_SIG[Verify signature via issuer DID Doc]
    DETECT_FMT -->|AnonCreds VTC| ANON_ZKP[Verify ZKP via Credential Definition]
    
    W3C_SIG --> W3C_VTJSC[Resolve VTJSC via credentialSchema.id]
    ANON_ZKP --> ANON_VTJSC[Resolve VTJSC via CredDef.relatedJsonSchemaCredentialId]
    
    W3C_VTJSC --> VERIFY_VTJSC[Verify VTJSC signature<br/>+ confirm Ecosystem DID owns CredentialSchema<br/>+ confirm VTJSC is in Ecosystem DID Doc]
    ANON_VTJSC --> VERIFY_VTJSC
    
    VERIFY_VTJSC --> CHECK_EXP[Check validUntil expiration]
    
    CHECK_EXP --> CHECK_PERM{Check Issuer Permission}
    CHECK_PERM -->|W3C| W3C_PERM[Compute digestSRI → Get Digest<br/>→ effective issuance time<br/>→ verify ISSUER perm at that time]
    CHECK_PERM -->|AnonCreds| ANON_PERM[Verify ISSUER perm currently active]
    
    W3C_PERM --> RECURSE_ISSUER[Recursively verify issuer DID as VS]
    ANON_PERM --> RECURSE_ISSUER
    RECURSE_ISSUER --> RECURSE_GRANTOR[Recursively verify grantor DIDs as VS]
    RECURSE_GRANTOR --> RECURSE_ECO[Verify Ecosystem DID as VS<br/>recursion terminates here]
    
    RECURSE_ECO --> VC_RESULT{All checks pass?}
    VC_RESULT -->|Yes| VC_VALID[Mark VC Valid → validCredentials]
    VC_RESULT -->|Optional VC fails| VC_IGNORED[Mark VC Ignored → ignoredCredentials]
    VC_RESULT -->|Required fails| VC_FAILED[Mark VC Failed → failedCredentials]
    
    VC_VALID --> COLLECT[Collect Results]
    VC_IGNORED --> COLLECT
    VC_FAILED --> COLLECT
    
    COLLECT --> CHECK_ECS{Has Required<br/>ECS Credentials?}
    CHECK_ECS -->|All required valid| TRUSTED[Status: TRUSTED]
    CHECK_ECS -->|Some valid, missing ECS| PARTIAL[Status: PARTIAL]
    CHECK_ECS -->|None valid| UNTRUSTED[Status: UNTRUSTED]
    
    TRUSTED --> CACHE_RESULT[Cache Trust Result<br/>trustEvaluatedAt + TRUST_TTL]
    PARTIAL --> CACHE_RESULT
    UNTRUSTED --> CACHE_RESULT
    
    CACHE_RESULT --> RETURN([Return TrustResolutionResult])
```

---

## 6. Technology Stack

### 6.1 Runtime & Language

| Technology | Purpose | Version |
|------------|---------|---------|
| Node.js | Runtime | 20 LTS |
| TypeScript | Language | 5.x |
| pnpm | Package manager | 8.x |
| Turborepo | Monorepo build | 2.x |

### 6.2 Core Dependencies

| Package | Purpose |
|---------|---------|
| `@apollo/server` | GraphQL server |
| `graphql` | GraphQL core |
| `typeorm` | Database ORM |
| `pg` | PostgreSQL driver |
| `redis` | Cache backend (mandatory) |
| `axios` | HTTP client |
| `zod` | Schema validation |
| `pino` | Structured logging |
| `@did-core/data-model` | DID data model types |
| `did-resolver` | Universal DID resolver |
| `@veramo/core` | VC/VP handling (JWT-VC + JSON-LD VC) |
| `@hyperledger/anoncreds-shared` | AnonCreds credential verification (ZKP) |
| `@aws-sdk/client-s3` | S3-compatible blob storage client |
| `canonicalize` | JCS canonicalization (RFC 8785) for digestSRI computation |
| `multiformats` | CID/multibase handling |
| `jose` | JWT/JWS verification |

### 6.3 Development Dependencies

| Package | Purpose |
|---------|---------|
| `vitest` | Testing framework |
| `tsx` | TypeScript execution |
| `eslint` | Linting |
| `prettier` | Code formatting |
| `typedoc` | Documentation generation |

### 6.4 Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | PostgreSQL 15+ | Local projection storage |
| Cache | Redis 7+ | Distributed caching (mandatory) |
| Blob Storage | S3-compatible / Filesystem | Content-addressed blob storage (MinIO for dev) |
| Container | Docker | Deployment |
| Orchestration | Docker Compose / K8s | Multi-container deployment |

---

## 7. Database Schema

### 7.1 Entity Relationship Diagram

```mermaid
erDiagram
    SyncState {
        string id PK
        bigint lastProcessedBlock
        timestamp updatedAt
    }

    Service {
        string did PK
        string displayName
        string description
        jsonb metadata
        string trustStatus
        boolean production
        timestamp trustEvaluatedAt
        timestamp trustExpiresAt
        bigint blockHeight
        timestamp createdAt
        timestamp updatedAt
    }

    Ecosystem {
        string did PK
        bigint trustRegistryId
        string name
        string description
        jsonb governanceFramework
        decimal totalDeposit
        bigint blockHeight
        timestamp createdAt
        timestamp updatedAt
    }

    Credential {
        string id PK
        string subjectDid FK
        string issuerDid FK
        string ecosystemDid FK
        string vtjscId
        bigint schemaId
        string type
        string format
        jsonb claims
        string status
        timestamp issuedAt
        timestamp validUntil
        timestamp effectiveIssuanceTime
        string digestSri
        timestamp createdAt
    }

    Permission {
        bigint id PK
        bigint schemaId
        string did
        string type
        string authorityAddress
        bigint validatorPermId
        timestamp effectiveFrom
        timestamp effectiveUntil
        string status
        bigint blockHeight
        timestamp createdAt
        timestamp updatedAt
    }

    CredentialSchema {
        bigint id PK
        bigint trustRegistryId FK
        string name
        jsonb jsonSchema
        string digestAlgorithm
        string issuerMode
        string verifierMode
        bigint blockHeight
        timestamp createdAt
        timestamp updatedAt
    }

    DIDDocument {
        string did PK
        jsonb document
        timestamp cachedAt
        timestamp expiresAt
    }

    CachedObject {
        string uri PK
        string type
        string blobKey
        bigint contentSize
        string digestSri
        timestamp cachedAt
        timestamp expiresAt
    }

    RetryQueue {
        string id PK
        string resourceType
        string resourceId
        string errorType
        string errorMessage
        timestamp firstFailureAt
        timestamp lastRetryAt
        int retryCount
    }

    Service ||--o{ Credential : "has"
    Service }o--o{ Ecosystem : "participates_in"
    Ecosystem ||--o{ CredentialSchema : "defines"
    CredentialSchema ||--o{ Permission : "has"
    Credential }o--|| Permission : "issued_under"
    Credential }o--o| Ecosystem : "belongs_to"
```

### 7.2 Core Tables

```sql
-- Sync state tracking
CREATE TABLE sync_state (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'main',
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Verified services index
CREATE TABLE services (
    did VARCHAR(500) PRIMARY KEY,
    display_name VARCHAR(255),
    description TEXT,
    metadata JSONB,
    location_country VARCHAR(100),
    location_region VARCHAR(100),
    location_city VARCHAR(100),
    trust_status VARCHAR(50) NOT NULL, -- TRUSTED, UNTRUSTED, PARTIAL
    production BOOLEAN DEFAULT FALSE,
    trust_evaluated_at TIMESTAMP WITH TIME ZONE,
    trust_expires_at TIMESTAMP WITH TIME ZONE,
    valid_credentials JSONB, -- array of credential summaries
    ignored_credentials JSONB,
    failed_credentials JSONB,
    block_height BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX idx_services_search ON services 
    USING GIN (to_tsvector('english', 
        coalesce(display_name, '') || ' ' || 
        coalesce(description, '') || ' ' ||
        coalesce(metadata::text, '')
    ));

CREATE INDEX idx_services_location ON services (location_country, location_region, location_city);
CREATE INDEX idx_services_trust_status ON services (trust_status);

-- Ecosystems
CREATE TABLE ecosystems (
    did VARCHAR(500) PRIMARY KEY,
    trust_registry_id BIGINT NOT NULL UNIQUE,
    name VARCHAR(255),
    description TEXT,
    governance_framework JSONB,
    total_deposit DECIMAL(30, 18),
    block_height BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credentials (flattened for querying)
CREATE TABLE credentials (
    id VARCHAR(500) PRIMARY KEY,
    subject_did VARCHAR(500) NOT NULL REFERENCES services(did) ON DELETE CASCADE,
    issuer_did VARCHAR(500) NOT NULL,
    issuer_perm_id BIGINT,
    schema_id BIGINT,
    schema_name VARCHAR(255),
    credential_format VARCHAR(50) NOT NULL, -- W3C_VTC, ANONCREDS_VTC
    credential_type VARCHAR(255),
    claims JSONB,
    status VARCHAR(50), -- VALID, EXPIRED, REVOKED, INVALID
    issued_at TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    effective_issuance_time TIMESTAMP WITH TIME ZONE, -- W3C VTC only, from Digest entry
    digest_sri VARCHAR(255), -- W3C VTC only, computed via JCS + digest_algorithm
    ecosystem_did VARCHAR(500) REFERENCES ecosystems(did),
    vtjsc_id VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_credentials_subject ON credentials (subject_did);
CREATE INDEX idx_credentials_issuer ON credentials (issuer_did);
CREATE INDEX idx_credentials_schema ON credentials (schema_id);
CREATE INDEX idx_credentials_format ON credentials (credential_format);
CREATE INDEX idx_credentials_ecosystem ON credentials (ecosystem_did);
CREATE INDEX idx_credentials_claims ON credentials USING GIN (claims);

-- Service-Ecosystem relationships
CREATE TABLE service_ecosystems (
    service_did VARCHAR(500) REFERENCES services(did) ON DELETE CASCADE,
    ecosystem_did VARCHAR(500) REFERENCES ecosystems(did) ON DELETE CASCADE,
    PRIMARY KEY (service_did, ecosystem_did)
);

-- Permissions cache
CREATE TABLE permissions (
    id BIGINT PRIMARY KEY,
    schema_id BIGINT NOT NULL,
    did VARCHAR(500),
    permission_type VARCHAR(50), -- ECOSYSTEM, ISSUER_GRANTOR, VERIFIER_GRANTOR, ISSUER, VERIFIER, HOLDER
    authority_address VARCHAR(100),
    validator_perm_id BIGINT,
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_until TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50), -- ACTIVE, REVOKED, SLASHED, EXPIRED
    block_height BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_permissions_did ON permissions (did);
CREATE INDEX idx_permissions_schema ON permissions (schema_id);
CREATE INDEX idx_permissions_type ON permissions (permission_type);

-- Credential schemas
CREATE TABLE credential_schemas (
    id BIGINT PRIMARY KEY,
    trust_registry_id BIGINT NOT NULL,
    name VARCHAR(255),
    json_schema JSONB,
    digest_algorithm VARCHAR(50), -- algorithm for computing digestSRI (from VPR CredentialSchema)
    issuer_mode VARCHAR(50),
    verifier_mode VARCHAR(50),
    block_height BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DID document cache
CREATE TABLE did_documents (
    did VARCHAR(500) PRIMARY KEY,
    document JSONB NOT NULL,
    cached_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Generic object cache (content stored in blob store)
CREATE TABLE cached_objects (
    uri VARCHAR(2000) PRIMARY KEY,
    object_type VARCHAR(100), -- VP, VC, JSON_SCHEMA, GOVERNANCE_DOC
    blob_key VARCHAR(500) NOT NULL, -- content-addressed key in blob store (sha256 hash)
    content_size BIGINT, -- size in bytes, for monitoring
    digest_sri VARCHAR(255),
    cached_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Retry queue
CREATE TABLE retry_queue (
    id VARCHAR(500) PRIMARY KEY,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(500) NOT NULL,
    error_type VARCHAR(100),
    error_message TEXT,
    first_failure_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    retry_count INT DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_retry_queue_next ON retry_queue (next_retry_at);

-- DID usage reverse index
CREATE TABLE did_usage (
    did VARCHAR(500) NOT NULL,
    role VARCHAR(50) NOT NULL, -- SERVICE, ISSUER, VERIFIER, ECOSYSTEM, GRANTOR, ISSUER_GRANTOR, VERIFIER_GRANTOR
    context_id VARCHAR(500), -- e.g., schema_id, ecosystem_did
    PRIMARY KEY (did, role, context_id)
);

CREATE INDEX idx_did_usage_did ON did_usage (did);
```

---

## 8. GraphQL Schema Design

### 8.1 Core Types

```graphql
# Pagination
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# Trust status enum
enum TrustStatus {
  TRUSTED
  UNTRUSTED
  PARTIAL
}

# Permission type enum
enum PermissionType {
  ECOSYSTEM
  ISSUER_GRANTOR
  VERIFIER_GRANTOR
  ISSUER
  VERIFIER
  HOLDER
}

# Service (Verifiable Service)
type Service {
  did: ID!
  displayName: String
  description: String
  metadata: JSON
  location: Location
  trustStatus: TrustStatus!
  production: Boolean!
  trustEvaluatedAt: DateTime
  validCredentials: [Credential!]!
  ignoredCredentials: [Credential!]!
  failedCredentials: [FailedCredential!]!
  ecosystems: [Ecosystem!]!
  roles: [DIDRole!]!
}

type ServiceEdge {
  cursor: String!
  node: Service!
}

type ServiceConnection {
  edges: [ServiceEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

# Location
type Location {
  country: String
  region: String
  city: String
  coordinates: Coordinates
}

type Coordinates {
  latitude: Float
  longitude: Float
}

# Ecosystem
type Ecosystem {
  did: ID!
  trustRegistryId: ID!
  name: String
  description: String
  governanceFramework: GovernanceFramework
  totalDeposit: String
  schemas: [CredentialSchema!]!
  participants: ParticipantConnection!
}

type EcosystemEdge {
  cursor: String!
  node: Ecosystem!
}

type EcosystemConnection {
  edges: [EcosystemEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

# Governance Framework
type GovernanceFramework {
  version: String
  url: String
  digest: String
  effectiveFrom: DateTime
}

# Credential Schema
type CredentialSchema {
  id: ID!
  name: String!
  jsonSchema: JSON!
  digestAlgorithm: String
  issuerMode: String!
  verifierMode: String!
  ecosystem: Ecosystem!
  issuers: PermissionConnection!
  verifiers: PermissionConnection!
}

# Credential format enum
enum CredentialFormat {
  W3C_VTC
  ANONCREDS_VTC
}

type Credential {
  id: ID!
  type: String!
  format: CredentialFormat!
  issuer: CredentialIssuer!
  subject: Service!
  schema: CredentialSchema
  ecosystem: Ecosystem
  claims: JSON!
  status: String!
  issuedAt: DateTime
  validUntil: DateTime
  effectiveIssuanceTime: DateTime
  digestSri: String
}

type CredentialIssuer {
  did: String!
  permission: Permission
}

type CredentialEdge {
  cursor: String!
  node: Credential!
}

type CredentialConnection {
  edges: [CredentialEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

# Permission
type Permission {
  id: ID!
  did: String!
  type: PermissionType!
  schema: CredentialSchema!
  effectiveFrom: DateTime
  effectiveUntil: DateTime
  status: String!
  validator: Permission
  issuedCount: Int
  verifiedCount: Int
}

type PermissionEdge {
  cursor: String!
  node: Permission!
}

type PermissionConnection {
  edges: [PermissionEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

# Participant (issuer/verifier in ecosystem)
type Participant {
  did: String!
  displayName: String
  permissions: [Permission!]!
  issuedCount: Int
  verifiedCount: Int
}

type ParticipantEdge {
  cursor: String!
  node: Participant!
}

type ParticipantConnection {
  edges: [ParticipantEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

# Failed credential (diagnostic)
type FailedCredential {
  id: String
  uri: String
  format: CredentialFormat
  error: String!
  errorCode: String!
}

type DIDRole {
  role: String!
  context: String
}

type DIDUsage {
  did: ID!
  roles: [DIDRole!]!
  asService: Service
  asEcosystem: Ecosystem
  permissions: [Permission!]!
}

# Sync info
type SyncInfo {
  lastProcessedBlock: Int!
  indexerBlock: Int!
  syncedAt: DateTime!
}
```

### 8.2 Queries

```graphql
type Query {
  # Services
  services(
    filter: ServiceFilter
    orderBy: ServiceOrderBy
    first: Int
    after: String
    last: Int
    before: String
    asOfBlockHeight: Int  # Historical query support
  ): ServiceConnection!

  service(did: ID!, asOfBlockHeight: Int): Service

  # Ecosystems
  ecosystems(
    filter: EcosystemFilter
    orderBy: EcosystemOrderBy
    first: Int
    after: String
    asOfBlockHeight: Int  # Historical query support
  ): EcosystemConnection!

  ecosystem(did: ID!, asOfBlockHeight: Int): Ecosystem
  ecosystemByRegistryId(trustRegistryId: ID!, asOfBlockHeight: Int): Ecosystem

  # Credentials
  credentials(
    filter: CredentialFilter
    first: Int
    after: String
    asOfBlockHeight: Int  # Historical query support
  ): CredentialConnection!

  credential(id: ID!, asOfBlockHeight: Int): Credential

  # DID usage
  didUsage(did: ID!, asOfBlockHeight: Int): DIDUsage

  # Search
  search(
    text: String!
    types: [SearchType!]
    first: Int
    after: String
    asOfBlockHeight: Int  # Historical query support
  ): SearchResultConnection!

  # Sync status
  syncInfo: SyncInfo!
}

# Filters
input ServiceFilter {
  did: ID
  trustStatus: TrustStatus
  production: Boolean
  ecosystemDid: ID
  schemaId: ID
  issuerDid: ID
  location: LocationFilter
  claims: ClaimFilter
}

input LocationFilter {
  country: String
  region: String
  city: String
}

input ClaimFilter {
  path: String!
  value: String!
  operator: ClaimOperator
}

enum ClaimOperator {
  EQUALS
  CONTAINS
  STARTS_WITH
}

input EcosystemFilter {
  did: ID
  name: String
  hasSchema: ID
}

input CredentialFilter {
  subjectDid: ID
  issuerDid: ID
  schemaId: ID
  ecosystemDid: ID
  format: CredentialFormat
  type: String
  status: String
}

# Order by
input ServiceOrderBy {
  field: ServiceOrderField!
  direction: OrderDirection!
}

enum ServiceOrderField {
  DISPLAY_NAME
  TRUST_EVALUATED_AT
  CREATED_AT
}

input EcosystemOrderBy {
  field: EcosystemOrderField!
  direction: OrderDirection!
}

enum EcosystemOrderField {
  NAME
  TOTAL_DEPOSIT
  CREATED_AT
}

enum OrderDirection {
  ASC
  DESC
}

# Search
enum SearchType {
  SERVICE
  ECOSYSTEM
  SCHEMA
  CREDENTIAL
}

union SearchResult = Service | Ecosystem | CredentialSchema | Credential

type SearchResultEdge {
  cursor: String!
  node: SearchResult!
  score: Float!
}

type SearchResultConnection {
  edges: [SearchResultEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}
```

---

## 9. Core Interfaces & Types

### 9.1 Configuration

```typescript
// packages/core/src/config/types.ts

export interface ResolverConfig {
  // Indexer
  indexer: {
    baseUrl: string;
    timeout: number;
  };

  // Polling
  pollInterval: number; // seconds
  
  // TTLs
  cacheTtl: number; // seconds - for dereferenced objects
  trustTtl: number; // seconds - for trust evaluations
  
  // Retry
  retryDays: number; // POLL_OBJECT_CACHING_RETRY_DAYS
  
  // Whitelists
  trustedVprs: TrustedVpr[];
  
  // Database
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  
  // Redis (mandatory)
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  
  // Blob storage (S3-compatible or local filesystem)
  blobStore: {
    backend: 's3' | 'filesystem';
    // S3 options
    s3?: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle?: boolean; // true for MinIO
    };
    // Filesystem options
    filesystem?: {
      basePath: string; // e.g., /data/blobs
    };
  };
  
  // GraphQL
  graphql: {
    port: number;
    playground: boolean;
  };
}

// WL-VPR: recognized VPRs and access endpoints
export interface TrustedVpr {
  id: string;
  indexerUrl: string;
  rpcEndpoint?: string;
  resolverEndpoint?: string;
  ecosystems: TrustedEcosystem[];
}

// WL-ECS: recognized ECS ecosystems per VPR
export interface TrustedEcosystem {
  did: string;
  ecsSchemaIds: string[]; // Essential Credential Schema IDs
}
```

### 9.2 Trust Engine Types

```typescript
// packages/trust-engine/src/types.ts

export type TrustStatus = 'TRUSTED' | 'UNTRUSTED' | 'PARTIAL';

export type CredentialFormat = 'W3C_VTC' | 'ANONCREDS_VTC';

export interface TrustResolutionResult {
  did: string;
  trustStatus: TrustStatus;
  production: boolean;
  validCredentials: ValidatedCredential[];
  ignoredCredentials: ValidatedCredential[];
  failedCredentials: FailedCredential[];
  ecosystems: string[]; // ecosystem DIDs
  evaluatedAt: Date;
  expiresAt: Date;
}

export interface ValidatedCredential {
  id: string;
  type: string;
  format: CredentialFormat;
  issuerDid: string;
  issuerPermissionId: number;
  schemaId: number;
  ecosystemDid: string; // Ecosystem DID that owns the CredentialSchema
  vtjscId: string; // ID of the authoritative VTJSC from Ecosystem DID Doc
  claims: Record<string, unknown>;
  issuedAt?: Date;
  validUntil?: Date;
  // W3C VTC only: effective issuance time from Digest entry
  effectiveIssuanceTime?: Date;
  digestSri?: string;
}

export interface FailedCredential {
  id?: string;
  uri?: string;
  format?: CredentialFormat;
  error: string;
  errorCode: string;
}

export interface PermissionValidationResult {
  valid: boolean;
  permissionId?: number;
  permissionType?: string;
  // For recursive VS verification of the permission holder
  holderIsVerifiableService: boolean;
  error?: string;
}

export interface VTJSCValidationResult {
  valid: boolean;
  vtjscId: string;
  ecosystemDid: string;
  credentialSchemaId: number;
  // Confirms VTJSC is presented in Ecosystem DID's DID Document
  presentedInEcosystemDidDoc: boolean;
  error?: string;
}
```

### 9.3 Indexer Client Types

```typescript
// packages/indexer-client/src/types.ts

export interface IndexerClient {
  getBlockHeight(): Promise<number>;
  
  listChanges(blockHeight: number): Promise<EntityChange[]>;
  
  getTrustRegistry(id: number, atBlockHeight?: number): Promise<TrustRegistry>;
  
  getCredentialSchema(id: number, atBlockHeight?: number): Promise<CredentialSchema>;
  
  getPermission(id: number, atBlockHeight?: number): Promise<Permission>;
  
  listPermissions(filter: PermissionFilter, atBlockHeight?: number): Promise<Permission[]>;
  
  getDIDDirectory(atBlockHeight?: number): Promise<DIDDirectoryEntry[]>;
  
  // Digest module — for W3C VTC effective issuance time determination
  getDigest(digestSri: string, schemaId: number): Promise<DigestEntry | null>;
}

export interface DigestEntry {
  id: number;
  schemaId: number;
  digestSri: string;
  creator: string;
  created: string; // ISO timestamp — this is the effective issuance time
}

export interface EntityChange {
  entityType: 'TrustRegistry' | 'CredentialSchema' | 'Permission' | 'DIDDirectory';
  entityId: string | number;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  blockHeight: number;
}

export interface TrustRegistry {
  id: number;
  did: string;
  name: string;
  governanceFramework: GovernanceFrameworkVersion;
  authority: string;
  created: string;
  modified: string;
  archived?: string;
}

export interface Permission {
  id: number;
  schemaId: number;
  did: string;
  type: string; // ECOSYSTEM, ISSUER_GRANTOR, VERIFIER_GRANTOR, ISSUER, VERIFIER, HOLDER
  authority: string;
  validatorPermId?: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
  status: string; // ACTIVE, REVOKED, SLASHED, EXPIRED
  revoked?: string;
  slashed?: string;
  deposit: string;
}

export interface CredentialSchema {
  id: number;
  trustRegistryId: number;
  name: string;
  jsonSchema: Record<string, unknown>;
  digestAlgorithm: string;
  issuerMode: string;
  verifierMode: string;
  created: string;
  modified: string;
}

export interface GovernanceFrameworkVersion {
  id: number;
  trustRegistryId: number;
  version: string;
  url: string;
  digest: string;
  effectiveFrom: string;
}

export interface DIDDirectoryEntry {
  did: string;
  blockHeight: number;
  changeType: 'ADD' | 'REMOVE';
}

export interface PermissionFilter {
  schemaId?: number;
  did?: string;
  type?: string;
  status?: string;
}
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

| Task | Description |
|------|-------------|
| Project setup | Monorepo structure, TypeScript config, CI/CD |
| Core module | Configuration, logging, metrics |
| Database schema | PostgreSQL schema, migrations, TypeORM entities |
| Indexer client | HTTP client for Verana Indexer API |

### Phase 2: Ingestion Pipeline (Weeks 3-4)

| Task | Description |
|------|-------------|
| Block sync manager | Initial sync + incremental sync logic |
| Pass1 implementation | Caching, DID resolution, VP dereferencing |
| Retry manager | Failure tracking and retry scheduling |
| Cache layer | Object cache with TTL, Redis integration |

### Phase 3: Trust Engine (Weeks 5-7)

| Task | Description |
|------|-------------|
| DID resolver | Multi-method DID resolution (did:web, did:webvh) |
| W3C VTC handler | Signature verification, JCS canonicalization, digestSRI computation, Digest query for effective issuance time |
| AnonCreds VTC handler | ZKP verification via Credential Definition, VTJSC resolution via `relatedJsonSchemaCredentialId` |
| VTJSC validator | Verify VTJSC signature, confirm Ecosystem DID ownership, confirm VTJSC is in Ecosystem DID Document |
| Permission validator | Issuer/Verifier/Grantor permission checking at block height (W3C) or current time (AnonCreds) |
| Recursive VS verifier | Verify all DIDs in trust chain (issuer, verifier, grantor, ecosystem) as Verifiable Services with `visitedDids` anti-recursion |
| Trust evaluator | Full trust resolution per VT spec [TR-1] through [TR-8] |

### Phase 4: GraphQL API (Weeks 8-9)

| Task | Description |
|------|-------------|
| Schema definition | Types, queries, filters |
| Resolvers | Query resolvers with DataLoader batching |
| Search | Full-text search implementation |
| Pagination | Cursor-based pagination |

### Phase 5: Testing & Hardening (Weeks 10-11)

| Task | Description |
|------|-------------|
| Unit tests | Core logic coverage |
| Integration tests | End-to-end pipeline tests |
| Load testing | Performance benchmarks |
| Documentation | API docs, deployment guide |

---

## 11. Deployment Architecture

> **Single-Writer Architecture**: One resolver instance handles block ingestion and writes to the primary database. Multiple read-replica resolver instances serve GraphQL queries for horizontal scaling.

```mermaid
flowchart TB
    subgraph K8s["Kubernetes Cluster"]
        subgraph Resolver["Resolver Deployment"]
            R1[resolver-writer<br/>Block Ingestion]
            R2[resolver-reader-1<br/>GraphQL Only]
            R3[resolver-reader-2<br/>GraphQL Only]
        end
        
        subgraph Data["Data Layer"]
            PG[(PostgreSQL<br/>Primary)]
            PG_R[(PostgreSQL<br/>Replica)]
            REDIS[(Redis<br/>Cache)]
            S3[(S3 / MinIO<br/>Blob Store)]
        end
        
        subgraph Ingress["Ingress"]
            LB[Load Balancer]
        end
    end
    
    subgraph External["External"]
        IDX[Verana Indexer]
        DID[DID Networks]
    end
    
    LB --> R2
    LB --> R3
    R1 --> PG
    R2 --> PG_R
    R3 --> PG_R
    R1 --> REDIS
    R2 --> REDIS
    R3 --> REDIS
    R1 --> S3
    R2 --> S3
    R3 --> S3
    R1 --> IDX
    R1 --> DID
    PG --> PG_R
```

### Docker Compose (Development)

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  resolver:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://verana:verana@postgres:5432/resolver
      - REDIS_URL=redis://redis:6379
      - INDEXER_URL=https://idx.testnet.verana.network
      - POLL_INTERVAL=5
      - CACHE_TTL=3600
      - TRUST_TTL=300
      - BLOB_STORE_BACKEND=s3
      - BLOB_STORE_S3_ENDPOINT=http://minio:9000
      - BLOB_STORE_S3_REGION=us-east-1
      - BLOB_STORE_S3_BUCKET=resolver-blobs
      - BLOB_STORE_S3_ACCESS_KEY=minioadmin
      - BLOB_STORE_S3_SECRET_KEY=minioadmin
      - BLOB_STORE_S3_FORCE_PATH_STYLE=true
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=verana
      - POSTGRES_PASSWORD=verana
      - POSTGRES_DB=resolver
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  postgres_data:
  minio_data:
```

---

## 12. Monitoring & Observability

### Metrics (Prometheus)

| Metric | Type | Description |
|--------|------|-------------|
| `resolver_blocks_processed_total` | Counter | Total blocks processed |
| `resolver_last_processed_block` | Gauge | Current sync position |
| `resolver_block_lag` | Gauge | Blocks behind indexer |
| `resolver_pass1_duration_seconds` | Histogram | Pass1 processing time |
| `resolver_pass2_duration_seconds` | Histogram | Pass2 processing time |
| `resolver_dereference_errors_total` | Counter | Dereferencing failures |
| `resolver_trust_evaluations_total` | Counter | Trust evaluations by status |
| `resolver_cache_hits_total` | Counter | Cache hit rate |
| `resolver_blob_store_size_bytes` | Gauge | Total blob store usage |
| `resolver_graphql_requests_total` | Counter | GraphQL queries |
| `resolver_graphql_duration_seconds` | Histogram | Query latency |

### Health Checks

```typescript
// GET /health
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    blobStore: 'ok' | 'error';
    indexer: 'ok' | 'error';
    sync: {
      lastProcessedBlock: number;
      indexerBlock: number;
      lag: number;
      status: 'synced' | 'syncing' | 'stale';
    };
  };
  uptime: number;
  version: string;
}
```

---

## 13. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Cache poisoning | Validate digest_sri for all external documents |
| DID spoofing | Verify DID document signatures per method spec |
| Credential forgery | Verify all VC/VP cryptographic proofs (W3C signatures + AnonCreds ZKPs) |
| VTJSC spoofing | Verify VTJSC is presented in Ecosystem DID's DID Document |
| SQL injection | Use parameterized queries (TypeORM) |
| DoS via GraphQL | Query complexity limits, depth limiting |
| Blob integrity | Verify blob content against stored SHA-256 blob_key on read |
| Data integrity | Atomic block processing with transactions |

---

## 14. Design Decisions

1. **Redis requirement**: **Mandatory** — Redis is required for distributed caching.
2. **DID methods**: Initial support for `did:web` and `did:webvh`.
3. **VC formats**: Support **both** JWT-VC and JSON-LD VC formats for W3C VTCs, plus AnonCreds VTCs with ZKP verification.
4. **Clustering**: **Single-writer architecture** — blocks are processed sequentially by a single writer instance. Read replicas handle GraphQL query load for horizontal scaling.
5. **Historical queries**: `asOfBlockHeight` argument supported in GraphQL from day one.
6. **Blob storage**: Dereferenced objects (DID documents, VPs, VCs, JSON Schemas, governance documents) are stored in an **external content-addressed blob store** (S3-compatible or local filesystem) rather than inline in PostgreSQL. The DB stores only a `blob_key` (SHA-256 hash) and `content_size`. This keeps the DB lean (~30 GB at 1M services) while blobs scale independently on cheap storage. Two adapters are provided: `S3Adapter` for production (S3, MinIO) and `FilesystemAdapter` for local development.

---

## 15. References

- [Verana Trust Resolver Spec](./spec.md)
- [Verifiable Trust Specification](https://verana-labs.github.io/verifiable-trust-spec/)
- [VPR Specification](https://verana-labs.github.io/verifiable-trust-vpr-spec/)
- [Verana Indexer API](https://idx.testnet.verana.network/)
- [DID Core Specification](https://www.w3.org/TR/did-core/)
- [Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model-2.0/)
- [Linked VP Specification](https://identity.foundation/linked-vp/)
