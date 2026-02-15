import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// --- Mock dependencies ---

vi.mock('../src/db/index.js', () => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
  return {
    getPool: vi.fn().mockReturnValue({
      query: mockQuery,
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
    }),
    query: mockQuery,
  };
});

vi.mock('../src/cache/redis-client.js', () => ({
  getRedis: vi.fn(),
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  isRedisReady: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/cache/file-cache.js', () => ({
  getState: vi.fn().mockResolvedValue(null),
  setState: vi.fn().mockResolvedValue(undefined),
  getCachedFile: vi.fn().mockResolvedValue(null),
  setCachedFile: vi.fn().mockResolvedValue(undefined),
  deleteCachedFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/config/index.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5432,
    POSTGRES_USER: 'verana',
    POSTGRES_PASSWORD: 'verana',
    POSTGRES_DB: 'test',
    REDIS_URL: 'redis://localhost:6379',
    INDEXER_API: 'http://localhost:1317',
    INSTANCE_ROLE: 'leader',
    PORT: 3000,
    LOG_LEVEL: 'info',
    POLL_INTERVAL: 5,
    CACHE_TTL: 86400,
    TRUST_TTL: 3600,
    POLL_OBJECT_CACHING_RETRY_DAYS: 7,
    ECS_ECOSYSTEM_DIDS: '',
  }),
  getConfig: vi.fn().mockReturnValue({
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5432,
    POSTGRES_USER: 'verana',
    POSTGRES_PASSWORD: 'verana',
    POSTGRES_DB: 'test',
    REDIS_URL: 'redis://localhost:6379',
    INDEXER_API: 'http://localhost:1317',
    INSTANCE_ROLE: 'leader',
    PORT: 3000,
    LOG_LEVEL: 'info',
    POLL_INTERVAL: 5,
    CACHE_TTL: 86400,
    TRUST_TTL: 3600,
    POLL_OBJECT_CACHING_RETRY_DAYS: 7,
    ECS_ECOSYSTEM_DIDS: '',
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /v1/health', () => {
  it('returns ok status when postgres and redis are connected and block > 0', async () => {
    const { getState } = await import('../src/cache/file-cache.js');
    vi.mocked(getState).mockResolvedValueOnce('42');

    const { registerHealthRoutes, setIndexerBlockHeight } = await import('../src/routes/health.js');
    setIndexerBlockHeight(50);

    const server = Fastify({ logger: false });
    await registerHealthRoutes(server);
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/v1/health' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.lastProcessedBlock).toBe(42);
    expect(body.indexerBlockHeight).toBe(50);
    expect(body.blockLag).toBe(8);
    expect(body.instanceRole).toBe('leader');
    expect(body.postgresConnected).toBe(true);
    expect(body.redisConnected).toBe(true);

    await server.close();
  });

  it('returns syncing status when lastProcessedBlock is 0', async () => {
    const { getState } = await import('../src/cache/file-cache.js');
    vi.mocked(getState).mockResolvedValueOnce(null);

    const { getPool } = await import('../src/db/index.js');
    vi.mocked(getPool().query as any).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    vi.mocked(getPool().query as any).mockResolvedValueOnce({ rows: [] });

    const { registerHealthRoutes } = await import('../src/routes/health.js');

    const server = Fastify({ logger: false });
    await registerHealthRoutes(server);
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/v1/health' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('syncing');
    expect(body.lastProcessedBlock).toBe(0);

    await server.close();
  });

  it('returns degraded status when postgres is down', async () => {
    const { getPool } = await import('../src/db/index.js');
    vi.mocked(getPool().query as any).mockRejectedValueOnce(new Error('connection refused'));

    const { registerHealthRoutes } = await import('../src/routes/health.js');

    const server = Fastify({ logger: false });
    await registerHealthRoutes(server);
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/v1/health' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.postgresConnected).toBe(false);

    await server.close();
  });

  it('returns degraded status when redis is down', async () => {
    const { isRedisReady } = await import('../src/cache/redis-client.js');
    vi.mocked(isRedisReady).mockReturnValueOnce(false);

    const { getState } = await import('../src/cache/file-cache.js');
    vi.mocked(getState).mockResolvedValueOnce(null);

    const { getPool } = await import('../src/db/index.js');
    vi.mocked(getPool().query as any).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    vi.mocked(getPool().query as any).mockResolvedValueOnce({ rows: [{ value: '10' }] });

    const { registerHealthRoutes } = await import('../src/routes/health.js');

    const server = Fastify({ logger: false });
    await registerHealthRoutes(server);
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/v1/health' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.redisConnected).toBe(false);

    await server.close();
  });
});

describe('GET /v1/health/ready', () => {
  it('returns 200 when synced and postgres connected', async () => {
    const { getState } = await import('../src/cache/file-cache.js');
    vi.mocked(getState).mockResolvedValueOnce('100');

    const { registerHealthRoutes } = await import('../src/routes/health.js');

    const server = Fastify({ logger: false });
    await registerHealthRoutes(server);
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/v1/health/ready' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.lastProcessedBlock).toBe(100);

    await server.close();
  });

  it('returns 503 when not yet synced (block = 0)', async () => {
    const { getState } = await import('../src/cache/file-cache.js');
    vi.mocked(getState).mockResolvedValueOnce(null);

    const { getPool } = await import('../src/db/index.js');
    vi.mocked(getPool().query as any).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    vi.mocked(getPool().query as any).mockResolvedValueOnce({ rows: [] });

    const { registerHealthRoutes } = await import('../src/routes/health.js');

    const server = Fastify({ logger: false });
    await registerHealthRoutes(server);
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/v1/health/ready' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(503);
    expect(body.error).toBe('Service Unavailable');

    await server.close();
  });

  it('returns 503 when postgres is unreachable', async () => {
    const { getPool } = await import('../src/db/index.js');
    vi.mocked(getPool().query as any).mockRejectedValueOnce(new Error('connection refused'));

    const { registerHealthRoutes } = await import('../src/routes/health.js');

    const server = Fastify({ logger: false });
    await registerHealthRoutes(server);
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/v1/health/ready' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(503);
    expect(body.message).toContain('PostgreSQL');

    await server.close();
  });
});
