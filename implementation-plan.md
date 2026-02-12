# Verana Trust Resolver - TypeScript Implementation Plan

## Version 0.1 (Draft)

**Author**: Cascade AI  
**Date**: February 2026  
**Status**: Proposal

---

## 1. Executive Summary

This document outlines the implementation plan for the **Verana Trust Resolver Container** in TypeScript. The resolver is a core infrastructure component that ingests state from the Verana Indexer (REST API defined in `openapi-indexer.json`), resolves DIDs, dereferences verifiable credentials, validates trust according to the Verifiable Trust Specification, and exposes a GraphQL API for querying trusted services and ecosystems.

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
│   │   │   │   ├── schema-authorization-policy.entity.ts
│   │   │   │   ├── permission.entity.ts
│   │   │   │   ├── permission-session.entity.ts
│   │   │   │   ├── did-document.entity.ts
│   │   │   │   ├── block-timestamp.entity.ts
│   │   │   │   ├── did-usage.entity.ts
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
    participant RetryMgr
    participant Cache
    participant Store

    loop Every POLL_INTERVAL
        Scheduler->>SyncManager: triggerSync()
        SyncManager->>Store: getLastProcessedBlock()
        Store-->>SyncManager: lastBlock
        SyncManager->>Indexer: getBlockHeight()
        Indexer-->>SyncManager: currentHeight
        
        alt lastBlock == null (Initial Sync per spec §8.2)
            Note over SyncManager,Indexer: Bulk fetch all entities at currentHeight
            SyncManager->>Indexer: listTrustRegistries(atBlockHeight: currentHeight)
            SyncManager->>Indexer: listCredentialSchemas(atBlockHeight: currentHeight)
            SyncManager->>Indexer: listPermissions(atBlockHeight: currentHeight)
            Indexer-->>SyncManager: allEntities

            SyncManager->>Pass1: processAll(allEntities, currentHeight)
            Pass1->>Pass1: dereferenceDIDs()
            Pass1->>Pass1: dereferenceLinkedVPs()
            Pass1->>Store: upsert permissions + did_usage
            Pass1->>Cache: store(objects)
            Pass1->>RetryMgr: trackFailures(pass1Failures)
            Pass1-->>SyncManager: pass1Result

            SyncManager->>Pass2: evaluateAll(allDIDs)
            Pass2->>Pass2: evaluateTrust()
            Pass2->>Store: updateIndex(trustResults)
            Pass2->>RetryMgr: trackFailures(pass2Failures)
            Pass2-->>SyncManager: pass2Result

            SyncManager->>Store: recordBlockTimestamp(currentHeight, blockTime)
            SyncManager->>Store: setLastProcessedBlock(currentHeight)

        else currentHeight > lastBlock (Incremental Sync per spec §8.3)
            loop For each block (lastBlock+1 .. currentHeight)
                SyncManager->>Indexer: listChanges(blockHeight)
                Indexer-->>SyncManager: changes[]
                
                SyncManager->>Pass1: process(changes)
                Pass1->>Cache: invalidate(changedDIDs)
                Pass1->>Pass1: dereferenceDIDs()
                Pass1->>Pass1: dereferenceLinkedVPs()
                Pass1->>Store: upsert changed entities + did_usage
                Pass1->>Cache: store(objects)
                Pass1-->>SyncManager: pass1Result

                SyncManager->>RetryMgr: retryEligiblePass1Failures()
                RetryMgr-->>SyncManager: retryResults
                
                SyncManager->>Pass2: evaluate(affectedDIDs)
                Pass2->>Cache: getTrustResult(did)
                Pass2->>Pass2: evaluateTrust()
                Pass2->>Store: updateIndex(trustResults)
                Pass2-->>SyncManager: pass2Result

                SyncManager->>RetryMgr: retryEligiblePass2Failures()
                RetryMgr-->>SyncManager: retryResults
                
                SyncManager->>Store: recordBlockTimestamp(blockHeight, blockTime)
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
    CHECK_CACHE -->|No| DID_CACHE{DID Doc Cached<br/>& within CACHE_TTL?}
    
    DID_CACHE -->|Yes| PARSE_DOC[Parse DID Document]
    DID_CACHE -->|No| RESOLVE_DID[Resolve DID via Network]
    RESOLVE_DID --> STORE_DID[Store in did_documents cache]
    STORE_DID --> PARSE_DOC
    
    PARSE_DOC --> FIND_VP[Find linked-vp Services]
    
    FIND_VP --> VP_CACHE{VP/VC Cached<br/>& within CACHE_TTL?}
    VP_CACHE -->|Yes| EXTRACT_VC[Extract VCs from Cached VPs]
    VP_CACHE -->|No| DEREF_VP[Dereference VPs via Network]
    DEREF_VP --> STORE_VP[Store in Blob Store +<br/>cached_objects metadata]
    STORE_VP --> EXTRACT_VC
    
    EXTRACT_VC --> DETECT_FMT{Detect Credential Format}
    
    DETECT_FMT -->|W3C VTC| W3C_SIG[Verify signature via issuer DID Doc]
    DETECT_FMT -->|AnonCreds VTC| ANON_ZKP[Verify ZKP via Credential Definition]
    
    W3C_SIG --> W3C_VTJSC[Resolve VTJSC via credentialSchema.id]
    ANON_ZKP --> ANON_VTJSC[Resolve VTJSC via CredDef.relatedJsonSchemaCredentialId]
    
    W3C_VTJSC --> VERIFY_VTJSC[Verify VTJSC signature<br/>+ confirm Ecosystem DID owns CredentialSchema<br/>+ confirm VTJSC is in Ecosystem DID Doc]
    ANON_VTJSC --> VERIFY_VTJSC
    
    VERIFY_VTJSC --> CHECK_EXP[Check validUntil expiration]
    
    CHECK_EXP --> CHECK_PERM{Check Issuer Permission<br/>from local permissions index}
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

    BlockTimestamp {
        bigint blockHeight PK
        timestamp blockTime
    }

    Service {
        string did PK
        string displayName
        string description
        jsonb metadata
        string locationCountry
        string locationRegion
        string locationCity
        string trustStatus
        boolean production
        timestamp trustEvaluatedAt
        timestamp trustExpiresAt
        jsonb validCredentials
        jsonb ignoredCredentials
        jsonb failedCredentials
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
        bigint issuerPermId
        string ecosystemDid FK
        string vtjscId
        bigint schemaId
        string schemaName
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
        bigint schemaId FK
        string type
        string did
        string grantee
        string createdBy
        timestamp created
        timestamp modified
        timestamp effectiveFrom
        timestamp effectiveUntil
        timestamp revoked
        string revokedBy
        timestamp extended
        string extendedBy
        timestamp slashed
        string slashedBy
        timestamp repaid
        string repaidBy
        string country
        string validationFees
        string issuanceFees
        string verificationFees
        string deposit
        string slashedDeposit
        string repaidDeposit
        bigint validatorPermId FK
        string vpState
        timestamp vpLastStateChange
        string vpCurrentFees
        string vpCurrentDeposit
        string vpSummaryDigestSri
        timestamp vpExp
        string vpValidatorDeposit
        timestamp adjusted
        string issuanceFeeDiscount
        string verificationFeeDiscount
        boolean vsOperatorAuthzEnabled
        string vsOperatorAuthzSpendPeriod
        string vsOperatorAuthzSpendLimit
        boolean vsOperatorAuthzWithFeegrant
        string vsOperatorAuthzFeeSpendLimit
        string permState
        bigint blockHeight
    }

    CredentialSchema {
        bigint id PK
        bigint trId FK
        text jsonSchema
        string deposit
        integer issuerGrantorValidationValidityPeriod
        integer verifierGrantorValidationValidityPeriod
        integer issuerValidationValidityPeriod
        integer verifierValidationValidityPeriod
        integer holderValidationValidityPeriod
        string issuerPermManagementMode
        string verifierPermManagementMode
        string pricingAssetType
        string pricingAsset
        string digestAlgorithm
        timestamp archived
        timestamp created
        timestamp modified
        bigint blockHeight
    }

    SchemaAuthorizationPolicy {
        bigint id PK
        bigint schemaId FK
        string role
        integer version
        string url
        string digestSri
        timestamp created
        timestamp effectiveFrom
        timestamp effectiveUntil
        boolean revoked
        bigint blockHeight
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
        timestamp nextRetryAt
    }

    OperatorAuthorization {
        string authority
        string operator
        string[] msgTypes
        string spendLimit
        string feeSpendLimit
        timestamp expiration
        string period
        bigint blockHeight
    }

    VSOperatorAuthorization {
        string authority
        string vsOperator
        bigint[] permissions
        bigint blockHeight
    }

    Service ||--o{ Credential : "has"
    Service }o--o{ Ecosystem : "participates_in"
    Service ||--o{ Permission : "holds"
    Ecosystem ||--o{ CredentialSchema : "defines"
    CredentialSchema ||--o{ Permission : "has"
    CredentialSchema ||--o{ SchemaAuthorizationPolicy : "has"
    Permission }o--o| Permission : "validated_by"
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

-- Block height to timestamp mapping (recorded during ingestion)
CREATE TABLE block_timestamps (
    block_height BIGINT PRIMARY KEY,
    block_time TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_block_timestamps_time ON block_timestamps (block_time);

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

-- Permissions (mirrors indexer Permission schema)
CREATE TABLE permissions (
    id BIGINT PRIMARY KEY,
    schema_id BIGINT NOT NULL,
    type VARCHAR(50) NOT NULL,           -- ECOSYSTEM, ISSUER_GRANTOR, VERIFIER_GRANTOR, ISSUER, VERIFIER, HOLDER
    did VARCHAR(500),
    grantee VARCHAR(200) NOT NULL,
    created_by VARCHAR(200),
    created TIMESTAMP WITH TIME ZONE NOT NULL,
    modified TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_until TIMESTAMP WITH TIME ZONE,
    revoked TIMESTAMP WITH TIME ZONE,
    revoked_by VARCHAR(200),
    extended TIMESTAMP WITH TIME ZONE,
    extended_by VARCHAR(200),
    slashed TIMESTAMP WITH TIME ZONE,
    slashed_by VARCHAR(200),
    repaid TIMESTAMP WITH TIME ZONE,
    repaid_by VARCHAR(200),
    country VARCHAR(10),
    validation_fees VARCHAR(100),
    issuance_fees VARCHAR(100),
    verification_fees VARCHAR(100),
    deposit VARCHAR(100),
    slashed_deposit VARCHAR(100),
    repaid_deposit VARCHAR(100),
    validator_perm_id BIGINT,
    -- Validation Process (VP) state
    vp_state VARCHAR(50),                -- PENDING, VALIDATED, TERMINATED
    vp_last_state_change TIMESTAMP WITH TIME ZONE,
    vp_current_fees VARCHAR(100),
    vp_current_deposit VARCHAR(100),
    vp_summary_digest_sri VARCHAR(255),
    vp_exp TIMESTAMP WITH TIME ZONE,
    vp_validator_deposit VARCHAR(100),
    -- VPR spec fields
    adjusted TIMESTAMP WITH TIME ZONE,
    issuance_fee_discount VARCHAR(100),
    verification_fee_discount VARCHAR(100),
    vs_operator_authz_enabled BOOLEAN,
    vs_operator_authz_spend_period VARCHAR(100),
    vs_operator_authz_spend_limit VARCHAR(255),
    vs_operator_authz_with_feegrant BOOLEAN,
    vs_operator_authz_fee_spend_limit VARCHAR(255),
    -- Indexer-computed derived state
    perm_state VARCHAR(50),              -- REPAID, SLASHED, REVOKED, EXPIRED, ACTIVE, FUTURE, INACTIVE
    block_height BIGINT NOT NULL
);

CREATE INDEX idx_permissions_did ON permissions (did);
CREATE INDEX idx_permissions_grantee ON permissions (grantee);
CREATE INDEX idx_permissions_schema ON permissions (schema_id);
CREATE INDEX idx_permissions_type ON permissions (type);
CREATE INDEX idx_permissions_perm_state ON permissions (perm_state);
CREATE INDEX idx_permissions_vp_state ON permissions (vp_state);

-- Credential schemas (mirrors indexer CredentialSchema schema)
CREATE TABLE credential_schemas (
    id BIGINT PRIMARY KEY,
    tr_id BIGINT NOT NULL,
    json_schema TEXT,
    deposit VARCHAR(100),
    issuer_grantor_validation_validity_period INTEGER,
    verifier_grantor_validation_validity_period INTEGER,
    issuer_validation_validity_period INTEGER,
    verifier_validation_validity_period INTEGER,
    holder_validation_validity_period INTEGER,
    issuer_perm_management_mode VARCHAR(50), -- OPEN, ECOSYSTEM, GRANTOR_VALIDATION
    verifier_perm_management_mode VARCHAR(50),
    pricing_asset_type VARCHAR(20),  -- TU, COIN, FIAT (v4)
    pricing_asset VARCHAR(50),       -- e.g. 'tu', 'uvna', 'EUR' (v4)
    digest_algorithm VARCHAR(50),    -- algorithm for computing digestSRI (v4)
    archived TIMESTAMP WITH TIME ZONE,
    created TIMESTAMP WITH TIME ZONE NOT NULL,
    modified TIMESTAMP WITH TIME ZONE NOT NULL,
    block_height BIGINT NOT NULL
);

-- Schema Authorization Policies (v4 new — MOD-CS-QRY-5/6)
CREATE TABLE schema_authorization_policies (
    id BIGINT PRIMARY KEY,
    schema_id BIGINT NOT NULL REFERENCES credential_schemas(id),
    role VARCHAR(20) NOT NULL,       -- ISSUER, VERIFIER
    version INTEGER NOT NULL,
    url TEXT NOT NULL,
    digest_sri VARCHAR(255) NOT NULL,
    created TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_until TIMESTAMP WITH TIME ZONE,
    revoked BOOLEAN DEFAULT FALSE,
    block_height BIGINT NOT NULL
);

CREATE INDEX idx_sap_schema_role ON schema_authorization_policies (schema_id, role);

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
    role VARCHAR(50) NOT NULL, -- SERVICE, ISSUER, VERIFIER, ECOSYSTEM, ISSUER_GRANTOR, VERIFIER_GRANTOR, HOLDER
    context_id VARCHAR(500), -- e.g., schema_id, ecosystem_did
    PRIMARY KEY (did, role, context_id)
);

CREATE INDEX idx_did_usage_did ON did_usage (did);

-- Operator Authorizations
CREATE TABLE operator_authorizations (
    authority VARCHAR(500) NOT NULL,
    operator VARCHAR(500) NOT NULL,
    msg_types TEXT[] NOT NULL,
    spend_limit VARCHAR(255),
    fee_spend_limit VARCHAR(255),
    expiration TIMESTAMP WITH TIME ZONE,
    period VARCHAR(100),
    block_height BIGINT NOT NULL,
    PRIMARY KEY (authority, operator)
);

CREATE INDEX idx_operator_authz_authority ON operator_authorizations (authority);
CREATE INDEX idx_operator_authz_operator ON operator_authorizations (operator);

-- VS Operator Authorizations
CREATE TABLE vs_operator_authorizations (
    authority VARCHAR(500) NOT NULL,
    vs_operator VARCHAR(500) NOT NULL,
    permissions BIGINT[] NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (authority, vs_operator)
);

CREATE INDEX idx_vs_operator_authz_authority ON vs_operator_authorizations (authority);
CREATE INDEX idx_vs_operator_authz_vs_operator ON vs_operator_authorizations (vs_operator);
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
  trustExpiresAt: DateTime
  validCredentials: [Credential!]!
  ignoredCredentials: [Credential!]!
  failedCredentials: [FailedCredential!]!
  ecosystems: [Ecosystem!]!
  permissions: [Permission!]!
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

# Credential Schema (mirrors indexer CredentialSchema + v4 fields)
type CredentialSchema {
  id: ID!
  trId: ID!
  jsonSchema: String
  deposit: String
  issuerGrantorValidationValidityPeriod: Int
  verifierGrantorValidationValidityPeriod: Int
  issuerValidationValidityPeriod: Int
  verifierValidationValidityPeriod: Int
  holderValidationValidityPeriod: Int
  issuerPermManagementMode: String!
  verifierPermManagementMode: String!
  pricingAssetType: String       # TU, COIN, FIAT (v4)
  pricingAsset: String           # e.g. 'tu', 'uvna', 'EUR' (v4)
  digestAlgorithm: String        # v4
  archived: DateTime
  created: DateTime!
  modified: DateTime!
  ecosystem: Ecosystem!
  issuers: PermissionConnection!
  verifiers: PermissionConnection!
  authorizationPolicies: [SchemaAuthorizationPolicy!]!
}

# Schema Authorization Policy (v4 new)
type SchemaAuthorizationPolicy {
  id: ID!
  schemaId: ID!
  role: String!                  # ISSUER, VERIFIER
  version: Int!
  url: String!
  digestSri: String!
  created: DateTime!
  effectiveFrom: DateTime
  effectiveUntil: DateTime
  revoked: Boolean!
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
  vtjscId: String
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

# Permission (mirrors indexer Permission schema)
type Permission {
  id: ID!
  schemaId: ID!
  type: PermissionType!
  did: String
  grantee: String!
  createdBy: String
  created: DateTime!
  modified: DateTime!
  effectiveFrom: DateTime
  effectiveUntil: DateTime
  revoked: DateTime
  revokedBy: String
  slashed: DateTime
  slashedBy: String
  repaid: DateTime
  repaidBy: String
  extended: DateTime
  extendedBy: String
  country: String
  deposit: String
  slashedDeposit: String
  repaidDeposit: String
  validationFees: String
  issuanceFees: String
  verificationFees: String
  validatorPermId: ID
  # Validation Process state
  vpState: String              # PENDING, VALIDATED, TERMINATED
  vpLastStateChange: DateTime
  vpCurrentFees: String
  vpCurrentDeposit: String
  vpExp: DateTime
  vpSummaryDigestSri: String
  vpValidatorDeposit: String
  # VPR spec fields
  adjusted: DateTime
  issuanceFeeDiscount: String
  verificationFeeDiscount: String
  vsOperatorAuthzEnabled: Boolean
  vsOperatorAuthzSpendPeriod: String
  vsOperatorAuthzSpendLimit: String
  vsOperatorAuthzWithFeegrant: Boolean
  vsOperatorAuthzFeeSpendLimit: String
  # Indexer-computed
  permState: String            # ACTIVE, FUTURE, EXPIRED, REVOKED, SLASHED, REPAID, INACTIVE
  granteeAvailableActions: [String!]!
  validatorAvailableActions: [String!]!
  # Resolved relations
  schema: CredentialSchema!
  validator: Permission
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

# Operator Authorization (Delegation module)
type OperatorAuthorization {
  authority: String!
  operator: String!
  msgTypes: [String!]!
  spendLimit: String
  feeSpendLimit: String
  expiration: DateTime
  period: String
}

# VS Operator Authorization (Delegation module)
type VSOperatorAuthorization {
  authority: String!
  vsOperator: String!
  permissions: [Int!]!
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

  # Permissions
  permissions(
    filter: PermissionQueryFilter
    first: Int
    after: String
    asOfBlockHeight: Int
  ): PermissionConnection!

  permission(id: ID!, asOfBlockHeight: Int): Permission

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

  # Block height ↔ timestamp lookup
  blockHeightAtDate(date: DateTime!): Int  # Returns the highest block at or before the given date
  blockTimestamp(blockHeight: Int!): DateTime  # Returns the timestamp of a given block

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

input PermissionQueryFilter {
  did: ID
  grantee: ID
  schemaId: ID
  type: PermissionType
  ecosystemDid: ID
  vpState: String              # PENDING, VALIDATED, TERMINATED
  permState: String            # ACTIVE, FUTURE, EXPIRED, REVOKED, SLASHED, REPAID, INACTIVE
  country: String
  validatorPermId: ID
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

> All types below mirror the schemas defined in `openapi-indexer.json`.
> Field names use `snake_case` to match the indexer REST API exactly, except `IndexerStatus` which uses camelCase as returned by the `/status` endpoint.

```typescript
// packages/indexer-client/src/types.ts

// ─── Client Interface ────────────────────────────────────────
// Maps to the indexer REST API endpoints in openapi-indexer.json

export interface IndexerClient {
  // Indexer-specific
  getBlockHeight(): Promise<number>;
  getVersion(): Promise<{ version: string }>;
  getStatus(): Promise<IndexerStatus>;
  listChanges(blockHeight: number): Promise<{ block_height: number; activity: EntityChange[] }>;

  // Trust Registry (MOD-TR-QRY-1..3)
  getTrustRegistry(id: string, opts?: { active_gf_only?: boolean; preferred_language?: string; atBlockHeight?: number }): Promise<TrustRegistry>;
  listTrustRegistries(filter?: TrustRegistryFilter, atBlockHeight?: number): Promise<TrustRegistry[]>;
  getTrustRegistryParams(atBlockHeight?: number): Promise<Record<string, string>>;

  // Credential Schema (MOD-CS-QRY-1..6)
  getCredentialSchema(id: string, atBlockHeight?: number): Promise<CredentialSchema>;
  renderJsonSchema(id: string, atBlockHeight?: number): Promise<string>;
  listCredentialSchemas(filter?: CredentialSchemaFilter, atBlockHeight?: number): Promise<CredentialSchema[]>;
  getCredentialSchemaParams(atBlockHeight?: number): Promise<Record<string, string>>;
  getSchemaAuthorizationPolicy(id: string, atBlockHeight?: number): Promise<SchemaAuthorizationPolicy>;
  listSchemaAuthorizationPolicies(schemaId: string, role: 'ISSUER' | 'VERIFIER', atBlockHeight?: number): Promise<SchemaAuthorizationPolicy[]>;

  // Permission (MOD-PERM-QRY-1..6)
  getPermission(id: string, atBlockHeight?: number): Promise<Permission>;
  listPermissions(filter?: PermissionFilter, atBlockHeight?: number): Promise<Permission[]>;
  findBeneficiaries(issuerPermId: string, verifierPermId: string, atBlockHeight?: number): Promise<BeneficiaryResponse>;
  getPermissionSession(id: string, atBlockHeight?: number): Promise<PermissionSession>;
  getPermissionParams(atBlockHeight?: number): Promise<Record<string, string>>;

  // Trust Deposit (MOD-TD-QRY-1..2)
  getTrustDeposit(account: string, atBlockHeight?: number): Promise<TrustDeposit>;
  getTrustDepositParams(atBlockHeight?: number): Promise<Record<string, string>>;

  // History / Activity Timeline endpoints
  getTrustRegistryHistory(id: string, opts?: { response_max_size?: number; transaction_timestamp_older_than?: string }, atBlockHeight?: number): Promise<ActivityTimelineResponse>;
  getCredentialSchemaHistory(id: string, opts?: { response_max_size?: number; transaction_timestamp_older_than?: string }, atBlockHeight?: number): Promise<CredentialSchemaHistoryResponse>;
  getPermissionHistory(id: string, opts?: { response_max_size?: number; transaction_timestamp_older_than?: string }, atBlockHeight?: number): Promise<ActivityTimelineResponse>;
  getPermissionSessionHistory(id: string, atBlockHeight?: number): Promise<PermissionSessionHistoryResponse>;
  getTrustDepositHistory(account: string, opts?: { response_max_size?: number; transaction_timestamp_older_than?: string }, atBlockHeight?: number): Promise<ActivityTimelineResponse>;

  // Digest (MOD-DI-QRY-1)
  getDigest(digestSri: string, atBlockHeight?: number): Promise<DigestEntry | null>;

  // Exchange Rate (MOD-XR-QRY-1..3)
  getExchangeRate(filter: ExchangeRateGetFilter, atBlockHeight?: number): Promise<ExchangeRate>;
  listExchangeRates(filter?: ExchangeRateListFilter, atBlockHeight?: number): Promise<ExchangeRate[]>;
  getPrice(params: PriceParams, atBlockHeight?: number): Promise<PriceResponse>;

  // Delegation (MOD-DE-QRY-1..2)
  listOperatorAuthorizations(filter?: OperatorAuthorizationListFilter, atBlockHeight?: number): Promise<OperatorAuthorization[]>;
  listVSOperatorAuthorizations(filter?: VSOperatorAuthorizationListFilter, atBlockHeight?: number): Promise<VSOperatorAuthorization[]>;

  // Indexer-specific endpoints
  listPermissionSessions(filter?: { modified_after?: string; response_max_size?: number }, atBlockHeight?: number): Promise<PermissionSession[]>;
  getPendingFlat(account: string, opts?: { response_max_size?: number; sort?: string }, atBlockHeight?: number): Promise<PendingFlatResponse>;
  getGlobalMetrics(atBlockHeight?: number): Promise<GlobalMetricsResponse>;
}

// ─── Entity Change (from /indexer/v1/changes) ────────────────

export interface IndexerStatus {
  isRunning: boolean;
  isCrawling: boolean;
  stoppedAt?: string;
  stoppedReason?: string;
  lastError?: {
    message: string;
    stack?: string;
    timestamp: string;
    service?: string;
  };
}

export interface EntityChange {
  entity_type: string;          // e.g. 'TrustRegistry', 'CredentialSchema', 'Permission', etc.
  entity_id: string;
  msg: string;                  // e.g. 'CreateTrustRegistry', 'UpdatePermission'
  block_height: number;
  timestamp: string;
  account: string;
  changes: Record<string, { old: unknown; new: unknown }> | null;
}

// ─── Trust Registry ──────────────────────────────────────────
// Matches: components/schemas/TrustRegistry in openapi-indexer.json

export interface TrustRegistry {
  id: string;
  did: string;
  controller: string;                   // v4 spec: "authority"
  created: string;                       // ISO 8601
  modified: string;
  archived: string | null;
  deposit: string;
  aka: string | null;
  language: string;
  active_version: number;
  // Nested governance framework
  versions: TrustRegistryVersion[];
  // Indexer-computed reputation fields
  participants: number;
  active_schemas: number;
  archived_schemas: number;
  weight: string;
  issued: number;
  verified: number;
  ecosystem_slash_events: number;
  ecosystem_slashed_amount: string;
  ecosystem_slashed_amount_repaid: string;
  network_slash_events: number;
  network_slashed_amount: string;
  network_slashed_amount_repaid: string;
}

export interface TrustRegistryVersion {
  id: string;
  tr_id: string;
  created: string;
  version: number;
  active_since: string;
  documents: TrustRegistryDocument[];
}

export interface TrustRegistryDocument {
  id: string;
  gfv_id: string;
  created: string;
  language: string;
  url: string;
  digest_sri: string;
}

export interface TrustRegistryFilter {
  active_gf_only?: boolean;
  preferred_language?: string;
  authority?: string;
  response_max_size?: number;
  modified_after?: string;
  only_active?: boolean;
  controller?: string;
  participant?: string;
  sort?: string;
  // Indexer-specific range filters
  min_active_schemas?: number;  max_active_schemas?: number;
  min_participants?: number;    max_participants?: number;
  min_weight?: string;          max_weight?: string;
  min_issued?: string;          max_issued?: string;
  min_verified?: string;        max_verified?: string;
  min_ecosystem_slash_events?: number;  max_ecosystem_slash_events?: number;
  min_network_slash_events?: number;    max_network_slash_events?: number;
}

// ─── Credential Schema ───────────────────────────────────────
// Matches: components/schemas/CredentialSchema in openapi-indexer.json

export interface CredentialSchema {
  id: number;
  tr_id: string;
  json_schema: string;
  deposit: string;
  issuer_grantor_validation_validity_period: number;
  verifier_grantor_validation_validity_period: number;
  issuer_validation_validity_period: number;
  verifier_validation_validity_period: number;
  holder_validation_validity_period: number;
  issuer_perm_management_mode: 'OPEN' | 'ECOSYSTEM' | 'GRANTOR_VALIDATION';
  verifier_perm_management_mode: 'OPEN' | 'ECOSYSTEM' | 'GRANTOR_VALIDATION';
  archived: string | null;
  created: string;
  modified: string;
  // v4 new fields
  pricing_asset_type: 'TU' | 'COIN' | 'FIAT';
  pricing_asset: string;
  digest_algorithm: string;
  // Indexer-computed reputation fields
  participants: number;
  weight: string;
  issued: string;
  verified: string;
  ecosystem_slash_events: number;
  ecosystem_slashed_amount: string;
  ecosystem_slashed_amount_repaid: string;
  network_slash_events: number;
  network_slashed_amount: string;
  network_slashed_amount_repaid: string;
}

export interface CredentialSchemaFilter {
  tr_id?: string;
  modified_after?: string;
  response_max_size?: number;
  only_active?: boolean;
  issuer_perm_management_mode?: string;
  verifier_perm_management_mode?: string;
  participant?: string;
  sort?: string;
  // Indexer-specific range filters
  min_participants?: number;    max_participants?: number;
  min_weight?: string;          max_weight?: string;
  min_issued?: string;          max_issued?: string;
  min_verified?: string;        max_verified?: string;
  min_ecosystem_slash_events?: number;  max_ecosystem_slash_events?: number;
  min_network_slash_events?: number;    max_network_slash_events?: number;
}

// ─── Schema Authorization Policy (v4 new) ────────────────────
// Matches: components/schemas/SchemaAuthorizationPolicy in openapi-indexer.json

export interface SchemaAuthorizationPolicy {
  id: number;
  schema_id: number;
  role: 'ISSUER' | 'VERIFIER';
  version: number;
  url: string;
  digest_sri: string;
  created: string;
  effective_from: string | null;
  effective_until: string | null;
  revoked: boolean;
}

// ─── Permission ──────────────────────────────────────────────
// Matches: components/schemas/Permission in openapi-indexer.json

export type PermissionType = 'ISSUER' | 'VERIFIER' | 'ISSUER_GRANTOR' | 'VERIFIER_GRANTOR' | 'ECOSYSTEM' | 'HOLDER';
export type VPState = 'PENDING' | 'VALIDATED' | 'TERMINATED';
export type PermState = 'REPAID' | 'SLASHED' | 'REVOKED' | 'EXPIRED' | 'ACTIVE' | 'FUTURE' | 'INACTIVE';

export interface Permission {
  id: string;
  schema_id: string;
  type: PermissionType;
  did: string | null;
  grantee: string;
  created_by: string;
  created: string;
  modified: string;
  extended: string | null;
  extended_by: string | null;
  slashed: string | null;
  slashed_by: string | null;
  repaid: string | null;
  repaid_by: string | null;
  effective_from: string | null;
  effective_until: string | null;
  revoked: string | null;
  revoked_by: string | null;
  country: string | null;
  validation_fees: string;
  issuance_fees: string;
  verification_fees: string;
  deposit: string;
  slashed_deposit: string;
  repaid_deposit: string;
  validator_perm_id: string | null;
  // Validation Process (VP) state
  vp_state: VPState;
  vp_last_state_change: string | null;
  vp_current_fees: string;
  vp_current_deposit: string;
  vp_summary_digest_sri: string | null;
  vp_exp: string | null;
  vp_validator_deposit: string;
  // VPR spec fields
  adjusted: string | null;
  issuance_fee_discount: string;
  verification_fee_discount: string;
  vs_operator_authz_enabled: boolean;
  vs_operator_authz_spend_period: string | null;
  vs_operator_authz_spend_limit: string | null;
  vs_operator_authz_with_feegrant: boolean;
  vs_operator_authz_fee_spend_limit: string | null;
  // Indexer-computed: available actions
  grantee_available_actions: string[];
  validator_available_actions: string[];
  // Indexer-computed: perm_state (derived)
  perm_state: PermState;
  // Indexer-computed reputation fields
  weight: string;
  issued: string;
  verified: string;
  participants: number;
  ecosystem_slash_events: number;
  ecosystem_slashed_amount: string;
  ecosystem_slashed_amount_repaid: string;
  network_slash_events: number;
  network_slashed_amount: string;
  network_slashed_amount_repaid: string;
}

export interface PermissionFilter {
  schema_id?: string;
  grantee?: string;
  did?: string;
  perm_id?: string;
  type?: PermissionType;
  only_valid?: boolean;
  only_slashed?: boolean;
  only_repaid?: boolean;
  modified_after?: string;
  country?: string;
  vp_state?: VPState;
  perm_state?: PermState;
  response_max_size?: number;
  when?: string;
  validator_perm_id?: string;
  sort?: string;
  // Indexer-specific range filters
  min_participants?: number;    max_participants?: number;
  min_weight?: string;          max_weight?: string;
  min_issued?: string;          max_issued?: string;
  min_verified?: string;        max_verified?: string;
  min_ecosystem_slash_events?: number;  max_ecosystem_slash_events?: number;
  min_network_slash_events?: number;    max_network_slash_events?: number;
}

// ─── Permission Session ──────────────────────────────────────
// Matches: components/schemas/PermissionSession in openapi-indexer.json

export interface PermissionSession {
  id: string;                    // UUID
  controller: string;
  agent_perm_id: string;
  wallet_agent_perm_id: string;
  authz: PermissionSessionAuthz[];
  created: string;
  modified: string;
}

export interface PermissionSessionAuthz {
  issuer_perm_id: number;
  verifier_perm_id: number;
  wallet_agent_perm_id: number;
}

// ─── Trust Deposit ───────────────────────────────────────────
// Matches: components/schemas/TrustDeposit in openapi-indexer.json

export interface TrustDeposit {
  account: string;
  share: string;
  amount: string;
  claimable: string;
  slashed_deposit: string;
  repaid_deposit: string;
  last_slashed: string | null;
  last_repaid: string | null;
  slash_count: number;
  last_repaid_by: string;
}

// ─── Digest (v4 new) ─────────────────────────────────────────
// Matches: components/schemas/Digest in openapi-indexer.json

export interface DigestEntry {
  digest_sri: string;
  created: string;             // ISO timestamp — effective issuance time for W3C VTCs
}

// ─── Exchange Rate (v4 new) ──────────────────────────────────
// Matches: components/schemas/ExchangeRate in openapi-indexer.json

export type PricingAssetType = 'TU' | 'COIN' | 'FIAT';

export interface ExchangeRate {
  id: number;
  base_asset_type: PricingAssetType;
  base_asset: string;
  quote_asset_type: PricingAssetType;
  quote_asset: string;
  rate: string;
  rate_scale: number;
  validity_duration: string;
  expires: string;
  state: boolean;
  updated: string;
}

export interface ExchangeRateGetFilter {
  id?: string;
  base_asset_type?: PricingAssetType;
  base_asset?: string;
  quote_asset_type?: PricingAssetType;
  quote_asset?: string;
  state?: boolean;
  expire_ts?: string;
}

export interface ExchangeRateListFilter {
  base_asset_type?: PricingAssetType;
  base_asset?: string;
  quote_asset_type?: PricingAssetType;
  quote_asset?: string;
  state?: boolean;
  expire?: string;
}

export interface PriceParams {
  base_asset_type: PricingAssetType;
  base_asset: string;
  quote_asset_type: PricingAssetType;
  quote_asset: string;
  amount: string;
}

export interface PriceResponse {
  price: string;
  base_asset_type: string;
  base_asset: string;
  quote_asset_type: string;
  quote_asset: string;
  amount: string;
  rate: string;
  rate_scale: number;
}

// ─── Operator Authorization (Delegation module, MOD-DE-QRY-1) ─
// Matches: components/schemas/OperatorAuthorization in openapi-indexer.json

export interface OperatorAuthorization {
  authority: string;
  operator: string;
  msg_types: string[];
  spend_limit: string | null;
  fee_spend_limit: string | null;
  expiration: string | null;
  period: string | null;
}

export interface OperatorAuthorizationListFilter {
  authority?: string;
  operator?: string;
  response_max_size?: number;
}

// ─── VS Operator Authorization (Delegation module, MOD-DE-QRY-2) ─
// Matches: components/schemas/VSOperatorAuthorization in openapi-indexer.json

export interface VSOperatorAuthorization {
  authority: string;
  vs_operator: string;
  permissions: number[];
}

export interface VSOperatorAuthorizationListFilter {
  authority?: string;
  vs_operator?: string;
  response_max_size?: number;
}

// ─── History / Activity Timeline response types ─────────────

export interface ActivityTimelineResponse {
  activity: ActivityItem[];
}

export interface CredentialSchemaHistoryResponse {
  schema: {
    id: number;
    history: Record<string, unknown>[];
  };
}

export interface ActivityItem {
  timestamp: string;
  block_height: number;
  entity_type: string;
  entity_id: string;
  account: string;
  msg: string;
  changes: Record<string, { old: unknown; new: unknown }> | null;
}

export interface PermissionSessionHistoryResponse {
  history: PermissionSessionHistoryItem[];
}

export interface PermissionSessionHistoryItem {
  session_id: string;
  event_type: string;
  height: number;
  controller: string;
  agent_perm_id: string;
  wallet_agent_perm_id: string;
  authz: Record<string, unknown>[];
  changes: Record<string, { old: unknown; new: unknown }> | null;
  created_at: string;
}

// ─── Beneficiaries ───────────────────────────────────────────

export interface BeneficiaryResponse {
  permissions: Permission[];
}

// ─── Indexer-specific response types ─────────────────────────

export interface PendingFlatResponse {
  trust_registries: Array<{
    id: string;
    did: string;
    aka: string;
    pending_tasks: number;
    participants: number;
    credential_schemas: Array<{
      id: string;
      title: string;
      description: string;
      pending_tasks: number;
      participants: number;
      permissions: Array<{
        id: string;
        type: string;
        vp_state: string;
        perm_state: string;
        grantee: string;
        did: string;
        modified: string;
      }>;
    }>;
  }>;
}

export interface GlobalMetricsResponse {
  participants: number;
  active_trust_registries: number;
  archived_trust_registries: number;
  active_schemas: number;
  archived_schemas: number;
  weight: string;
  issued: number;
  verified: number;
  ecosystem_slash_events: number;
  ecosystem_slashed_amount: string;
  ecosystem_slashed_amount_repaid: string;
  network_slash_events: number;
  network_slashed_amount: string;
  network_slashed_amount_repaid: string;
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
| Blob store module | S3/filesystem adapter, content-addressed storage interface |
| Indexer client | HTTP client for Verana Indexer API |

### Phase 2: Ingestion Pipeline (Weeks 3-4)

| Task | Description |
|------|-------------|
| Block sync manager | Initial sync + incremental sync logic |
| Pass1 implementation | Caching, DID resolution, VP dereferencing, blob storage for dereferenced objects |
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
5. **Historical queries**: `asOfBlockHeight` argument supported in GraphQL from day one. A `block_timestamps` table maps block heights to timestamps, and `blockHeightAtDate` / `blockTimestamp` GraphQL queries enable timestamp-based historical lookups.
6. **Blob storage**: Large dereferenced objects (VPs, VCs, JSON Schemas, governance documents) are stored in an **external content-addressed blob store** (S3-compatible or local filesystem) rather than inline in PostgreSQL. The `cached_objects` table stores only a `blob_key` (SHA-256 hash) and `content_size`. DID documents are the exception — they remain inline as `JSONB` in the `did_documents` table because they are small (1-5 KB), frequently accessed during trust evaluation, and need fast parsing without a blob round-trip. This keeps the DB lean (~30 GB at 1M services) while blobs scale independently on cheap storage. Two adapters are provided: `S3Adapter` for production (S3, MinIO) and `FilesystemAdapter` for local development.
7. **Permission state for trust evaluation**: The indexer computes `perm_state` (ACTIVE, EXPIRED, REVOKED, SLASHED, REPAID, FUTURE, INACTIVE) for every permission at any given `atBlockHeight`. This is the **authoritative field** the trust engine uses to determine whether a permission is valid — a permission is valid if and only if `perm_state == ACTIVE`. The `vp_state` field (PENDING, VALIDATED, TERMINATED) tracks the grantor validation process lifecycle and is **informational only** — it is not used in trust evaluation logic. A permission that has successfully completed validation will already have `perm_state = ACTIVE`.

---

## 15. References

- [Verana Trust Resolver Spec](./spec.md)
- [Verifiable Trust Specification](https://verana-labs.github.io/verifiable-trust-spec/)
- [VPR Specification](https://verana-labs.github.io/verifiable-trust-vpr-spec/)
- [Verana Indexer API](https://idx.testnet.verana.network/)
- [DID Core Specification](https://www.w3.org/TR/did-core/)
- [Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model-2.0/)
- [Linked VP Specification](https://identity.foundation/linked-vp/)
