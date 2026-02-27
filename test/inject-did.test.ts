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

describe('POST /v1/inject/did \u2014 validation', () => {
  it('returns 400 when body is empty', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/valid "did"/);
  });

  it('returns 400 when did does not start with did:', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: { did: 'notadid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when did is not a string', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: { did: 123 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/inject/did \u2014 pass1 + pass2 success', () => {
  it('runs pass1 and pass2, returns ok for both', async () => {
    const did = 'did:web:example.com';
    mockRunPass1.mockResolvedValue({ succeeded: [did], failed: [] });
    mockRunPass2.mockResolvedValue({ succeeded: [did], failed: [] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: { did },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
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
});

describe('POST /v1/inject/did \u2014 pass1 failure skips pass2', () => {
  it('returns pass1=failed, pass2=skipped when pass1 fails', async () => {
    const did = 'did:web:bad.example.com';
    mockRunPass1.mockResolvedValue({ succeeded: [], failed: [did] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: { did },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pass1).toBe('failed');
    expect(body.pass2).toBe('skipped');
    expect(mockRunPass2).not.toHaveBeenCalled();
  });
});

describe('POST /v1/inject/did \u2014 pass2 failure', () => {
  it('returns pass1=ok, pass2=failed when pass2 fails', async () => {
    const did = 'did:web:evalfail.example.com';
    mockRunPass1.mockResolvedValue({ succeeded: [did], failed: [] });
    mockRunPass2.mockResolvedValue({ succeeded: [], failed: [did] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: { did },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pass1).toBe('ok');
    expect(body.pass2).toBe('failed');
  });
});
