import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IndexerClient } from '../indexer/client.js';
import type { Permission } from '../indexer/types.js';

interface Q4QueryString {
  did?: string;
  ecosystemDid?: string;
  at?: string;
}

export function createQ4Route(indexer: IndexerClient) {
  return async function registerQ4Route(server: FastifyInstance): Promise<void> {
    server.get<{ Querystring: Q4QueryString }>(
      '/v1/trust/ecosystem-participant',
      {
        schema: {
          tags: ['Trust'],
          summary: 'Check ecosystem participation for a DID',
          description: 'Returns all active permissions a DID holds within a specific ecosystem (Trust Registry).',
          querystring: {
            type: 'object',
            properties: {
              did: { type: 'string', description: 'Participant DID' },
              ecosystemDid: { type: 'string', description: 'Ecosystem DID (Trust Registry owner)' },
              at: { type: 'string', description: 'Optional block height for point-in-time query' },
            },
          },
          response: {
            200: { type: 'object', additionalProperties: true, description: 'Ecosystem participation result' },
            400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
            404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          },
        },
      },
      async (request: FastifyRequest<{ Querystring: Q4QueryString }>, reply: FastifyReply) => {
        const { did, ecosystemDid, at } = request.query;

        // --- Parameter validation ---
        if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Missing or invalid "did" query parameter. Must be a valid DID.',
          });
        }

        if (!ecosystemDid || typeof ecosystemDid !== 'string' || !ecosystemDid.startsWith('did:')) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Missing or invalid "ecosystemDid" query parameter. Must be a valid DID.',
          });
        }

        // Parse optional block height
        const atBlock = parseAtParam(at);

        // --- 1. Resolve ecosystemDid \u2192 TrustRegistry ---
        const trListResp = await indexer.listTrustRegistries({}, atBlock);
        const trustRegistry = trListResp.trust_registries.find((tr) => tr.did === ecosystemDid);

        if (!trustRegistry) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `No Trust Registry found for ecosystem DID: ${ecosystemDid}`,
          });
        }

        const trId = trustRegistry.id;
        const ecosystemAka = trustRegistry.aka ?? undefined;

        // --- 2. Get all CredentialSchemas for this ecosystem ---
        const schemasResp = await indexer.listCredentialSchemas({ tr_id: trId }, atBlock);
        const schemas = schemasResp.schemas;

        // --- 3. For each schema, find ACTIVE permissions for did ---
        const allPermissions: Array<Record<string, unknown>> = [];

        for (const schema of schemas) {
          const permResp = await indexer.listPermissions(
            { did, schema_id: schema.id, only_valid: true },
            atBlock,
          );

          for (const perm of permResp.permissions) {
            if (perm.perm_state === 'ACTIVE') {
              allPermissions.push(formatPermission(perm, schema.json_schema));
            }
          }
        }

        // --- 4. Build response ---
        const now = new Date().toISOString();
        const blockHeight = atBlock ?? (await indexer.getBlockHeight()).height;

        const response: Record<string, unknown> = {
          did,
          ecosystemDid,
          isParticipant: allPermissions.length > 0,
          evaluatedAt: now,
          evaluatedAtBlock: blockHeight,
          permissions: allPermissions,
        };

        if (ecosystemAka) {
          response.ecosystemAka = ecosystemAka;
        }

        reply.header('X-Evaluated-At-Block', String(blockHeight));
        return reply.send(response);
      },
    );
  };
}

function formatPermission(perm: Permission, vtjscId: string): Record<string, unknown> {
  return {
    permissionId: Number(perm.id),
    did: perm.did,
    type: perm.type,
    schemaId: Number(perm.schema_id),
    vtjscId,
    deposit: perm.deposit,
    permState: perm.perm_state,
    effectiveFrom: perm.effective,
    effectiveUntil: perm.effective_until ?? perm.expiration,
  };
}

function parseAtParam(at?: string): number | undefined {
  if (!at) return undefined;
  const num = Number(at);
  if (!Number.isNaN(num) && Number.isInteger(num) && num > 0) return num;
  return undefined;
}
