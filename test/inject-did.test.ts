import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createInjectDidRoute } from '../src/routes/inject-did.js';
import type { EnvConfig } from '../src/config/index.js';
import type { IndexerClient } from '../src/indexer/client.js';

// Mock pass1 and pass2
vi.mock('../src/polling/pass1.js', () => ({
  runPass1: vi.fn(),
}));

vi.mock('../src/polling/pass2.js', () => ({
  runPass2: vi.fn(),
}));

import { runPass1 } from '../src/polling/pass1.js';
import { runPass2 } from '../src/polling/pass2.js';

const mockRunPass1 = vi.mocked(runPass1);
const mockRunPass2 = vi.mocked(runPass2);

const mockIndexer = {
  getBlockHeight: vi.fn().mockResolvedValue({ height: 500 }),
  clearMemo: vi.fn(),
} as unknown as IndexerClient;

const baseConfig: EnvConfig = {
  POLL_INTERVAL: 5,
  CACHE_TTL: 86400,
  TRUST_TTL: 3600,
  TRUST_TTL_REFRESH_RATIO: 0.2,
  POLL_OBJECT_CACHING_RETRY_DAYS: 7,
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: 5432,
  POSTGRES_USER: 'verana',
  POSTGRES_PASSWORD: 'verana',
  POSTGRES_DB: 'verana_resolver',
  REDIS_URL: 'redis://localhost:6379',
  INSTANCE_ROLE: 'leader',
  INDEXER_API: 'http://localhost:1317',
  ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
  ENABLE_POLLING: true,
  INJECT_DID_ENDPOINT_ENABLED: true,
  DISABLE_DIGEST_SRI_VERIFICATION: false,
  ECS_DIGEST_SERVICE: 'sha384-test',
  ECS_DIGEST_ORG: 'sha384-test',
  ECS_DIGEST_PERSONA: 'sha384-test',
  ECS_DIGEST_UA: 'sha384-test',
  PORT: 3000,
  LOG_LEVEL: 'info',
};

async function buildApp() {
  const app = Fastify();
  await createInjectDidRoute(mockIndexer, baseConfig)(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  (mockIndexer.getBlockHeight as ReturnType<typeof vi.fn>).mockResolvedValue({ height: 500 });
});

describe('POST /v1/inject/did — validation', () => {
  it('returns 400 when body is empty', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/inject/did', payload: {} });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('did is required');
  });

  it('returns 400 when did is not a string', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/inject/did', payload: { did: 123 } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when did does not start with did:', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/inject/did', payload: { did: 'notadid' } });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('did must start with "did:"');
  });
});

describe('POST /v1/inject/did — happy path', () => {
  it('calls runPass1 and runPass2 with correct arguments', async () => {
    const did = 'did:web:example.com';
    mockRunPass1.mockResolvedValue({ succeeded: [did], failed: [] });
    mockRunPass2.mockResolvedValue({ succeeded: [did], failed: [] });

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/inject/did', payload: { did } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.did).toBe(did);
    expect(body.pass1).toBe('ok');
    expect(body.pass2).toBe('ok');

    expect(mockRunPass1).toHaveBeenCalledWith(
      new Set([did]),
      mockIndexer,
      500,
      baseConfig.TRUST_TTL,
    );
    expect(mockRunPass2).toHaveBeenCalledWith(
      new Set([did]),
      mockIndexer,
      500,
      baseConfig.TRUST_TTL,
      new Set(['did:web:ecosystem.example.com']),
    );
  });

  it('reports pass1 failure', async () => {
    const did = 'did:web:example.com';
    mockRunPass1.mockResolvedValue({ succeeded: [], failed: [did] });
    mockRunPass2.mockResolvedValue({ succeeded: [], failed: [did] });

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/inject/did', payload: { did } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pass1).toBe('failed');
  });

  it('reports pass2 failure', async () => {
    const did = 'did:web:example.com';
    mockRunPass1.mockResolvedValue({ succeeded: [did], failed: [] });
    mockRunPass2.mockResolvedValue({ succeeded: [], failed: [did] });

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/inject/did', payload: { did } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pass1).toBe('ok');
    expect(body.pass2).toBe('failed');
  });

  it('returns 500 when pass1 throws', async () => {
    const did = 'did:web:example.com';
    mockRunPass1.mockRejectedValue(new Error('boom'));

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/inject/did', payload: { did } });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Internal Server Error');
  });
});
