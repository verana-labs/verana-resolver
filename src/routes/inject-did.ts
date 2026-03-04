import type { VerifiablePublicRegistry } from '@verana-labs/verre';
import type { FastifyInstance } from 'fastify';
import type { IndexerClient } from '../indexer/client.js';
import type { EnvConfig } from '../config/index.js';
import { runVerrePass } from '../polling/verre-pass.js';
import { createLogger } from '../logger.js';

const logger = createLogger('inject-did');

interface InjectDidBody {
  did: string;
}

interface InjectDidResponse {
  did: string;
  result: 'ok' | 'failed';
}

export function createInjectDidRoute(
  indexer: IndexerClient,
  config: EnvConfig,
): (server: FastifyInstance) => Promise<void> {
  return async (server: FastifyInstance) => {
    server.post<{ Body: InjectDidBody }>('/v1/inject/did', {
      schema: {
        tags: ['Dev'],
        summary: 'Inject a DID for evaluation (dev mode)',
        description: 'Processes a DID through verre trust resolution (DID resolution + VP dereferencing + trust evaluation) as if it were received during polling. Only available when INJECT_DID_ENDPOINT_ENABLED=true.',
        body: {
          type: 'object',
          properties: {
            did: { type: 'string', description: 'DID to inject (e.g. did:web:example.com)' },
          },
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

      logger.info({ did }, 'Injecting DID for evaluation');

      // Parse VPR registries for verre
      let verifiablePublicRegistries: VerifiablePublicRegistry[] = [];
      try {
        verifiablePublicRegistries = JSON.parse(config.VPR_REGISTRIES) as VerifiablePublicRegistry[];
      } catch { /* use empty list */ }
      const skipDigestSRICheck = config.DISABLE_DIGEST_SRI_VERIFICATION;

      // Get current block height for context
      const heightResp = await indexer.getBlockHeight();
      const currentBlock = heightResp.height;

      // Unified verre pass: DID resolution + VP dereferencing + trust evaluation
      const affectedDids = new Set([did]);
      const passResult = await runVerrePass(
        affectedDids, indexer, currentBlock, config.TRUST_TTL,
        verifiablePublicRegistries, skipDigestSRICheck,
      );

      const response: InjectDidResponse = {
        did,
        result: passResult.succeeded.includes(did) ? 'ok' : 'failed',
      };

      logger.info({ did, result: response.result }, 'DID injection complete');
      return reply.send(response);
    });
  };
}
