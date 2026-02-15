import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/index.js';
import { isRedisReady } from '../cache/redis-client.js';
import { getLastProcessedBlock } from '../polling/resolver-state.js';
import { getConfig } from '../config/index.js';

interface HealthResponse {
  status: 'ok' | 'syncing' | 'degraded';
  lastProcessedBlock: number;
  indexerBlockHeight: number | null;
  blockLag: number | null;
  instanceRole: string;
  postgresConnected: boolean;
  redisConnected: boolean;
}

async function checkPostgres(): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Shared state: set by the polling loop so health can report indexer height
// without making a live call on every health check
let _indexerBlockHeight: number | null = null;

export function setIndexerBlockHeight(height: number): void {
  _indexerBlockHeight = height;
}

export function getIndexerBlockHeight(): number | null {
  return _indexerBlockHeight;
}

function computeStatus(
  lastProcessedBlock: number,
  pgConnected: boolean,
  redisConnected: boolean,
): 'ok' | 'syncing' | 'degraded' {
  if (!pgConnected) return 'degraded';
  if (lastProcessedBlock === 0) return 'syncing';
  if (!redisConnected) return 'degraded';
  return 'ok';
}

export async function registerHealthRoutes(server: FastifyInstance): Promise<void> {
  const config = getConfig();

  // Liveness — returns 200 if the process is running
  server.get('/v1/health', async (_request, reply) => {
    const pgConnected = await checkPostgres();
    const redisConnected = isRedisReady();

    let lastProcessedBlock = 0;
    try {
      lastProcessedBlock = await getLastProcessedBlock();
    } catch {
      // If we can't read state, report 0
    }

    const indexerHeight = _indexerBlockHeight;
    const blockLag = indexerHeight !== null ? indexerHeight - lastProcessedBlock : null;

    const status = computeStatus(lastProcessedBlock, pgConnected, redisConnected);

    const response: HealthResponse = {
      status,
      lastProcessedBlock,
      indexerBlockHeight: indexerHeight,
      blockLag,
      instanceRole: config.INSTANCE_ROLE,
      postgresConnected: pgConnected,
      redisConnected,
    };

    return reply.send(response);
  });

  // Readiness — returns 200 only if initial sync complete and PostgreSQL reachable
  server.get('/v1/health/ready', async (_request, reply) => {
    const pgConnected = await checkPostgres();
    if (!pgConnected) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'PostgreSQL is not reachable',
      });
    }

    let lastProcessedBlock = 0;
    try {
      lastProcessedBlock = await getLastProcessedBlock();
    } catch {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Unable to read resolver state',
      });
    }

    if (lastProcessedBlock === 0) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Resolver not yet synced (lastProcessedBlock = 0)',
      });
    }

    return reply.send({ status: 'ready', lastProcessedBlock });
  });
}
