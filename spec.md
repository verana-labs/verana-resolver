# Verana Trust Resolver Container Specification

## Draft 0.1

**Editors**:

- [Fabrice Rochette](https://www.linkedin.com/in/fabricerochette/)

## 1. Introduction

The **Verana Trust Resolver Container** (“**Verana Resolver**”) is a core infrastructure component of Verana. It continuously ingests state from the **Verana Indexer**, resolves decentralized identifiers (DIDs), dereferences verifiable credentials (VCs) presented as [linked-vp](https://identity.foundation/linked-vp/) in DID Documents, validates trust according to the **Verifiable Trust Specification**, and exposes a **GraphQL API** for querying and searching trusted services, ecosystems, issuers, verifiers, governance information, and more.

The Trust Resolver maintains a **local projection** of all relevant data and performs **deterministic trust evaluations**, respecting both:

- ledger **block heights**, and  
- **TTL-based** refresh constraints for dereferenced objects and trust evaluations.

This specification defines:

- Normative behaviors and constraints for ingestion, caching, evaluation, and querying.  
- The **block-height sync mechanism** with the Indexer.  
- **Recursive trust resolution** and **issuer permission validation**.  
- Error and retry management.  
- Consistency guarantees.  
- GraphQL querying requirements.

The audience for this specification includes implementers of the Verana Resolver, ecosystem architects, and contributors to the Verifiable Trust infrastructure.

## 2. Normative Language

The terms **MUST**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 9110 (and RFC 2119 style).

## 3. Architecture Overview

The Trust Resolver consists of:

- A **block-based ingestion engine** that polls the Indexer at short intervals.
- A **caching subsystem** with TTL constraints:
  - `CACHE_TTL` for dereferenced objects.  
  - `TRUST_TTL` for trust evaluations.  
- A **two-pass trust evaluation pipeline**:
  - **Pass1**: caching and dereferencing  
  - **Pass2**: trust evaluation  
- A **retry subsystem** for dereferencing and evaluation failures.  
- A **local index** containing trusted entities and searchable objects.  
- A **GraphQL interface** that exposes the index.  
- A **consistency model** ensuring that GraphQL queries see only the **last fully processed block**.

The Trust Resolver **MUST NOT** query the VPR blockchain directly.  
It interacts **only with the Indexer**, which itself is responsible for mirroring and querying VPR state.

## 4. Indexer Integration Requirements

### 4.1 Required Indexer Methods

The Trust Resolver relies on the following Indexer capabilities:

#### 4.1.1 `GetBlockHeight`

Returns the **most recent block height** fully processed by the Indexer.

#### 4.1.2 `AtBlockHeight` Header

All Indexer methods (except `GetBlockHeight`) MUST accept the HTTP header:

```
AtBlockHeight: <blockHeight>
```

If this header is missing where required, the Indexer MUST return an error.

Semantics: return the state of the underlying data as of the given block height.

#### 4.1.3 ListChanges

Returns all changed entities for a given block height.
ListChanges MUST require the AtBlockHeight header.

The set of changeable entities includes (as defined in the VPR data model):

- TrustRegistry
- CredentialSchema
- Permission
- PermissionSession
- DidDirectory
- GovernanceFrameworkVersion
- GovernanceFrameworkDocument
- TrustDeposit
- GlobalVariables

The exact JSON structure of ListChanges is defined by the Indexer, but MUST allow the Trust Resolver to identify:

- entity type
- entity identifier
- operation type (create / update / delete, if applicable)

## 5. Variables

### 5.1 State Variables

The Trust Resolver MUST maintain at least the following internal state:

- lastProcessedBlock (persisted):
the last block height for which Pass1 and Pass2 both completed successfully.
- reattemptableResources:
a working set of dereferencing / evaluation failures, with per-resource metadata (IDs, firstFailureAt, lastRetryAt, error type, etc.).

Implementations MAY maintain additional state, but MUST respect these semantics.

### 5.2 Container Variables

- POLL_INTERVAL (configurable):
desired polling interval (e.g., in seconds).
- CACHE_TTL (configurable):
maximum age for dereferenced objects before they MUST be refreshed.
- TRUST_TTL (configurable):
maximum age for trust evaluation results before they MUST be re-evaluated.
- POLL_OBJECT_CACHING_RETRY_DAYS (configurable):
number of days during which failed dereferencing attempts are retried, once per day.

Added to these variables, container MUST provide a way to configure a list of recognized VPRs (and Indexer URL) as well as, for each of these VPRs, the DID(s) of the Ecosystem(s) providing the Essential Credential Schemas that are recognized, as specified in the [verifiable-trust-spec - WL](https://verana-labs.github.io/verifiable-trust-spec/#wl-ecs-ecosystem-whitelists-and-vpr-scheme-resolution)

Examples:

```json
{
verifiablePublicRegistries: [ 
    { 
      "name": "vpr:verana:vna-mainnet-1",
      "baseurls": [
        "https://indexer-1/"
      ]
      "version": "1"
      "production": true
    }
  ]
}
```

```json
{ 
  ecsEcosystems: [ 
    { 
      "did": "did:example:ecosystem",
      "vpr": "vpr:verana:vna-mainnet-1"
    }
  ]
}
```

## 6. Consistency Model

GraphQL MUST only expose the state of the trust index at lastProcessedBlock.

Any ongoing processing for blocks above lastProcessedBlock MUST NOT be visible in GraphQL query results.

When Pass1 and Pass2 both succeed for a particular block B:

- lastProcessedBlock MUST be updated to B atomically with the index changes that correspond to that block.

TTL-driven recalculations (see Section 14) MUST NOT change lastProcessedBlock; they operate within the current visible block snapshot.

## 7. Two-Pass Processing Model

The ingestion pipeline is split into two logical passes per block:

- Pass 1 (Pass1): “Data & Cache”
- Pass 2 (Pass2): “Trust & Index”

### 7.1 Pass 1 — Caching & Assembly

Pass1 MUST:

- Fetch entities affected by the target block (using Indexer + AtBlockHeight).
- Invalidate and reload DID Documents when required (see Section 10).
- Dereference all related VPs, VCs, JSON Schemas, and external documents.
- Validate integrity where available (e.g., digest_sri for governance docs, Json Schema Credentials...).
- Populate and update the raw object graph used by trust evaluation.
- Enforce CACHE_TTL:
  - If an object’s cache age exceeds CACHE_TTL, it MUST be re-fetched.
  - For credentials, if expirationDate (or equivalent) is in the past, the credential MUST be treated as expired, regardless of CACHE_TTL.
- Add any dereferencing failures to reattemptableResources with timestamps.

Pass1 does not decide trust status; it only ensures that all necessary data is available (or tracked as missing).

### 7.2 Pass 2 — Trust Evaluation

Pass2 MUST:

- Evaluate trust for all DIDs / entities whose inputs changed (including TTL-driven needs).
- Respect TRUST_TTL:
  - If a trust result is older than TRUST_TTL, it MUST be re-evaluated.
- Apply recursive issuer resolution as per Section 11.
- Validate issuer permissions at the credential’s issuanceBlockHeight.
- For each DID/context, assign a trust status (e.g., trusted, partially trusted, untrusted).
- Handle missing resources by tying the evaluation to the corresponding entries in reattemptableResources.
- Retry evaluations once per day (at most) up to POLL_OBJECT_CACHING_RETRY_DAYS when underlying resources are failing.

Pass2 writes the final trust state into the local index but does not affect lastProcessedBlock until the whole block is fully processed.

## 8. Polling Algorithm

### 8.1 Polling Loop

The Trust Resolver runs a continuous polling loop:

```
while true:
    last_started = now()
    run_ingestion_cycle()
    elapsed = now() - last_started
    if elapsed < POLL_INTERVAL:
        sleep(POLL_INTERVAL - elapsed)
```

If ingestion takes longer than POLL_INTERVAL, the next poll starts immediately (no extra waiting).

### 8.2 Initial Sync

If lastProcessedBlock == null, this is the initial synchronization:

  1. H = GetBlockHeight()
  2. Fetch all entities at AtBlockHeight: H.
  3. Run Pass1 (single execution):
    - Process all entities once.
    - Any dereferencing failures MUST be added to reattemptableResources.
    - No retries occur during initial sync.
  4. Run Pass2 (single execution):
    - Evaluate trust based on what is available.
    - Any evaluation failures MUST be added to reattemptableResources.
    - No retries occur during initial sync.
  5. Set:
    - lastProcessedBlock = H
  6. Resume normal incremental sync (Section 8.3).

This ensures startup is deterministic and does not block on flaky external dependencies; incomplete data is tracked for later retry.

### 8.3 Incremental Sync

Once lastProcessedBlock is set, the Trust Resolver MUST process blocks strictly in order:

```
while lastProcessedBlock < GetBlockHeight():
    target = lastProcessedBlock + 1

    changes = ListChanges(AtBlockHeight = target)

    for each changed entity in changes:
        invalidate cached DID document of that entity, if exists
        fetch entity state at AtBlockHeight = target
        run Pass1 for that entity

    retry Pass1 failures that are eligible (per retry rules)

    run Pass2 for all affected entities
    retry Pass2 evaluations that are eligible

    lastProcessedBlock = target
```

If the Indexer is unreachable or returns an error for target:

- The current ingestion cycle MUST be aborted for target.
- lastProcessedBlock MUST NOT change.
- The next poll SHOULD retry the same target block.

## 9. Trust Resolution Algorithm

The Trust Resolver implements the Verifiable Trust model directly and MUST perform trust evaluation in a deterministic manner.

### 9.1 Resolution Rules

Here is an interpretation of the [verifiable trust spec](https://verana-labs.github.io/verifiable-trust-spec/), aligned to Verana:

- a **VTC (Verifiable Trust Credential)** is **trustable** if and only if:
  - it is cryptographically verified (signature match issuer public key)
  - it is not revoked
  - the credential `issuanceDate` is proved
  - the issuer of the VTC had a valid issuer permission at the `BlockHeight` the credential was issued
  - the issuer of the VTC is a Verifiable Service
  - the schema of the VTC is a trustable VTJSC (Verifiable Trust Json Schema Credential)

- a **VTP (Verifiable Trust Presentation)** is **trustable** if and only if:
  - it is a valid linked-vp
  - it is referring to a **trustable** VTC, which subject is the DID that signed the VTP

- a **VTJSC** is **trustable** if and only if:
  - it is cryptographically verified (signature match issuer public key)
  - it is not revoked
  - the schema of the VTJSC is a JSON Schema that targets a CredentialSchema entry in a VPR, and its digest-sri matches. Targetted VPR network MUST be present in the container network white list
  - the DID that issued the VTJSC is the same DID than the trust registry DID owner of the CredentialSchema entry
  - the VTJSC MAY be present as a linked-vp in the DID document of the trust registry (if it is not present, it means new credentials cannot be issued for this schema)

- an **ECSVTC (Essential Credential Schema Verifiable Trust Credential)** is **trustable** if and only if:
  - it is a **trustable VTC**
  - it is referring a **trustable VTJSC**

- a service is a **Verifiable Service** if and only if:
  - it is a resolvable DID
  - one of the 2 following cases are true:
    - its DID Document has a **trustable VTP** of a self-issued **trustable Service ECSVTC**, AND a (**trustable Organization ECSVTC** OR a **trustable Persona ECSVTC**)
    - its DID Document presents a **trustable Service ECSVTC** issued by another DID, AND this DID is a **Verifiable Service** that is presenting a (**trustable Organization ECSVTC** OR a **trustable Persona ECSVTC**).

At the end, for a DID to be included in the **trust index**, it MUST be a **Verifiable Service**

### 9.2 Proving `issuanceDate` and Getting `issuanceBlockHeight`

In order to get the `issuanceBlockHeight` for a Credential:

- calculate `digest-sri` of normalized json of the credential.
- load `CredentialIssued` from Indexer for the calculated `digest-sri` to get `issuanceBlockHeight`.

if no `CredentialIssued` is found, credential is not trustable.

If `CredentialIssued` is found, verify that the corresponding date matches the `issuanceDate` of the credential.

- if it doesn't match, credential is not trustable
- else credential is trustable and `CredentialIssued.issuanceBlockHeight` can be considered.

> Note: this is not implemented yet in indexer. Furthermore, blockchain transaction are not implemented in the vs-agent yet. In the meantime, always consider `issuanceDate` is valid.

### 9.3 Resolution Required Steps

For each DID to evaluate (DID in DID Directory, TrustRegistry DID, Permission DID, etc.):

1. Evaluate if it is a **Verifiable Service** and produce a VerifiableTrustResolutionResult:
    - verifiableTrustStatus (TRUSTED (verifiable service), UNTRUSTED (not a verifiable service)).
    - production (true of false, as defined in `verifiablePublicRegistries`). If mixed production/not production resulting state is not production.
    - validCredentials[].
    - ignoredCredentials[] (invalid optional credentials).
    - failedCredentials[] (for diagnostic purposes).
    - Derived ecosystems / schemas / permissions context.
2. Store Trust Evaluation Metadata
    - verifiableTrustEvaluatedAt.
    - verifiableTrustExpiresAt = verifiableTrustEvaluatedAt + TRUST_TTL.

**Note1:**

If a DID meets all requirements to be **Verifiable Service**, but presents additional optional credentials that fail validation:

- The DID MUST still be considered a **Verifiable Service** and then trusted.
- The failing optional credentials MUST be added to ignoredCredentials[] and MUST NOT contribute to trust (not found in query search results).

**Note2:**

A `visitedDids` set SHOULD be used to prevent infinite recursion.

## 10. Local Projection Structure

The Trust Resolver MUST maintain a local projection (index) including, at minimum:

- Services (Verifiable Services, user agents, etc.), including:
    - DID
    - Display name / metadata
    - Location (if present)
    - Service type / categories
    - Linked ecosystems
- Ecosystems:
    - TrustRegistry info
    - Ecosystem DID
    - Active governance framework summary
    - Deposits and other token-derived metrics (via Indexer)
- Participants:
    - Issuers, Verifiers, Grantors, Ecosystem controllers
    - Permissions and their statuses
    - Statistics (issuedCount, verifiedCount, etc. from Indexer)
- Credential Facts:
    - Flattened view of credentials, schema references, issuer, subject, claims.
- DID Usage Reverse Index:
    - For each DID, all roles it plays (service, issuer, ecosystem, grantor, etc.).
- Permission Statistics:
    - Counters such as number of issued / verified credentials per permission, as supplied by the Indexer.
- Token Values:
    - Trust deposits and related aggregate values, via Indexer and TrustDeposit entities.
- Governance Framework Info:
    - Active governance framework per trust registry and ecosystem.

All indexed entities MUST be aligned with and associated to specific block heights.

## 11. GraphQL API Requirements

### 11.1 Pagination

All collection-returning queries MUST implement cursor-based pagination following the Connection pattern:

Connection type with:
    - edges[] { cursor, node }
    - pageInfo { hasNextPage, hasPreviousPage, startCursor, endCursor }

Offset-based pagination MAY be supported as a convenience, but cursor-based pagination MUST be normative.

### 11.2 Required Queries

The Trust Resolver MUST expose at least the following queries:

- services(filter, orderBy, pagination)
- ecosystems(filter, orderBy, pagination)
- credentials(filter, pagination)
- didUsage(did)
- search(text)

These MUST be sufficient to express queries such as:

- “Where is Alice’s AI Assistant whose attached AI Assistant Credential shows the owner name ‘Alice’?”
- “Which social channels hold a Blue Network Credential from Ecosystem DEF and have an avatar credential containing @bob_influencer?”
- “Which services in Bristol, UK present an E-commerce Retail Credential from issuers of the Ecosystem Ecommerce Global Alliance and sell baby shoes?”
- “List all services with a valid Hotel Credential from Ecosystem PMS Vendor ABC located in France.”
- “Show certified plumbers AI assistants who hold a Plumber Credential from Ecosystem Verified Workers in Bogotá.”
- “Identity” → which should return schemas/services/etc. containing “Identity”.

### 11.3 Filters

GraphQL filters MUST support at least:

- Filter by DID.
- Filter by ecosystem DID or TrustRegistry.
- Filter by credential schema (type, ID, ecosystem, etc.).
- Filter by claims via path selectors (e.g., owner.name, address.city, products.category).
- Filter by location (country, region, city).
- Filter by issuer DID, verifier DID, or role.
- Filter by trust status (trusted / partially trusted / untrusted).

### 11.4 Consistency

All GraphQL responses MUST reflect only the state as of lastProcessedBlock.

Implementations MAY add query arguments (e.g. asOfBlockHeight) that allow clients to request older snapshots, but MUST NOT expose state newer than lastProcessedBlock.

## 12. Caching Policies

### 12.1 CACHE_TTL — Dereferenced Object Cache

- Every dereferenced object (DID Document, VC, VP, JSON Schema, governance document, etc.) MUST have:
- a cachedAt timestamp, and
- an implicit expiresAt = cachedAt + CACHE_TTL.
- When the Trust Resolver needs such an object:
- If now < expiresAt (and the credential is not expired), the cached version MAY be used.
- If now >= expiresAt, the object MUST be re-fetched from its authoritative source.
- For credentials, if the credential has expirationDate and now is beyond that date, it MUST be treated as expired regardless of CACHE_TTL. Implementations MAY still attempt a refresh if the URL might now contain a newer version, but the original credential is invalid.

### 12.2 TRUST_TTL — Trust Evaluation Cache

- Every trust evaluation result MUST store:
- trustEvaluatedAt
- trustExpiresAt = trustEvaluatedAt + TRUST_TTL.
- When the Trust Resolver needs to rely on a trust result:
- If now < trustExpiresAt, the result MAY be reused provided no new block or invalidation has changed its inputs.
- If now >= trustExpiresAt, Pass2 MUST re-evaluate trust for that DID/context.

### 12.3 Retry Interaction

If a TTL-triggered refresh (Pass1 or Pass2) fails:

- The corresponding object or evaluation MUST be added to `reattemptableResources`.
- Retries MUST follow POLL_OBJECT_CACHING_RETRY_DAYS:
- At most once per day per failing resource.
- Up to N days as configured.

If the retry window is exceeded, the resource MUST be considered permanently failed, removed from `reattemptableResources`, and any trust evaluation depending on it MUST treat that dependency as unavailable (leading generally to an untrusted or partially trusted status).

## 13. Security Requirements

- All dereferenced documents MUST validate integrity where possible (e.g., via digest_sri for governance framework documents, credential, pesentations signatures...).
- All HTTP(S) requests SHOULD use TLS.
- DID resolution MUST follow the respective DID method’s security rules (e.g., correct use of DID resolvers and method-specific verification).
- Cached objects SHOULD be immutable with respect to their content hash; if the same URL returns content with a different hash, it SHOULD be treated as a new version and revalidated.

Implementers MUST take care to avoid cache poisoning and similar attacks when storing dereferenced data.

## 14. Implementation Flexibility

This specification does not mandate:

- Storage engine (e.g., SQL, key-value store, graph DB, document DB, etc.).
- Caching mechanism (in-memory, distributed cache, etc.).
- Threading or concurrency model.
- GraphQL framework or runtime.

The only hard requirements are that all MUST and SHOULD rules about ingestion, caching, evaluation, and visibility are honored.

## 15. Future Extensions

Possible future extensions include:

- Semantic search suggestions or NLP-powered query expansion.
- TRQP 2.x endpoint parity exposed alongside GraphQL.
- On-demand trust re-evaluation endpoints for admin / debugging.
- Service heartbeat / uptime checking integration (e.g., availability checks, latency, etc.).
- Extended reputation signals derived from TrustDeposit and historical behavior.

These are non-normative ideas and do not form part of this version of the specification.

EOF