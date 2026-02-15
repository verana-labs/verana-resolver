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
  allowedEcosystemDids: Set<string>,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  logger.info({ didCount: affectedDids.size, block: currentBlock }, 'Pass2 started \u2014 trust evaluation');

  const ctx = createEvaluationContext(currentBlock, cacheTtlSeconds, allowedEcosystemDids);

  for (const did of affectedDids) {
    try {
      logger.debug({ did }, 'Pass2: evaluating trust');
      const result = await resolveTrust(did, indexer, ctx);
      await upsertTrustResult(result);
      const validCount = result.credentials.filter((c) => c.result === 'VALID').length;
      const ignoredCount = result.credentials.filter((c) => c.result === 'IGNORED').length;
      logger.info(
        { did, trustStatus: result.trustStatus, production: result.production, validCredentials: validCount, ignoredCredentials: ignoredCount, failedCredentials: result.failedCredentials.length },
        'Pass2: DID trust evaluated and stored',
      );
      if (result.trustStatus === 'UNTRUSTED' && result.failedCredentials.length > 0) {
        for (const f of result.failedCredentials) {
          logger.debug(
            { did, vcId: f.id, errorCode: f.errorCode, error: f.error, format: f.format },
            'Pass2: credential failure detail',
          );
        }
      }
      succeeded.push(did);
    } catch (err) {
      logger.error({ did, err }, 'Pass2: trust evaluation failed');
      await addReattemptable(did, 'TRUST_EVAL', 'TRANSIENT');
      failed.push(did);
    }
  }

  logger.info({ succeeded: succeeded.length, failed: failed.length, block: currentBlock }, 'Pass2 complete');
  return { succeeded, failed };
}
