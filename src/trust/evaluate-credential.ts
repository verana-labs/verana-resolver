import type { IndexerClient } from '../indexer/client.js';
import type { DereferencedVC } from '../ssi/types.js';
import type { CredentialSchema, Permission } from '../indexer/types.js';
import { computeDigestSRI } from '../ssi/digest.js';
import { verifyW3cCredential, verifyAnonCredsCredential } from '../ssi/vc-verifier.js';
import { buildPermissionChain } from './permission-chain.js';
import type {
  CredentialEvaluation,
  CredentialSchemaInfo,
  EcsType,
  EvaluationContext,
  FailedCredential,
} from './types.js';
import { createLogger } from '../logger.js';

const logger = createLogger('evaluate-credential');

const ECS_TYPE_PATTERNS: Array<{ pattern: RegExp; ecsType: EcsType }> = [
  { pattern: /ecs-service/i, ecsType: 'ECS-SERVICE' },
  { pattern: /ecs-org/i, ecsType: 'ECS-ORG' },
  { pattern: /ecs-persona/i, ecsType: 'ECS-PERSONA' },
  { pattern: /ecs-ua/i, ecsType: 'ECS-UA' },
];

export async function evaluateCredential(
  vc: DereferencedVC,
  presentedBy: string,
  indexer: IndexerClient,
  ctx: EvaluationContext,
): Promise<{ credential?: CredentialEvaluation; failed?: FailedCredential }> {
  try {
    // 1. Verify signature
    logger.debug({ vcId: vc.vcId, format: vc.format, issuer: vc.issuerDid }, 'Evaluating credential');
    const verifyResult = vc.format === 'anoncreds'
      ? await verifyAnonCredsCredential(vc.vc)
      : await verifyW3cCredential(vc.vc);

    if (!verifyResult.verified) {
      const error = verifyResult.error ?? 'Signature verification failed';
      logger.debug({ vcId: vc.vcId, error }, 'Credential signature verification FAILED');
      return {
        failed: {
          id: vc.vcId,
          format: formatToString(vc.format),
          error,
          errorCode: 'SIGNATURE_INVALID',
        },
      };
    }
    logger.debug({ vcId: vc.vcId }, 'Credential signature verification OK');

    // 2. Resolve VTJSC \u2192 CredentialSchema
    const vtjscId = vc.credentialSchemaId;
    let schema: CredentialSchema | undefined;
    let schemaInfo: CredentialSchemaInfo | undefined;

    if (vtjscId) {
      logger.debug({ vcId: vc.vcId, vtjscId }, 'Resolving VTJSC to CredentialSchema');
      schema = await resolveVtjscToSchema(vtjscId, indexer, ctx.currentBlock);
      if (schema) {
        const ecosystemDid = await resolveEcosystemDid(schema.tr_id, indexer, ctx.currentBlock);
        const ecosystemAka = await resolveEcosystemAka(schema.tr_id, indexer, ctx.currentBlock);
        schemaInfo = {
          id: Number(schema.id),
          jsonSchema: schema.json_schema,
          ecosystemDid,
          ecosystemAka,
          issuerPermManagementMode: schema.issuer_perm_management_mode,
        };
        logger.debug({ vcId: vc.vcId, schemaId: schema.id, ecosystemDid, ecosystemAka: ecosystemAka ?? 'none' }, 'CredentialSchema resolved');
      } else {
        logger.debug({ vcId: vc.vcId, vtjscId }, 'CredentialSchema not found for VTJSC');
      }
    } else {
      logger.debug({ vcId: vc.vcId }, 'No VTJSC/credentialSchemaId on credential');
    }

    // 3. Determine ECS type from VTJSC URI
    const ecsType = classifyEcsType(vtjscId);
    logger.debug({ vcId: vc.vcId, ecsType: ecsType ?? 'none' }, 'ECS type classified');

    // 4. Determine effective issuance time
    let effectiveIssuanceTime: string | undefined;
    let digestSri: string | undefined;

    if (vc.format !== 'anoncreds' && vc.vc) {
      try {
        digestSri = await computeDigestSRI(vc.vc);
        logger.debug({ vcId: vc.vcId, digestSri }, 'Computed digestSRI');
        const digestResp = await indexer.getDigest(digestSri, ctx.currentBlock);
        if (digestResp.digest) {
          effectiveIssuanceTime = digestResp.digest.created;
          logger.debug({ vcId: vc.vcId, effectiveIssuanceTime }, 'Digest found on-chain');
        } else {
          logger.debug({ vcId: vc.vcId }, 'Digest response empty');
        }
      } catch {
        // Digest not found on-chain \u2014 use issuedAt from VC if available
        effectiveIssuanceTime = extractIssuedAt(vc.vc);
        logger.debug({ vcId: vc.vcId, effectiveIssuanceTime: effectiveIssuanceTime ?? 'none' }, 'Digest not on-chain, using VC issuedAt');
      }
    } else {
      // AnonCreds: use current time
      effectiveIssuanceTime = new Date().toISOString();
      logger.debug({ vcId: vc.vcId }, 'AnonCreds format \u2014 using current time as effective issuance');
    }

    // 5. Verify issuer has ISSUER permission at effective issuance time
    let issuerPermission: Permission | undefined;
    if (schema && vc.issuerDid) {
      logger.debug({ vcId: vc.vcId, issuerDid: vc.issuerDid, schemaId: schema.id }, 'Looking up ISSUER permission');
      issuerPermission = await findIssuerPermission(
        vc.issuerDid,
        schema.id,
        indexer,
        ctx.currentBlock,
      );
    }

    if (!issuerPermission) {
      const error = `No active ISSUER permission found for issuer ${vc.issuerDid} on schema ${schema?.id ?? 'unknown'}`;
      logger.debug({ vcId: vc.vcId, issuerDid: vc.issuerDid, schemaId: schema?.id }, 'ISSUER permission NOT found \u2014 credential FAILED');
      return {
        failed: {
          id: vc.vcId,
          format: formatToString(vc.format),
          error,
          errorCode: 'ISSUER_NOT_AUTHORIZED',
        },
      };
    }
    logger.debug({ vcId: vc.vcId, permissionId: issuerPermission.id, permState: issuerPermission.perm_state }, 'ISSUER permission found');

    // 6. Build permission chain
    let permissionChain = schemaInfo
      ? await buildPermissionChain(
          issuerPermission,
          {
            issuerPermManagementMode: schemaInfo.issuerPermManagementMode,
            ecosystemDid: schemaInfo.ecosystemDid,
          },
          indexer,
          ctx.trustMemo,
          ctx.currentBlock,
        )
      : [];

    // 7. Enrich permission chain entries with trust deposit info
    for (const entry of permissionChain) {
      try {
        const depositResp = await indexer.getTrustDepositByAccount(entry.did, ctx.currentBlock);
        if (depositResp.trust_deposit) {
          entry.deposit = depositResp.trust_deposit.amount;
        }
      } catch {
        // Keep permission deposit
      }
    }

    // 8. Extract claims from VC
    const claims = extractClaims(vc.vc);

    // 9. Determine result: VALID if ECS match + all checks pass, IGNORED if non-ECS
    const result = ecsType !== null ? 'VALID' as const : 'IGNORED' as const;
    logger.debug({ vcId: vc.vcId, result, ecsType: ecsType ?? 'none', chainLength: permissionChain.length }, 'Credential evaluation complete');

    return {
      credential: {
        result,
        ecsType,
        presentedBy,
        issuedBy: vc.issuerDid,
        id: vc.vcId,
        type: extractType(vc.vc),
        format: formatToString(vc.format),
        issuedAt: extractIssuedAt(vc.vc),
        validUntil: extractValidUntil(vc.vc),
        digestSri,
        effectiveIssuanceTime,
        vtjscId,
        claims,
        schema: schemaInfo,
        permissionChain,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.debug({ vcId: vc.vcId, error: errorMsg }, 'Credential evaluation threw an exception');
    return {
      failed: {
        id: vc.vcId,
        format: formatToString(vc.format),
        error: errorMsg,
        errorCode: 'EVALUATION_ERROR',
      },
    };
  }
}

// --- Helpers ---

async function resolveVtjscToSchema(
  vtjscId: string,
  indexer: IndexerClient,
  atBlock?: number,
): Promise<CredentialSchema | undefined> {
  // The Indexer doesn't support filtering by json_schema directly,
  // so we list all schemas and filter client-side.
  // In production, this should be cached per trust registry.
  try {
    const resp = await indexer.listCredentialSchemas({}, atBlock);
    return resp.credential_schemas.find((s) => s.json_schema === vtjscId);
  } catch {
    return undefined;
  }
}

async function resolveEcosystemDid(
  trId: string,
  indexer: IndexerClient,
  atBlock?: number,
): Promise<string> {
  try {
    const resp = await indexer.getTrustRegistry(trId, atBlock);
    return resp.trust_registry.did;
  } catch {
    return '';
  }
}

async function resolveEcosystemAka(
  trId: string,
  indexer: IndexerClient,
  atBlock?: number,
): Promise<string | undefined> {
  try {
    const resp = await indexer.getTrustRegistry(trId, atBlock);
    return resp.trust_registry.aka ?? undefined;
  } catch {
    return undefined;
  }
}

async function findIssuerPermission(
  issuerDid: string,
  schemaId: string,
  indexer: IndexerClient,
  atBlock?: number,
): Promise<Permission | undefined> {
  try {
    const resp = await indexer.listPermissions({
      did: issuerDid,
      schema_id: schemaId,
      type: 'ISSUER',
      only_valid: true,
    }, atBlock);
    return resp.permissions[0];
  } catch {
    return undefined;
  }
}

export function classifyEcsType(vtjscId?: string): EcsType {
  if (!vtjscId) return null;
  for (const { pattern, ecsType } of ECS_TYPE_PATTERNS) {
    if (pattern.test(vtjscId)) return ecsType;
  }
  return null;
}

function extractClaims(vc: Record<string, unknown>): Record<string, unknown> {
  const subject = vc.credentialSubject;
  if (typeof subject === 'object' && subject !== null) {
    return { ...(subject as Record<string, unknown>) };
  }
  return {};
}

function extractType(vc: Record<string, unknown>): string {
  const type = vc.type;
  if (Array.isArray(type)) {
    return type.find((t) => t !== 'VerifiableCredential') ?? 'VerifiableCredential';
  }
  return typeof type === 'string' ? type : 'VerifiableCredential';
}

function extractIssuedAt(vc: Record<string, unknown>): string | undefined {
  const issuanceDate = vc.issuanceDate ?? vc.issued ?? vc.validFrom;
  return typeof issuanceDate === 'string' ? issuanceDate : undefined;
}

function extractValidUntil(vc: Record<string, unknown>): string | undefined {
  const expiry = vc.expirationDate ?? vc.validUntil;
  return typeof expiry === 'string' ? expiry : undefined;
}

function formatToString(format: DereferencedVC['format']): string {
  switch (format) {
    case 'w3c-jsonld': return 'W3C_VTC';
    case 'w3c-jwt': return 'W3C_VTC';
    case 'anoncreds': return 'ANONCREDS';
    default: return 'UNKNOWN';
  }
}
