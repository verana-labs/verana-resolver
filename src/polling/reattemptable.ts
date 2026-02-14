import { getPool } from '../db/index.js';

export async function addReattemptable(
  resourceId: string,
  resourceType: string,
  errorType: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO reattemptable (resource_id, resource_type, first_failure, last_retry, error_type, retry_count)
     VALUES ($1, $2, NOW(), NOW(), $3, 0)
     ON CONFLICT (resource_id) DO UPDATE SET
       last_retry = NOW(),
       error_type = EXCLUDED.error_type,
       retry_count = reattemptable.retry_count + 1`,
    [resourceId, resourceType, errorType],
  );
}

export async function getRetryEligible(
  maxRetryDays: number,
): Promise<Array<{ resourceId: string; resourceType: string }>> {
  const pool = getPool();
  const result = await pool.query<{ resource_id: string; resource_type: string }>(
    `SELECT resource_id, resource_type FROM reattemptable
     WHERE last_retry < NOW() - INTERVAL '1 day'
       AND first_failure > NOW() - $1::interval
     ORDER BY last_retry ASC
     LIMIT 100`,
    [`${maxRetryDays} days`],
  );

  return result.rows.map((r) => ({
    resourceId: r.resource_id,
    resourceType: r.resource_type,
  }));
}

export async function removeReattemptable(resourceId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM reattemptable WHERE resource_id = $1', [resourceId]);
}

export async function cleanupExpiredRetries(maxRetryDays: number): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query<{ resource_id: string }>(
    `DELETE FROM reattemptable
     WHERE first_failure <= NOW() - $1::interval
     RETURNING resource_id`,
    [`${maxRetryDays} days`],
  );
  return result.rows.map((r) => r.resource_id);
}
