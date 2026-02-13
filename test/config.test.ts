import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('loads valid configuration from env', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(config.POLL_INTERVAL).toBe(5);
    expect(config.CACHE_TTL).toBe(86400);
    expect(config.TRUST_TTL).toBe(3600);
    expect(config.POLL_OBJECT_CACHING_RETRY_DAYS).toBe(7);
    expect(config.INSTANCE_ROLE).toBe('leader');
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('overrides defaults with provided values', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      POLL_INTERVAL: '10',
      CACHE_TTL: '43200',
      TRUST_TTL: '1800',
      INSTANCE_ROLE: 'reader',
      PORT: '8080',
      LOG_LEVEL: 'debug',
    });
    expect(config.POLL_INTERVAL).toBe(10);
    expect(config.CACHE_TTL).toBe(43200);
    expect(config.TRUST_TTL).toBe(1800);
    expect(config.INSTANCE_ROLE).toBe('reader');
    expect(config.PORT).toBe(8080);
    expect(config.LOG_LEVEL).toBe('debug');
  });

  it('throws on missing required DATABASE_URL', () => {
    expect(() =>
      loadConfig({
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow('Invalid configuration');
  });

  it('throws on missing required REDIS_URL', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://localhost:5432/test',
      }),
    ).toThrow('Invalid configuration');
  });

  it('throws on invalid INSTANCE_ROLE', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        INSTANCE_ROLE: 'invalid',
      }),
    ).toThrow('Invalid configuration');
  });
});
