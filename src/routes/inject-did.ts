import type { FastifyInstance } from 'fastify';
import type { IndexerClient } from '../indexer/client.js';
import type { EnvConfig } from '../config/index.js';
import { runPass1 } from '../polling/pass1.js';
import { runPass2 } from '../polling/pass2.js';
import pino from 'pino';

const logger = pino({ name: 'inject-did' });

interface InjectDidBody {
  did: string;
}

interface InjectDidResponse {
  did: string;
  pass1: 'ok' | 'failed';
  pass2: 'ok' | 'failed' | 'skipped';
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
        description: 'Processes a DID through Pass1 (DID resolution + VP dereferencing) and Pass2 (trust evaluation) as if it were received during polling. Only available when INJECT_DID_ENDPOINT_ENABLED=true.',
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
              pass1: { type: 'string', enum: ['ok', 'failed'] },
              pass2: { type: 'string', enum: ['ok', 'failed', 'skipped'] },
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

      const allowedEcosystemDids = new Set(
        config.ECS_ECOSYSTEM_DIDS.split(',').map((d) => d.trim()).filter(Boolean),
      );

      // Get current block height for context
      const heightResp = await indexer.getBlockHeight();
      const currentBlock = heightResp.height;

      // Pass1: dereference DID document + VPs
      const affectedDids = new Set([did]);
      const pass1Result = await runPass1(affectedDids, indexer, currentBlock, config.TRUST_TTL);

      const response: InjectDidResponse = {
        did,
        pass1: pass1Result.succeeded.includes(did) ? 'ok' : 'failed',
        pass2: 'skipped',
      };

      // Pass2: evaluate trust (only if Pass1 succeeded)
      if (pass1Result.succeeded.includes(did)) {
        const pass2Result = await runPass2(
          affectedDids,
          indexer,
          currentBlock,
          config.TRUST_TTL,
          allowedEcosystemDids,
        );
        response.pass2 = pass2Result.succeeded.includes(did) ? 'ok' : 'failed';
      }

      logger.info({ did, pass1: response.pass1, pass2: response.pass2 }, 'DID injection complete');
      return reply.send(response);
    });
  };
}
