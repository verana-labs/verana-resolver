import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = new URL('../../migrations', import.meta.url).pathname;

interface MigrationRecord {
  id: number;
  name: string;
  applied_at: Date;
}

export async function ensureMigrationsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getAppliedMigrations(pool: pg.Pool): Promise<string[]> {
  const result = await pool.query<MigrationRecord>(
    'SELECT name FROM schema_migrations ORDER BY id ASC',
  );
  return result.rows.map((row) => row.name);
}

export async function getPendingMigrations(pool: pg.Pool): Promise<string[]> {
  const applied = await getAppliedMigrations(pool);
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
  return sqlFiles.filter((f) => !applied.includes(f));
}

export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const pending = await getPendingMigrations(pool);

  const applied: string[] = [];
  for (const migration of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, migration), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration]);
      await client.query('COMMIT');
      applied.push(migration);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${migration} failed: ${String(err)}`);
    } finally {
      client.release();
    }
  }

  return applied;
}
