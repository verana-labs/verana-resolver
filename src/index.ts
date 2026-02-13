import Fastify from 'fastify';
import { loadConfig } from './config/index.js';
import { loadVprAllowlist } from './config/vpr-allowlist.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const allowlist = loadVprAllowlist(config.VPR_ALLOWLIST_PATH);

  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  server.get('/v1/health', async () => {
    return {
      status: 'ok',
      instanceRole: config.INSTANCE_ROLE,
      vprs: allowlist.vprs.map((vpr) => vpr.id),
    };
  });

  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  server.log.info(
    `Verana Trust Resolver started (role=${config.INSTANCE_ROLE}, vprs=${allowlist.vprs.length})`,
  );
}

main().catch((err) => {
  console.error('Failed to start resolver:', err);
  process.exit(1);
});
