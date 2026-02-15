import { Registry, Gauge, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Collect Node.js default metrics (GC, event loop, memory, etc.)
collectDefaultMetrics({ register: registry });

// --- Gauges ---

export const lastProcessedBlockGauge = new Gauge({
  name: 'resolver_last_processed_block',
  help: 'Last block height processed by the resolver',
  registers: [registry],
});

export const blockLagGauge = new Gauge({
  name: 'resolver_block_lag',
  help: 'Difference between indexer block height and resolver last processed block',
  registers: [registry],
});

export const reattemptableCountGauge = new Gauge({
  name: 'resolver_reattemptable_count',
  help: 'Current number of resources in the reattemptable table',
  registers: [registry],
});

// --- Counters ---

export const trustEvaluationsTotal = new Counter({
  name: 'resolver_trust_evaluations_total',
  help: 'Total number of trust evaluations performed',
  registers: [registry],
});

export const redisHitsTotal = new Counter({
  name: 'resolver_redis_hits_total',
  help: 'Total number of Redis cache hits',
  registers: [registry],
});

export const redisMissesTotal = new Counter({
  name: 'resolver_redis_misses_total',
  help: 'Total number of Redis cache misses',
  registers: [registry],
});

export const indexerCallsTotal = new Counter({
  name: 'resolver_indexer_calls_total',
  help: 'Total number of calls to the Indexer API',
  labelNames: ['endpoint'] as const,
  registers: [registry],
});

// --- Histograms ---

export const queryDurationSeconds = new Histogram({
  name: 'resolver_query_duration_seconds',
  help: 'Duration of HTTP query requests in seconds',
  labelNames: ['endpoint', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});
