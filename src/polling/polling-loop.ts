import type { IndexerClient } from '../indexer/client.js';
import type { EnvConfig } from '../config/index.js';
import { tryAcquireLeaderLock, releaseLeaderLock } from './leader.js';
import { getLastProcessedBlock, setLastProcessedBlock } from './resolver-state.js';
import { extractAffectedDids, runPass1 } from './pass1.js';
import { runPass2 } from './pass2.js';
import { getRetryEligible, removeReattemptable, cleanupExpiredRetries } from './reattemptable.js';
import { markUntrusted } from '../trust/trust-store.js';
import { getPool } from '../db/index.js';
import pino from 'pino';

const logger = pino({ name: 'polling-loop' });

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

  try {
    while (!signal?.aborted) {
      try {
        await pollOnce(indexer, config);
      } catch (err) {
        logger.error({ err }, 'Polling cycle error');
      }

      // Sleep for POLL_INTERVAL seconds
      await sleep(config.POLL_INTERVAL * 1000, signal);
    }
  } finally {
    logger.info('Releasing leader lock');
    await releaseLeaderLock();
  }
}

export async function pollOnce(
  indexer: IndexerClient,
  config: EnvConfig,
): Promise<{ blocksProcessed: number; didsAffected: number }> {
  let blocksProcessed = 0;
  let didsAffected = 0;

  // Parse allowed ecosystem DIDs from config
  const allowedEcosystemDids = new Set(
    config.ECS_ECOSYSTEM_DIDS.split(',').map((d) => d.trim()).filter(Boolean),
  );

  // Clear Indexer memo per cycle
  indexer.clearMemo();

  // 1. Get current block height from Indexer
  const heightResp = await indexer.getBlockHeight();
  const indexerHeight = heightResp.height;

  // 2. Process blocks sequentially
  let lastBlock = await getLastProcessedBlock();

  while (lastBlock < indexerHeight) {
    const target = lastBlock + 1;

    // Fetch changes for this block
    const changes = await indexer.listChanges(target);
    const affectedDids = extractAffectedDids(changes.activity);

    if (affectedDids.size > 0) {
      logger.info({ block: target, dids: affectedDids.size }, 'Processing block');

      // Pass1: dereference affected DIDs
      await runPass1(affectedDids, indexer, target, config.TRUST_TTL);

      // Retry eligible Pass1 failures
      await retryEligiblePass1(indexer, target, config);

      // Pass2: re-evaluate trust
      await runPass2(affectedDids, indexer, target, config.TRUST_TTL, allowedEcosystemDids);

      // Retry eligible Pass2 failures
      await retryEligiblePass2(indexer, target, config, allowedEcosystemDids);

      didsAffected += affectedDids.size;
    }

    // Atomically update lastProcessedBlock
    await setLastProcessedBlock(target);
    lastBlock = target;
    blocksProcessed++;
  }

  // 3. TTL-driven refresh (does NOT advance lastProcessedBlock)
  await refreshExpiredEvaluations(indexer, lastBlock, config, allowedEcosystemDids);

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

async function retryEligiblePass1(
  indexer: IndexerClient,
  currentBlock: number,
  config: EnvConfig,
): Promise<void> {
  const eligible = await getRetryEligible(config.POLL_OBJECT_CACHING_RETRY_DAYS);
  const pass1Eligible = eligible.filter(
    (r) => r.resourceType === 'DID_DOC' || r.resourceType === 'VP',
  );

  if (pass1Eligible.length === 0) return;

  const dids = new Set(pass1Eligible.map((r) => r.resourceId));
  const result = await runPass1(dids, indexer, currentBlock, config.TRUST_TTL);

  // Remove successfully retried resources
  for (const did of result.succeeded) {
    await removeReattemptable(did);
  }
}

async function retryEligiblePass2(
  indexer: IndexerClient,
  currentBlock: number,
  config: EnvConfig,
  allowedEcosystemDids: Set<string>,
): Promise<void> {
  const eligible = await getRetryEligible(config.POLL_OBJECT_CACHING_RETRY_DAYS);
  const pass2Eligible = eligible.filter((r) => r.resourceType === 'TRUST_EVAL');

  if (pass2Eligible.length === 0) return;

  const dids = new Set(pass2Eligible.map((r) => r.resourceId));
  const result = await runPass2(dids, indexer, currentBlock, config.TRUST_TTL, allowedEcosystemDids);

  for (const did of result.succeeded) {
    await removeReattemptable(did);
  }
}

async function refreshExpiredEvaluations(
  indexer: IndexerClient,
  currentBlock: number,
  config: EnvConfig,
  allowedEcosystemDids: Set<string>,
): Promise<void> {
  const pool = getPool();
  const result = await pool.query<{ did: string }>(
    'SELECT did FROM trust_results WHERE expires_at <= NOW() ORDER BY expires_at ASC LIMIT 100',
  );

  if (result.rows.length === 0) return;

  const expiredDids = new Set(result.rows.map((r) => r.did));
  logger.info({ count: expiredDids.size }, 'Refreshing expired trust evaluations');

  await runPass1(expiredDids, indexer);
  await runPass2(expiredDids, indexer, currentBlock, config.TRUST_TTL, allowedEcosystemDids);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
