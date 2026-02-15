import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IndexerClient } from '../indexer/client.js';
import type { Permission } from '../indexer/types.js';
import { IndexerError } from '../indexer/errors.js';

interface Q2QueryString {
  did?: string;
  vtjscId?: string;
  sessionId?: string;
  at?: string;
}

export function createQ2Route(indexer: IndexerClient) {
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
        const { did, vtjscId, sessionId, at } = request.query;

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

        // Parse optional block height
        const atBlock = parseAtParam(at);

        // --- 1. Map vtjscId \u2192 CredentialSchema ---
        let schemaId: string;
        try {
          const schemas = await indexer.listCredentialSchemas({ json_schema: vtjscId }, atBlock);
          const match = schemas.schemas.find((s: { json_schema: string }) => s.json_schema === vtjscId);
          if (!match) {
            return reply.status(404).send({
              error: 'Not Found',
              message: `No CredentialSchema found for VTJSC: ${vtjscId}`,
            });
          }
          schemaId = match.id;
        } catch (err) {
          if (err instanceof IndexerError && err.statusCode === 404) {
            return reply.status(404).send({
              error: 'Not Found',
              message: `No CredentialSchema found for VTJSC: ${vtjscId}`,
            });
          }
          throw err;
        }

        // --- 2. Find active ISSUER permission ---
        const permResp = await indexer.listPermissions(
          { did, schema_id: schemaId, type: 'ISSUER', only_valid: true },
          atBlock,
        );

        const issuerPerm = permResp.permissions.find((p) => p.perm_state === 'ACTIVE');

        const now = new Date().toISOString();
        const blockHeight = atBlock ?? (await indexer.getBlockHeight()).height;

        if (!issuerPerm) {
          return reply.send({
            did,
            vtjscId,
            authorized: false,
            evaluatedAt: now,
            evaluatedAtBlock: blockHeight,
            reason: `No active ISSUER permission found for DID on schema ${schemaId} (VTJSC: ${vtjscId})`,
          });
        }

        // --- 3. Build permission chain (on-chain facts only) ---
        const permissionChain = await buildOnChainPermissionChain(indexer, issuerPerm, atBlock);

        // --- 4. Compute fees via findBeneficiaries ---
        const feeResult = await computeFees(indexer, issuerPerm, atBlock);

        // --- 5. Fee/session handling ---
        if (feeResult.required && !sessionId) {
          return reply.status(402).send({
            authorized: false,
            did,
            vtjscId,
            evaluatedAt: now,
            evaluatedAtBlock: blockHeight,
            reason:
              'Payment required. Issuance fees are enabled for this schema but no sessionId was provided. The issuer must create a PermissionSession (MOD-PERM-MSG-10) and re-query with the sessionId.',
            fees: feeResult,
          });
        }

        // --- 6. Session verification (if provided) ---
        let session: Record<string, unknown> | undefined;
        if (sessionId) {
          try {
            const sessResp = await indexer.getPermissionSession(sessionId, atBlock);
            const sess = sessResp.permission_session;

            // Verify session references the correct issuer permission
            const matchesIssuer = sess.records.some(
              (r) => r.issuer_perm_id === issuerPerm.id,
            );

            session = {
              id: sess.id,
              paid: matchesIssuer,
              issuerPermId: Number(issuerPerm.id),
              agentPermId: Number(sess.agent_perm_id),
              walletAgentPermId: sess.records[0]?.wallet_agent_perm_id
                ? Number(sess.records[0].wallet_agent_perm_id)
                : null,
              created: sess.created,
            };
          } catch (err) {
            if (err instanceof IndexerError && err.statusCode === 404) {
              return reply.status(400).send({
                error: 'Bad Request',
                message: `PermissionSession not found: ${sessionId}`,
              });
            }
            throw err;
          }
        }

        // --- 7. Build response ---
        const response: Record<string, unknown> = {
          did,
          vtjscId,
          authorized: true,
          evaluatedAt: now,
          evaluatedAtBlock: blockHeight,
          permission: {
            id: Number(issuerPerm.id),
            type: issuerPerm.type,
            schemaId: Number(issuerPerm.schema_id),
            did: issuerPerm.did,
            deposit: issuerPerm.deposit,
            permState: issuerPerm.perm_state,
            effectiveFrom: issuerPerm.effective,
            effectiveUntil: issuerPerm.effective_until ?? issuerPerm.expiration,
            issuanceFeeDiscount: issuerPerm.issuance_fee_discount ?? '0',
          },
          fees: feeResult,
          permissionChain,
        };

        if (session) {
          response.session = session;
        }

        reply.header('X-Evaluated-At-Block', String(blockHeight));
        return reply.send(response);
      },
    );
  };
}

async function buildOnChainPermissionChain(
  indexer: IndexerClient,
  issuerPerm: Permission,
  atBlock?: number,
): Promise<Array<Record<string, unknown>>> {
  const chain: Array<Record<string, unknown>> = [];

  // ISSUER entry
  chain.push({
    permissionId: Number(issuerPerm.id),
    type: issuerPerm.type,
    did: issuerPerm.did,
    deposit: issuerPerm.deposit,
    permState: issuerPerm.perm_state,
  });

  // Walk to parent: ISSUER_GRANTOR (if validator_perm_id set)
  if (issuerPerm.validator_perm_id) {
    try {
      const grantorResp = await indexer.getPermission(issuerPerm.validator_perm_id, atBlock);
      const grantor = grantorResp.permission;
      chain.push({
        permissionId: Number(grantor.id),
        type: grantor.type,
        did: grantor.did,
        deposit: grantor.deposit,
        permState: grantor.perm_state,
      });

      // Walk to ECOSYSTEM
      if (grantor.validator_perm_id) {
        const ecoResp = await indexer.getPermission(grantor.validator_perm_id, atBlock);
        const eco = ecoResp.permission;
        chain.push({
          permissionId: Number(eco.id),
          type: eco.type,
          did: eco.did,
          deposit: eco.deposit,
          permState: eco.perm_state,
        });
      }
    } catch {
      // Chain may be incomplete \u2014 that's acceptable
    }
  }

  return chain;
}

async function computeFees(
  indexer: IndexerClient,
  issuerPerm: Permission,
  atBlock?: number,
): Promise<Record<string, unknown>> {
  try {
    const beneResp = await indexer.findBeneficiaries(issuerPerm.id, '0', atBlock);
    const beneficiaries = beneResp.permissions.map((p) => ({
      permissionId: Number(p.id),
      type: p.type,
      issuanceFees: p.issuance_fees ?? '0',
    }));

    const totalFees = beneficiaries.reduce((sum, b) => {
      const feeStr = b.issuanceFees.replace(/[^0-9]/g, '');
      return sum + (Number(feeStr) || 0);
    }, 0);

    // Check discount
    const discount = Number(issuerPerm.issuance_fee_discount ?? '0');
    const effectiveTotal = discount >= 1 ? 0 : totalFees;

    if (effectiveTotal === 0) {
      return {
        required: false,
        note: 'All issuance fees are zero or fully discounted (issuanceFeeDiscount=1). No PermissionSession required for fee payment.',
      };
    }

    return {
      required: true,
      pricingAssetType: 'COIN',
      pricingAsset: 'uvna',
      totalBeneficiaryFees: `${effectiveTotal}uvna`,
      beneficiaries,
    };
  } catch {
    // If beneficiary lookup fails, assume no fees
    return { required: false };
  }
}

function parseAtParam(at?: string): number | undefined {
  if (!at) return undefined;
  const num = Number(at);
  if (!Number.isNaN(num) && Number.isInteger(num) && num > 0) return num;
  return undefined;
}
