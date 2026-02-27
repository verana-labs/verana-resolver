import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('loads valid configuration from env', () => {
    const config = loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'verana',
      POSTGRES_PASSWORD: 'verana',
      POSTGRES_DB: 'verana_resolver',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    });
    expect(config.POSTGRES_PORT).toBe(5432);
    expect(config.POLL_INTERVAL).toBe(5);
    expect(config.CACHE_TTL).toBe(86400);
    expect(config.TRUST_TTL).toBe(3600);
    expect(config.TRUST_TTL_REFRESH_RATIO).toBe(0.2);
    expect(config.POLL_OBJECT_CACHING_RETRY_DAYS).toBe(7);
    expect(config.INSTANCE_ROLE).toBe('leader');
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.ECS_ECOSYSTEM_DIDS).toBe('did:web:ecosystem.example.com');
  });

  it('overrides defaults with provided values', () => {
    const config = loadConfig({
      POSTGRES_HOST: 'db.example.com',
      POSTGRES_PORT: '5433',
      POSTGRES_USER: 'admin',
      POSTGRES_PASSWORD: 'secret',
      POSTGRES_DB: 'mydb',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://indexer:1317',
      POLL_INTERVAL: '10',
      CACHE_TTL: '43200',
      TRUST_TTL: '1800',
      TRUST_TTL_REFRESH_RATIO: '0.3',
      INSTANCE_ROLE: 'reader',
      PORT: '8080',
      LOG_LEVEL: 'debug',
      ECS_ECOSYSTEM_DIDS: 'did:web:eco1.example.com,did:web:eco2.example.com',
    });
    expect(config.POSTGRES_HOST).toBe('db.example.com');
    expect(config.POSTGRES_PORT).toBe(5433);
    expect(config.POLL_INTERVAL).toBe(10);
    expect(config.CACHE_TTL).toBe(43200);
    expect(config.TRUST_TTL).toBe(1800);
    expect(config.TRUST_TTL_REFRESH_RATIO).toBe(0.3);
    expect(config.INSTANCE_ROLE).toBe('reader');
    expect(config.PORT).toBe(8080);
    expect(config.LOG_LEVEL).toBe('debug');
    expect(config.ECS_ECOSYSTEM_DIDS).toBe('did:web:eco1.example.com,did:web:eco2.example.com');
  });

  it('throws on missing required POSTGRES_HOST', () => {
    expect(() =>
      loadConfig({
        POSTGRES_USER: 'verana',
        POSTGRES_PASSWORD: 'verana',
        POSTGRES_DB: 'verana_resolver',
        REDIS_URL: 'redis://localhost:6379',
        INDEXER_API: 'http://localhost:1317',
        ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      }),
    ).toThrow('Invalid configuration');
  });

  it('throws on missing required REDIS_URL', () => {
    expect(() =>
      loadConfig({
        POSTGRES_HOST: 'localhost',
        POSTGRES_USER: 'verana',
        POSTGRES_PASSWORD: 'verana',
        POSTGRES_DB: 'verana_resolver',
        INDEXER_API: 'http://localhost:1317',
        ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      }),
    ).toThrow('Invalid configuration');
  });

  it('throws on missing required INDEXER_API', () => {
    expect(() =>
      loadConfig({
        POSTGRES_HOST: 'localhost',
        POSTGRES_USER: 'verana',
        POSTGRES_PASSWORD: 'verana',
        POSTGRES_DB: 'verana_resolver',
        REDIS_URL: 'redis://localhost:6379',
        ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      }),
    ).toThrow('Invalid configuration');
  });

  it('throws on missing required ECS_ECOSYSTEM_DIDS', () => {
    expect(() =>
      loadConfig({
        POSTGRES_HOST: 'localhost',
        POSTGRES_USER: 'verana',
        POSTGRES_PASSWORD: 'verana',
        POSTGRES_DB: 'verana_resolver',
        REDIS_URL: 'redis://localhost:6379',
        INDEXER_API: 'http://localhost:1317',
      }),
    ).toThrow('Invalid configuration');
  });

  it('throws on invalid INSTANCE_ROLE', () => {
    expect(() =>
      loadConfig({
        POSTGRES_HOST: 'localhost',
        POSTGRES_USER: 'verana',
        POSTGRES_PASSWORD: 'verana',
        POSTGRES_DB: 'verana_resolver',
        REDIS_URL: 'redis://localhost:6379',
        INDEXER_API: 'http://localhost:1317',
        ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
        INSTANCE_ROLE: 'invalid',
      }),
    ).toThrow('Invalid configuration');
  });
});
