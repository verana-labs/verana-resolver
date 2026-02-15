import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('db client configuration', () => {
  beforeEach(() => {
    loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_USER: 'verana',
      POSTGRES_PASSWORD: 'verana',
      POSTGRES_DB: 'verana_resolver_test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    });
  });

  it('config includes POSTGRES_* vars', () => {
    const config = loadConfig({
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'verana',
      POSTGRES_PASSWORD: 'verana',
      POSTGRES_DB: 'verana_resolver_test',
      REDIS_URL: 'redis://localhost:6379',
      INDEXER_API: 'http://localhost:1317',
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    });
    expect(config.POSTGRES_HOST).toBe('localhost');
    expect(config.POSTGRES_PORT).toBe(5432);
    expect(config.POSTGRES_DB).toBe('verana_resolver_test');
  });

  it('rejects missing POSTGRES_HOST', () => {
    expect(() =>
      loadConfig({
        POSTGRES_USER: 'verana',
        POSTGRES_PASSWORD: 'verana',
        POSTGRES_DB: 'verana_resolver_test',
        REDIS_URL: 'redis://localhost:6379',
        INDEXER_API: 'http://localhost:1317',
        ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      }),
    ).toThrow('Invalid configuration');
  });
});

describe('migration SQL', () => {
  it('001_initial_schema.sql exists and contains expected tables', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const migrationsDir = join(import.meta.dirname, '..', 'migrations');
    const sql = await readFile(join(migrationsDir, '001_initial_schema.sql'), 'utf-8');

    expect(sql).toContain('CREATE TABLE trust_results');
    expect(sql).toContain('CREATE TABLE credential_results');
    expect(sql).toContain('CREATE TABLE reattemptable');
    expect(sql).toContain('CREATE TABLE resolver_state');
    expect(sql).toContain("INSERT INTO resolver_state (key, value) VALUES ('lastProcessedBlock', '0')");
    expect(sql).toContain('idx_trust_expires');
    expect(sql).toContain('idx_cred_did');
  });
});
