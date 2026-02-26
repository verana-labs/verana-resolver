import { getPool } from '../db/index.js';
import type { TrustResult } from './types.js';

export interface TrustResultSummary {
  did: string;
  trustStatus: string;
  production: boolean;
  evaluatedAt: string;
  evaluatedAtBlock: number;
  expiresAt: string;
}

export async function getSummaryTrustResult(did: string): Promise<TrustResultSummary | null> {
  const pool = getPool();
  const row = await pool.query(
    `SELECT did, trust_status, production, evaluated_at, evaluated_block, expires_at
     FROM trust_results WHERE did = $1 AND expires_at > NOW()`,
    [did],
  );

  if (row.rows.length === 0) return null;

  const r = row.rows[0];
  return {
    did: r.did,
    trustStatus: r.trust_status,
    production: r.production,
    evaluatedAt: r.evaluated_at.toISOString(),
    evaluatedAtBlock: Number(r.evaluated_block),
    expiresAt: r.expires_at.toISOString(),
  };
}

export async function getFullTrustResult(did: string): Promise<TrustResult | null> {
  const pool = getPool();
  const row = await pool.query(
    `SELECT full_result_json
     FROM trust_results WHERE did = $1 AND expires_at > NOW()`,
    [did],
  );

  if (row.rows.length === 0 || !row.rows[0].full_result_json) return null;
  return row.rows[0].full_result_json as TrustResult;
}

export async function markUntrusted(did: string, block: number, ttlSeconds: number): Promise<void> {
  const pool = getPool();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO trust_results (did, trust_status, production, evaluated_at, evaluated_block, expires_at, full_result_json)
     VALUES ($1, 'UNTRUSTED', false, $2, $3, $4, NULL)
     ON CONFLICT (did) DO UPDATE SET
       trust_status = 'UNTRUSTED',
       production = false,
       evaluated_at = EXCLUDED.evaluated_at,
       evaluated_block = EXCLUDED.evaluated_block,
       expires_at = EXCLUDED.expires_at,
       full_result_json = NULL`,
    [did, now.toISOString(), block, expiresAt.toISOString()],
  );
}

export async function upsertTrustResult(result: TrustResult): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert trust_results (including full JSON for detail=full queries)
    await client.query(
      `INSERT INTO trust_results (did, trust_status, production, evaluated_at, evaluated_block, expires_at, full_result_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (did) DO UPDATE SET
         trust_status = EXCLUDED.trust_status,
         production = EXCLUDED.production,
         evaluated_at = EXCLUDED.evaluated_at,
         evaluated_block = EXCLUDED.evaluated_block,
         expires_at = EXCLUDED.expires_at,
         full_result_json = EXCLUDED.full_result_json`,
      [
        result.did,
        result.trustStatus,
        result.production,
        result.evaluatedAt,
        result.evaluatedAtBlock,
        result.expiresAt,
        JSON.stringify(result),
      ],
    );

    // Delete old credential results for this DID
    await client.query('DELETE FROM credential_results WHERE did = $1', [result.did]);

    // Insert credential results (ON CONFLICT handles duplicate credentials from duplicate VP endpoints)
    for (const cred of result.credentials) {
      await client.query(
        `INSERT INTO credential_results
           (did, credential_id, result_status, ecs_type, schema_id, issuer_did, presented_by, issued_by, perm_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (did, credential_id) DO UPDATE SET
           result_status = EXCLUDED.result_status,
           ecs_type = EXCLUDED.ecs_type,
           schema_id = EXCLUDED.schema_id,
           issuer_did = EXCLUDED.issuer_did,
           presented_by = EXCLUDED.presented_by,
           issued_by = EXCLUDED.issued_by,
           perm_id = EXCLUDED.perm_id`,
        [
          result.did,
          cred.id,
          cred.result,
          cred.ecsType,
          cred.schema?.id ?? null,
          cred.issuedBy,
          cred.presentedBy,
          cred.issuedBy,
          cred.permissionChain[0]?.permissionId ?? null,
        ],
      );
    }

    // Insert failed credentials
    for (const failed of result.failedCredentials) {
      await client.query(
        `INSERT INTO credential_results
           (did, credential_id, result_status, error_reason)
         VALUES ($1, $2, 'FAILED', $3)
         ON CONFLICT (did, credential_id) DO UPDATE SET
           result_status = 'FAILED',
           error_reason = EXCLUDED.error_reason`,
        [result.did, failed.id, failed.error],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
