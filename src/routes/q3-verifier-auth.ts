import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IndexerClient } from '../indexer/client.js';
import type { Permission } from '../indexer/types.js';
import { IndexerError } from '../indexer/errors.js';

interface Q3QueryString {
  did?: string;
  vtjscId?: string;
  sessionId?: string;
  at?: string;
}

export function createQ3Route(indexer: IndexerClient) {
  return async function registerQ3Route(server: FastifyInstance): Promise<void> {
    server.get<{ Querystring: Q3QueryString }>(
      '/v1/trust/verifier-authorization',
      async (request: FastifyRequest<{ Querystring: Q3QueryString }>, reply: FastifyReply) => {
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
          const match = schemas.credential_schemas.find((s) => s.json_schema === vtjscId);
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

        // --- 2. Find active VERIFIER permission ---
        const permResp = await indexer.listPermissions(
          { did, schema_id: schemaId, type: 'VERIFIER', only_valid: true },
          atBlock,
        );

        const verifierPerm = permResp.permissions.find((p) => p.perm_state === 'ACTIVE');

        const now = new Date().toISOString();
        const blockHeight = atBlock ?? (await indexer.getBlockHeight()).height;

        if (!verifierPerm) {
          return reply.send({
            did,
            vtjscId,
            authorized: false,
            evaluatedAt: now,
            evaluatedAtBlock: blockHeight,
            reason: `No active VERIFIER permission found for DID on schema ${schemaId} (VTJSC: ${vtjscId})`,
          });
        }

        // --- 3. Build permission chain (on-chain facts only) ---
        const permissionChain = await buildOnChainPermissionChain(indexer, verifierPerm, atBlock);

        // --- 4. Compute fees via findBeneficiaries ---
        const feeResult = await computeVerificationFees(indexer, verifierPerm, atBlock);

        // --- 5. Fee/session handling ---
        if (feeResult.required && !sessionId) {
          return reply.status(402).send({
            authorized: false,
            did,
            vtjscId,
            evaluatedAt: now,
            evaluatedAtBlock: blockHeight,
            reason:
              'Payment required. Verification fees are enabled for this schema but no sessionId was provided. The verifier must create a PermissionSession (MOD-PERM-MSG-10) and re-query with the sessionId.',
            fees: feeResult,
          });
        }

        // --- 6. Session verification (if provided) ---
        let session: Record<string, unknown> | undefined;
        if (sessionId) {
          try {
            const sessResp = await indexer.getPermissionSession(sessionId, atBlock);
            const sess = sessResp.permission_session;

            // Verify session references the correct verifier permission
            const matchesVerifier = sess.records.some(
              (r) => r.verifier_perm_id === verifierPerm.id,
            );

            session = {
              id: sess.id,
              paid: matchesVerifier,
              verifierPermId: Number(verifierPerm.id),
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
            id: Number(verifierPerm.id),
            type: verifierPerm.type,
            schemaId: Number(verifierPerm.schema_id),
            did: verifierPerm.did,
            deposit: verifierPerm.deposit,
            permState: verifierPerm.perm_state,
            effectiveFrom: verifierPerm.effective,
            effectiveUntil: verifierPerm.effective_until ?? verifierPerm.expiration,
            verificationFeeDiscount: verifierPerm.verification_fee_discount ?? '0',
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
  verifierPerm: Permission,
  atBlock?: number,
): Promise<Array<Record<string, unknown>>> {
  const chain: Array<Record<string, unknown>> = [];

  // VERIFIER entry
  chain.push({
    permissionId: Number(verifierPerm.id),
    type: verifierPerm.type,
    did: verifierPerm.did,
    deposit: verifierPerm.deposit,
    permState: verifierPerm.perm_state,
  });

  // Walk to parent: VERIFIER_GRANTOR (if validator_perm_id set)
  if (verifierPerm.validator_perm_id) {
    try {
      const grantorResp = await indexer.getPermission(verifierPerm.validator_perm_id, atBlock);
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

async function computeVerificationFees(
  indexer: IndexerClient,
  verifierPerm: Permission,
  atBlock?: number,
): Promise<Record<string, unknown>> {
  try {
    const beneResp = await indexer.findBeneficiaries('0', verifierPerm.id, atBlock);
    const beneficiaries = beneResp.permissions.map((p) => ({
      permissionId: Number(p.id),
      type: p.type,
      verificationFees: p.verification_fees ?? '0',
    }));

    const totalFees = beneficiaries.reduce((sum, b) => {
      const feeStr = b.verificationFees.replace(/[^0-9]/g, '');
      return sum + (Number(feeStr) || 0);
    }, 0);

    // Check discount
    const discount = Number(verifierPerm.verification_fee_discount ?? '0');
    const effectiveTotal = discount >= 1 ? 0 : totalFees;

    if (effectiveTotal === 0) {
      return {
        required: false,
        note: 'All verification fees are zero or fully discounted (verificationFeeDiscount=1). No PermissionSession required for fee payment.',
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
