import type { FastifyInstance } from 'fastify';
import type { IndexerClient } from '../indexer/client.js';
import type { EnvConfig } from '../config/index.js';
import { runVerrePass, parseVprRegistries } from '../polling/index.js';
import { invalidateTrustTtl } from '../trust/trust-store.js';
import { removeReattemptable } from '../polling/reattemptable.js';
import { createLogger } from '../logger.js';

const logger = createLogger('refresh-did');

interface RefreshDidBody {
  did: string;
}

interface RefreshDidResponse {
  did: string;
  result: 'ok' | 'failed';
}

export function createQ5oute(
  indexer: IndexerClient,
  config: EnvConfig,
): (server: FastifyInstance) => Promise<void> {
  return async (server: FastifyInstance) => {
    server.post<{ Body: RefreshDidBody }>('/v1/trust/refresh', {
      schema: {
        tags: ['Trust'],
        summary: 'Force refresh trust evaluation for a DID',
        description: 'Forces DID resolution + VP dereferencing + trust evaluation, bypassing cache/TTL behavior.',
        body: {
          type: 'object',
          properties: {
            did: { type: 'string', description: 'DID to refresh (e.g. did:web:example.com)' },
          },
          required: ['did'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              did: { type: 'string' },
              result: { type: 'string', enum: ['ok', 'failed'] },
            },
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    }, async (request, reply) => {
      const { did } = request.body ?? {};

      if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Request body must contain a valid "did" string starting with "did:"',
        });
      }

      logger.info({ did }, 'Forcing trust refresh for DID');

      try {
        // Parse VPR registries
        const verifiablePublicRegistries = parseVprRegistries(config.VPR_REGISTRIES);
        const skipDigestSRICheck = config.DISABLE_DIGEST_SRI_VERIFICATION;

        // Get current block height
        const heightResp = await indexer.getBlockHeight();
        const currentBlock = heightResp.height;

        // Invalidate existing TTL so the polling loop re-evaluates if this call fails
        await invalidateTrustTtl(did);

        const affectedDids = new Set([did]);
        const passResult = await runVerrePass(
          affectedDids,
          indexer,
          currentBlock,
          config.TRUST_TTL,
          verifiablePublicRegistries,
          skipDigestSRICheck,
        );

        // If resolution succeeded, remove from reattemptable in case it was queued
        if (passResult.succeeded.includes(did)) {
          await removeReattemptable(did);
        }

        const response: RefreshDidResponse = {
          did,
          result: passResult.succeeded.includes(did) ? 'ok' : 'failed',
        };

        logger.info({ did, result: response.result }, 'Trust refresh complete');
        return reply.send(response);

      } catch (error) {
        logger.error({ did, error }, 'Error refreshing DID');

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to refresh DID trust evaluation',
        });
      }
    });
  };
}
