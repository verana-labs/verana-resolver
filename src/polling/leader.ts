import { getPool } from '../db/index.js';

const ADVISORY_LOCK_ID = 123456789;

export async function tryAcquireLeaderLock(): Promise<boolean> {
  const pool = getPool();
  try {
    const result = await pool.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [ADVISORY_LOCK_ID],
    );
    return result.rows[0]?.acquired ?? false;
  } catch {
    return false;
  }
}

export async function releaseLeaderLock(): Promise<void> {
  const pool = getPool();
  try {
    await pool.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
  } catch {
    // Best effort
  }
}
