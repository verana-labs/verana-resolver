import { getPool } from '../db/index.js';
import { getState, setState } from '../cache/file-cache.js';

const PG_KEY = 'lastProcessedBlock';
const REDIS_KEY = 'lastBlock';

export async function getLastProcessedBlock(): Promise<number> {
  // Try Redis first (faster)
  const redisVal = await getState(REDIS_KEY);
  if (redisVal !== null) {
    const parsed = Number(redisVal);
    if (!Number.isNaN(parsed)) return parsed;
  }

  // Fall back to PostgreSQL
  const pool = getPool();
  const result = await pool.query<{ value: string }>(
    'SELECT value FROM resolver_state WHERE key = $1',
    [PG_KEY],
  );

  if (result.rows.length === 0) return 0;
  return Number(result.rows[0].value) || 0;
}

export async function setLastProcessedBlock(block: number): Promise<void> {
  const pool = getPool();

  // Update PostgreSQL (durable)
  await pool.query(
    `INSERT INTO resolver_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [PG_KEY, String(block)],
  );

  // Update Redis (fast reads)
  await setState(REDIS_KEY, String(block));
}
