-- Store the full TrustResult JSON for detail=full queries
ALTER TABLE trust_results ADD COLUMN full_result_json JSONB;

-- GIN index for potential future queries on the JSON structure
CREATE INDEX idx_trust_full_result ON trust_results USING GIN (full_result_json)
  WHERE full_result_json IS NOT NULL;
