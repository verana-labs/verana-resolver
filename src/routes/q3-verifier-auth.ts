import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PermissionType, type VerifiablePublicRegistry, verifyPermissions } from '@verana-labs/verre';
import { getLastProcessedBlock } from '../polling/resolver-state.js';
import { verreLogger } from '../trust/verre-logger.js';

interface Q3QueryString {
  did?: string;
  vtjscId?: string;
  sessionId?: string;
  at?: string;
}

export function createQ3Route(verifiablePublicRegistries: VerifiablePublicRegistry[]) {
  return async function registerQ3Route(server: FastifyInstance): Promise<void> {
    server.get<{ Querystring: Q3QueryString }>(
      '/v1/trust/verifier-authorization',
      {
        schema: {
          tags: ['Trust'],
          summary: 'Check verifier authorization for a credential schema',
          description: 'Verifies whether a DID holds an active VERIFIER permission for a given VTJSC (credential schema). Optionally validates a payment session.',
          querystring: {
            type: 'object',
            properties: {
              did: { type: 'string', description: 'Verifier DID' },
              vtjscId: { type: 'string', description: 'VTJSC (JSON Schema ID) of the credential' },
              sessionId: { type: 'string', description: 'Optional PermissionSession ID for fee payment' },
              at: { type: 'string', description: 'Optional block height for point-in-time query' },
            },
          },
          response: {
            200: { type: 'object', additionalProperties: true, description: 'Authorization result' },
            400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
            402: { type: 'object', additionalProperties: true, description: 'Payment required' },
            404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          },
        },
      },
      async (request: FastifyRequest<{ Querystring: Q3QueryString }>, reply: FastifyReply) => {
        const { did, vtjscId } = request.query;

        // --- Parameter validation ---
        if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Missing or invalid "did" query parameter. Must be a valid DID.',
          });
        }

        if (!vtjscId || typeof vtjscId !== 'string') {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Missing or invalid "vtjscId" query parameter.',
          });
        }

        const now = new Date().toISOString();
        const blockHeight = await getLastProcessedBlock()

        const { verified: authorized } = await verifyPermissions({
          did,
          jsonSchemaCredentialId: vtjscId,
          issuanceDate: now,
          verifiablePublicRegistries,
          permissionType: PermissionType.VERIFIER,
          logger: verreLogger,
        });
        

        const response: Record<string, unknown> = {
          did,
          vtjscId,
          authorized,
          evaluatedAt: now,
          evaluatedAtBlock: {},
          permission: {},
          fees: {},
          permissionChain: {},
        };

        reply.header('X-Evaluated-At-Block', String(blockHeight));
        return reply.send(response);
      },
    );
  };
}
