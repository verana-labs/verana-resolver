import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('db client configuration', () => {
  beforeEach(() => {
    loadConfig({
      DATABASE_URL: 'postgresql://localhost:5432/verana_resolver_test',
      REDIS_URL: 'redis://localhost:6379',
    });
  });

  it('config includes DATABASE_URL', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost:5432/verana_resolver_test',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(config.DATABASE_URL).toBe('postgresql://localhost:5432/verana_resolver_test');
  });

  it('rejects invalid DATABASE_URL', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'not-a-url',
        REDIS_URL: 'redis://localhost:6379',
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
