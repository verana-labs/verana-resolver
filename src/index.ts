import Fastify from 'fastify';
import { loadConfig } from './config/index.js';
import { loadVprAllowlist } from './config/vpr-allowlist.js';
import { registerQ1Route } from './routes/q1-resolve.js';
import { createQ2Route } from './routes/q2-issuer-auth.js';
import { createQ3Route } from './routes/q3-verifier-auth.js';
import { createQ4Route } from './routes/q4-ecosystem-participant.js';
import { registerHealthRoutes } from './routes/health.js';
import { IndexerClient } from './indexer/client.js';
import { registry, queryDurationSeconds } from './observability/metrics.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const allowlist = loadVprAllowlist(config.VPR_ALLOWLIST_PATH);

  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  // Request duration tracking
  server.addHook('onResponse', (request, reply, done) => {
    const url = request.routeOptions?.url ?? request.url;
    // Skip metrics/health from histogram
    if (!url.startsWith('/metrics') && !url.startsWith('/v1/health')) {
      const duration = reply.elapsedTime / 1000; // ms → seconds
      queryDurationSeconds.observe({ endpoint: url, status_code: reply.statusCode }, duration);
    }
    done();
  });

  // Health + readiness
  await registerHealthRoutes(server);

  // Prometheus metrics
  server.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  await registerQ1Route(server);

  // Q2+ endpoints need IndexerClient
  const indexer = new IndexerClient(allowlist.vprs[0]?.indexerUrl ?? 'http://localhost:3001');
  await createQ2Route(indexer)(server);
  await createQ3Route(indexer)(server);
  await createQ4Route(indexer)(server);

  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  server.log.info(
    `Verana Trust Resolver started (role=${config.INSTANCE_ROLE}, vprs=${allowlist.vprs.length})`,
  );

  server.log.info('Health: /v1/health | Readiness: /v1/health/ready | Metrics: /metrics');
}

main().catch((err) => {
  console.error('Failed to start resolver:', err);
  process.exit(1);
});
