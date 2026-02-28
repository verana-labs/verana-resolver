import type { VerifiablePublicRegistry } from '@verana-labs/verre';
import type { IndexerClient } from '../indexer/client.js';
import type { EnvConfig } from '../config/index.js';
import { tryAcquireLeaderLock, releaseLeaderLock } from './leader.js';
import { getLastProcessedBlock, setLastProcessedBlock } from './resolver-state.js';
import { extractAffectedDids } from './pass1.js';
import { runVerrePass } from './verre-pass.js';
import { getRetryEligible, removeReattemptable, cleanupExpiredRetries } from './reattemptable.js';
import { markUntrusted } from '../trust/trust-store.js';
import { getPool } from '../db/index.js';
import { IndexerWebSocket } from './indexer-ws.js';
import { createLogger } from '../logger.js';

const logger = createLogger('polling-loop');

export interface PollingLoopOptions {
  indexer: IndexerClient;
  config: EnvConfig;
  signal?: AbortSignal;
}

export async function startPollingLoop(opts: PollingLoopOptions): Promise<void> {
  const { indexer, config, signal } = opts;

  // Only leader instances run the polling loop
  const isLeader = await tryAcquireLeaderLock();
  if (!isLeader) {
    logger.info('Not the leader \u2014 skipping polling loop');
    return;
  }

  logger.info('Acquired leader lock \u2014 starting polling loop');

  // Connect to Indexer WebSocket for real-time block notifications.
  // Falls back to POLL_INTERVAL timeout if the WebSocket is unavailable.
  const ws = new IndexerWebSocket(config.INDEXER_API, signal);

  try {
    while (!signal?.aborted) {
      try {
        await pollOnce(indexer, config);
      } catch (err) {
        logger.error({ err }, 'Polling cycle error');
      }

      // Wait for a WebSocket block-processed event or POLL_INTERVAL timeout
      const gotEvent = await ws.waitForBlock(config.POLL_INTERVAL * 1000);
      if (gotEvent) {
        logger.debug('Woke up by WebSocket block-processed event');
      }
    }
  } finally {
    ws.close();
    logger.info('Releasing leader lock');
    await releaseLeaderLock();
  }
}

function parseVprRegistries(json: string): VerifiablePublicRegistry[] {
  try {
    const parsed = JSON.parse(json) as VerifiablePublicRegistry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    logger.warn({ json }, 'Failed to parse VPR_REGISTRIES JSON — using empty list');
    return [];
  }
}

export async function pollOnce(
  indexer: IndexerClient,
  config: EnvConfig,
): Promise<{ blocksProcessed: number; didsAffected: number }> {
  let blocksProcessed = 0;
  let didsAffected = 0;

  // Parse VPR registries for verre
  const verifiablePublicRegistries = parseVprRegistries(config.VPR_REGISTRIES);
  const skipDigestSRICheck = config.DISABLE_DIGEST_SRI_VERIFICATION;

  // Clear Indexer memo per cycle
  indexer.clearMemo();

  // 1. Get current block height from Indexer
  const heightResp = await indexer.getBlockHeight();
  const indexerHeight = heightResp.height;

  // 2. Process blocks sequentially
  let lastBlock = await getLastProcessedBlock();

  while (lastBlock < indexerHeight) {
    const target = lastBlock + 1;

    try {
      // Fetch changes for this block
      const changes = await indexer.listChanges(target);
      const activity = changes.activity;
      const affectedDids = extractAffectedDids(activity);

      // Summarise activity per entity_type, e.g. { trust_registry: 2, credential_schema: 1 }
      const typeCounts: Record<string, number> = {};
      for (const item of activity) {
        typeCounts[item.entity_type] = (typeCounts[item.entity_type] ?? 0) + 1;
      }

      logger.info(
        { block: target, activityCount: activity.length, types: typeCounts, dids: affectedDids.size },
        'Processed block',
      );

      if (affectedDids.size > 0) {

        // Unified verre pass: DID resolution + VP dereferencing + trust evaluation
        await runVerrePass(affectedDids, indexer, target, config.TRUST_TTL, verifiablePublicRegistries, skipDigestSRICheck);

        // Retry eligible failures from previous cycles
        await retryEligibleDids(indexer, target, config, verifiablePublicRegistries, skipDigestSRICheck);

        didsAffected += affectedDids.size;
      }

      // Atomically update lastProcessedBlock
      await setLastProcessedBlock(target);
      lastBlock = target;
      blocksProcessed++;
    } catch (err) {
      logger.error({ block: target, err }, 'Block processing failed \u2014 skipping to TTL refresh');
      break;
    }
  }

  // 3. TTL-driven refresh (runs regardless of block processing errors)
  await refreshExpiredEvaluations(indexer, lastBlock, config, verifiablePublicRegistries, skipDigestSRICheck);

  // 4. Cleanup permanently failed retries \u2192 mark UNTRUSTED
  const expired = await cleanupExpiredRetries(config.POLL_OBJECT_CACHING_RETRY_DAYS);
  if (expired.length > 0) {
    for (const resourceId of expired) {
      if (resourceId.startsWith('did:')) {
        await markUntrusted(resourceId, lastBlock, config.TRUST_TTL);
      }
    }
    logger.info({ count: expired.length }, 'Cleaned up expired reattemptable resources \u2014 marked UNTRUSTED');
  }

  return { blocksProcessed, didsAffected };
}

async function retryEligibleDids(
  indexer: IndexerClient,
  currentBlock: number,
  config: EnvConfig,
  verifiablePublicRegistries: VerifiablePublicRegistry[],
  skipDigestSRICheck: boolean,
): Promise<void> {
  const eligible = await getRetryEligible(config.POLL_OBJECT_CACHING_RETRY_DAYS);
  if (eligible.length === 0) return;

  // Collect all unique DIDs from eligible retries (DID_DOC, VP, and TRUST_EVAL)
  const dids = new Set(
    eligible
      .map((r) => r.resourceId)
      .filter((id) => id.startsWith('did:')),
  );
  if (dids.size === 0) return;

  const result = await runVerrePass(dids, indexer, currentBlock, config.TRUST_TTL, verifiablePublicRegistries, skipDigestSRICheck);

  // Remove successfully retried resources
  for (const did of result.succeeded) {
    await removeReattemptable(did);
  }
}

async function refreshExpiredEvaluations(
  indexer: IndexerClient,
  currentBlock: number,
  config: EnvConfig,
  verifiablePublicRegistries: VerifiablePublicRegistry[],
  skipDigestSRICheck: boolean,
): Promise<void> {
  const pool = getPool();
  const refreshWindowSeconds = Math.floor(config.TRUST_TTL * config.TRUST_TTL_REFRESH_RATIO);
  const result = await pool.query<{ did: string }>(
    `SELECT did FROM trust_results
     WHERE expires_at <= NOW() + $1 * INTERVAL '1 second'
     ORDER BY expires_at ASC LIMIT 100`,
    [refreshWindowSeconds],
  );

  if (result.rows.length === 0) return;

  const refreshDids = new Set(result.rows.map((r) => r.did));
  logger.info(
    { count: refreshDids.size, refreshWindowSeconds },
    'Refreshing trust evaluations approaching expiration',
  );

  await runVerrePass(refreshDids, indexer, currentBlock, config.TRUST_TTL, verifiablePublicRegistries, skipDigestSRICheck);
}
