import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { computeEcsDigest, classifyEcsTypeByDigest, verifyEcsTrCompleteness } from '../src/trust/ecs-schema.js';
import type { CredentialSchema } from '../src/indexer/types.js';

// Load config so getConfig() works (uses spec [ECS-TR] defaults)
beforeAll(() => {
  loadConfig({
    POSTGRES_HOST: 'localhost',
    POSTGRES_USER: 'test',
    POSTGRES_PASSWORD: 'test',
    POSTGRES_DB: 'test',
    REDIS_URL: 'redis://localhost:6379',
    INDEXER_API: 'http://localhost:1317',
    ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
  });
});

// --- computeEcsDigest ---

describe('computeEcsDigest', () => {
  it('removes $id before hashing', async () => {
    const schemaWithId = JSON.stringify({ $id: 'vpr:verana:test/cs/v1/js/1', title: 'Test' });
    const schemaWithDifferentId = JSON.stringify({ $id: 'vpr:verana:test/cs/v1/js/999', title: 'Test' });
    const digest1 = await computeEcsDigest(schemaWithId);
    const digest2 = await computeEcsDigest(schemaWithDifferentId);
    expect(digest1).toBe(digest2);
  });

  it('produces sha384- prefixed digest', async () => {
    const schema = JSON.stringify({ $id: 'test', title: 'Hello' });
    const digest = await computeEcsDigest(schema);
    expect(digest).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
  });

  it('produces different digests for different schemas', async () => {
    const schema1 = JSON.stringify({ $id: 'same', title: 'Schema1' });
    const schema2 = JSON.stringify({ $id: 'same', title: 'Schema2' });
    const digest1 = await computeEcsDigest(schema1);
    const digest2 = await computeEcsDigest(schema2);
    expect(digest1).not.toBe(digest2);
  });

  it('throws on invalid JSON', async () => {
    await expect(computeEcsDigest('not json')).rejects.toThrow();
  });
});

// --- classifyEcsTypeByDigest ---

describe('classifyEcsTypeByDigest', () => {
  it('returns null for a non-ECS schema', async () => {
    const schema = JSON.stringify({
      $id: 'vpr:verana:test/cs/v1/js/1',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'CustomCredential',
      type: 'object',
      properties: {},
    });
    const result = await classifyEcsTypeByDigest(schema);
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    const result = await classifyEcsTypeByDigest('not json');
    expect(result).toBeNull();
  });

  it('classifies using digest comparison (mock via config)', async () => {
    // Compute the digest of a test schema and verify classification
    const testSchema = JSON.stringify({ $id: 'test', foo: 'bar' });
    const digest = await computeEcsDigest(testSchema);

    // Load config with this digest as ECS_DIGEST_SERVICE
    loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      ECS_DIGEST_SERVICE: digest,
    });

    const result = await classifyEcsTypeByDigest(testSchema);
    expect(result).toBe('ECS-SERVICE');

    // Restore defaults
    loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    });
  });
});

// --- verifyEcsTrCompleteness ---

function makeSchema(id: string, jsonSchema: string): CredentialSchema {
  return {
    id,
    tr_id: '1',
    title: 'Test',
    description: 'Test schema',
    json_schema: jsonSchema,
    created: '2025-01-01T00:00:00Z',
    modified: '2025-01-01T00:00:00Z',
    archived: null,
    issuer_perm_management_mode: 'OPEN',
    verifier_perm_management_mode: 'OPEN',
    digest_algorithm: 'SHA384',
    participants: 0,
    weight: '0',
    issued: 0,
    verified: 0,
    ecosystem_slash_events: 0,
    ecosystem_slashed_amount: '0',
    network_slash_events: 0,
    network_slashed_amount: '0',
  };
}

// --- Live devnet ECS digest verification ---

const DEVNET_INDEXER = 'https://idx.devnet.verana.network';
const ECS_SCHEMA_IDS = [53, 54, 55, 56];

const SPEC_ECS_DIGESTS: Record<string, string> = {
  'sha384-PVseqJJjEGMVRcht77rE2yLqRnCiLBRLOklSuAshSEXK3eyITmUpDBhpQryJ/XIx': 'ECS-SERVICE',
  'sha384-XF10SsOaav+i+hBaXP29coZWZeaCZocFvfP9ZeHh9B7++q7YGA2QLTbFZqtYs/zA': 'ECS-ORG',
  'sha384-4vkQl6Ro6fudr+g5LL2NQJWVxaSTaYkyf0yVPVUmzA2leNNn0sJIsM07NlOAG/2I': 'ECS-PERSONA',
  'sha384-yLRK2mCokVjRlGX0nVzdEYQ1o6YWpQqgdg6+HlSxCePP+D7wvs0+70TJACLZfbF/': 'ECS-UA',
};

describe('ECS digest verification against devnet indexer', () => {
  it('all 4 devnet ECS schemas (js/53\u201356) match spec [ECS-TR] reference digests', async () => {
    const matched = new Set<string>();

    for (const jsId of ECS_SCHEMA_IDS) {
      const url = `${DEVNET_INDEXER}/verana/cs/v1/js/${jsId}`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      expect(resp.ok, `Failed to fetch ${url}: ${resp.status}`).toBe(true);

      // The endpoint returns the JSON schema object directly
      const jsonSchemaStr = await resp.text();
      const digest = await computeEcsDigest(jsonSchemaStr);
      const ecsType = SPEC_ECS_DIGESTS[digest];

      expect(ecsType, `Schema js/${jsId} digest ${digest} does not match any spec ECS type`).toBeDefined();
      matched.add(ecsType);
    }

    expect(matched.size, `Expected all 4 ECS types, got: ${[...matched].join(', ')}`).toBe(4);
    expect(matched.has('ECS-SERVICE')).toBe(true);
    expect(matched.has('ECS-ORG')).toBe(true);
    expect(matched.has('ECS-PERSONA')).toBe(true);
    expect(matched.has('ECS-UA')).toBe(true);
  }, 15000);
});

// --- verifyEcsTrCompleteness ---

describe('verifyEcsTrCompleteness', () => {
  it('returns incomplete for empty schema list', async () => {
    const result = await verifyEcsTrCompleteness([]);
    expect(result.complete).toBe(false);
    expect(result.missingTypes).toHaveLength(4);
  });

  it('returns incomplete when only some ECS schemas present', async () => {
    // Use config-override trick: make a schema whose digest matches ECS_DIGEST_SERVICE
    const serviceSchema = JSON.stringify({ $id: 'test-service', kind: 'service' });
    const serviceDigest = await computeEcsDigest(serviceSchema);

    loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      ECS_DIGEST_SERVICE: serviceDigest,
    });

    const schemas = [makeSchema('1', serviceSchema)];
    const result = await verifyEcsTrCompleteness(schemas);
    expect(result.complete).toBe(false);
    expect(result.foundTypes.has('ECS-SERVICE')).toBe(true);
    expect(result.missingTypes).toContain('ECS-ORG');
    expect(result.missingTypes).toContain('ECS-PERSONA');
    expect(result.missingTypes).toContain('ECS-UA');

    // Restore defaults
    loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    });
  });

  it('returns complete when all 4 ECS schemas are present', async () => {
    const s1 = JSON.stringify({ $id: 't1', k: 'svc' });
    const s2 = JSON.stringify({ $id: 't2', k: 'org' });
    const s3 = JSON.stringify({ $id: 't3', k: 'persona' });
    const s4 = JSON.stringify({ $id: 't4', k: 'ua' });

    const d1 = await computeEcsDigest(s1);
    const d2 = await computeEcsDigest(s2);
    const d3 = await computeEcsDigest(s3);
    const d4 = await computeEcsDigest(s4);

    loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      ECS_DIGEST_SERVICE: d1,
      ECS_DIGEST_ORG: d2,
      ECS_DIGEST_PERSONA: d3,
      ECS_DIGEST_UA: d4,
    });

    const schemas = [
      makeSchema('1', s1),
      makeSchema('2', s2),
      makeSchema('3', s3),
      makeSchema('4', s4),
    ];
    const result = await verifyEcsTrCompleteness(schemas);
    expect(result.complete).toBe(true);
    expect(result.missingTypes).toHaveLength(0);
    expect(result.foundTypes.size).toBe(4);

    // Restore defaults
    loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    });
  });
});
