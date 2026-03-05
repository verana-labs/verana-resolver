import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyPermissions, PermissionType, type VerifiablePublicRegistry } from '@verana-labs/verre';
import { verreLogger } from '../trust/verre-logger.js';
import { getLastProcessedBlock } from '../polling/resolver-state.js';

interface Q2QueryString {
  did?: string;
  vtjscId?: string;
  sessionId?: string;
  at?: string;
}

export function createQ2Route(verifiablePublicRegistries: VerifiablePublicRegistry[]) {
  return async function registerQ2Route(server: FastifyInstance): Promise<void> {
    server.get<{ Querystring: Q2QueryString }>(
      '/v1/trust/issuer-authorization',
      {
        schema: {
          tags: ['Trust'],
          summary: 'Check issuer authorization for a credential schema',
          description: 'Verifies whether a DID holds an active ISSUER permission for a given VTJSC (credential schema). Optionally validates a payment session.',
          querystring: {
            type: 'object',
            properties: {
              did: { type: 'string', description: 'Issuer DID' },
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
      async (request: FastifyRequest<{ Querystring: Q2QueryString }>, reply: FastifyReply) => {
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
          permissionType: PermissionType.ISSUER,
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
