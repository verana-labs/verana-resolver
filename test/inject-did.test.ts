import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createInjectDidRoute } from '../src/routes/inject-did.js';
import type { EnvConfig } from '../src/config/index.js';
import type { IndexerClient } from '../src/indexer/client.js';

// Mock verre pass
vi.mock('../src/polling/verre-pass.js', () => ({
  runVerrePass: vi.fn(),
}));

import { runVerrePass } from '../src/polling/verre-pass.js';

const mockRunVerrePass = vi.mocked(runVerrePass);

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
  VPR_REGISTRIES: '[]',
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

describe('POST /v1/inject/did — verre pass success', () => {
  it('runs verre pass and returns ok', async () => {
    const did = 'did:web:example.com';
    mockRunVerrePass.mockResolvedValue({ succeeded: [did], failed: [] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: { did },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.did).toBe(did);
    expect(body.result).toBe('ok');

    expect(mockRunVerrePass).toHaveBeenCalledWith(
      new Set([did]),
      mockIndexer,
      500,
      baseConfig.TRUST_TTL,
      [],
      false,
    );
  });
});

describe('POST /v1/inject/did — verre pass failure', () => {
  it('returns result=failed when verre pass fails', async () => {
    const did = 'did:web:bad.example.com';
    mockRunVerrePass.mockResolvedValue({ succeeded: [], failed: [did] });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/inject/did',
      payload: { did },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe('failed');
  });
});
