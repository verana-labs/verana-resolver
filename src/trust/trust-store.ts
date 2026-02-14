import { getPool } from '../db/index.js';
import type { TrustResult, CredentialEvaluation } from './types.js';

export async function getCachedTrustResult(did: string): Promise<TrustResult | null> {
  const pool = getPool();
  const row = await pool.query(
    `SELECT did, trust_status, production, evaluated_at, evaluated_block, expires_at
     FROM trust_results WHERE did = $1 AND expires_at > NOW()`,
    [did],
  );

  if (row.rows.length === 0) return null;

  const r = row.rows[0];

  // Fetch associated credential results
  const credRows = await pool.query(
    `SELECT credential_id, result_status, ecs_type, schema_id, issuer_did,
            presented_by, issued_by, perm_id, error_reason
     FROM credential_results WHERE did = $1`,
    [did],
  );

  const credentials: CredentialEvaluation[] = [];
  for (const cr of credRows.rows) {
    if (cr.result_status !== 'FAILED') {
      credentials.push({
        result: cr.result_status,
        ecsType: cr.ecs_type ?? null,
        presentedBy: cr.presented_by ?? '',
        issuedBy: cr.issued_by ?? '',
        id: cr.credential_id,
        type: 'VerifiableTrustCredential',
        format: 'W3C_VTC',
        claims: {},
        permissionChain: [],
      });
    }
  }

  return {
    did: r.did,
    trustStatus: r.trust_status,
    production: r.production,
    evaluatedAt: r.evaluated_at.toISOString(),
    evaluatedAtBlock: Number(r.evaluated_block),
    expiresAt: r.expires_at.toISOString(),
    credentials,
    failedCredentials: [],
  };
}

export async function upsertTrustResult(result: TrustResult): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert trust_results
    await client.query(
      `INSERT INTO trust_results (did, trust_status, production, evaluated_at, evaluated_block, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (did) DO UPDATE SET
         trust_status = EXCLUDED.trust_status,
         production = EXCLUDED.production,
         evaluated_at = EXCLUDED.evaluated_at,
         evaluated_block = EXCLUDED.evaluated_block,
         expires_at = EXCLUDED.expires_at`,
      [
        result.did,
        result.trustStatus,
        result.production,
        result.evaluatedAt,
        result.evaluatedAtBlock,
        result.expiresAt,
      ],
    );

    // Delete old credential results for this DID
    await client.query('DELETE FROM credential_results WHERE did = $1', [result.did]);

    // Insert credential results
    for (const cred of result.credentials) {
      await client.query(
        `INSERT INTO credential_results
           (did, credential_id, result_status, ecs_type, schema_id, issuer_did, presented_by, issued_by, perm_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
