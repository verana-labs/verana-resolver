import type { IndexerClient } from '../indexer/client.js';
import { resolveTrust, createEvaluationContext } from '../trust/resolve-trust.js';
import { upsertTrustResult } from '../trust/trust-store.js';
import { addReattemptable } from './reattemptable.js';
import pino from 'pino';

const logger = pino({ name: 'pass2' });

export async function runPass2(
  affectedDids: Set<string>,
  indexer: IndexerClient,
  currentBlock: number,
  cacheTtlSeconds: number,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  const ctx = createEvaluationContext(currentBlock, cacheTtlSeconds);

  for (const did of affectedDids) {
    try {
      const result = await resolveTrust(did, indexer, ctx);
      await upsertTrustResult(result);
      succeeded.push(did);
    } catch (err) {
      logger.error({ did, err }, 'Pass2: trust evaluation failed');
      await addReattemptable(did, 'TRUST_EVAL', 'TRANSIENT');
      failed.push(did);
    }
  }

  return { succeeded, failed };
}
