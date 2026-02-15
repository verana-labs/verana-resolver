-- Trust evaluation results (Pass2 output) — scalar facts only
CREATE TABLE trust_results (
  did             TEXT PRIMARY KEY,
  trust_status    TEXT NOT NULL,       -- TRUSTED / PARTIAL / UNTRUSTED
  production      BOOLEAN NOT NULL,
  evaluated_at    TIMESTAMPTZ NOT NULL,
  evaluated_block BIGINT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_trust_expires ON trust_results(expires_at);

-- Per-credential evaluation results, linked to the DID
CREATE TABLE credential_results (
  id              BIGSERIAL PRIMARY KEY,
  did             TEXT NOT NULL REFERENCES trust_results(did) ON DELETE CASCADE,
  credential_id   TEXT NOT NULL,       -- VC id or hash
  result_status   TEXT NOT NULL,       -- VALID / IGNORED / FAILED
  ecs_type        TEXT,                -- ECS-SERVICE, ECS-ORG, ECS-PERSONA, ECS-UA, or NULL
  schema_id       BIGINT,
  issuer_did      TEXT,
  presented_by    TEXT,
  issued_by       TEXT,
  perm_id         BIGINT,
  error_reason    TEXT,                -- populated when result_status = FAILED
  UNIQUE (did, credential_id)
);

CREATE INDEX idx_cred_did ON credential_results(did);

-- Retry tracking for failed dereferencing / evaluation
CREATE TABLE reattemptable (
  resource_id     TEXT PRIMARY KEY,
  resource_type   TEXT NOT NULL,       -- DID_DOC / VP / VC / TRUST_EVAL
  first_failure   TIMESTAMPTZ NOT NULL,
  last_retry      TIMESTAMPTZ NOT NULL,
  error_type      TEXT,                -- TRANSIENT / PERMANENT
  retry_count     INTEGER NOT NULL DEFAULT 0
);

-- Resolver state (singleton key-value rows)
CREATE TABLE resolver_state (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);

-- Seed initial state
INSERT INTO resolver_state (key, value) VALUES ('lastProcessedBlock', '0');
