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
    const verifyResult = vc.format === 'anoncreds'
      ? await verifyAnonCredsCredential(vc.vc)
      : await verifyW3cCredential(vc.vc);

    if (!verifyResult.verified) {
      return {
        failed: {
          id: vc.vcId,
          format: formatToString(vc.format),
          error: verifyResult.error ?? 'Signature verification failed',
          errorCode: 'SIGNATURE_INVALID',
        },
      };
    }

    // 2. Resolve VTJSC → CredentialSchema
    const vtjscId = vc.credentialSchemaId;
    let schema: CredentialSchema | undefined;
    let schemaInfo: CredentialSchemaInfo | undefined;

    if (vtjscId) {
      schema = await resolveVtjscToSchema(vtjscId, indexer, ctx.currentBlock);
      if (schema) {
        schemaInfo = {
          id: Number(schema.id),
          jsonSchema: schema.json_schema,
          ecosystemDid: await resolveEcosystemDid(schema.tr_id, indexer, ctx.currentBlock),
          ecosystemAka: await resolveEcosystemAka(schema.tr_id, indexer, ctx.currentBlock),
          issuerPermManagementMode: schema.issuer_perm_management_mode,
        };
      }
    }

    // 3. Determine ECS type from VTJSC URI
    const ecsType = classifyEcsType(vtjscId);

    // 4. Determine effective issuance time
    let effectiveIssuanceTime: string | undefined;
    let digestSri: string | undefined;

    if (vc.format !== 'anoncreds' && vc.vc) {
      try {
        digestSri = await computeDigestSRI(vc.vc);
        const digestResp = await indexer.getDigest(digestSri, ctx.currentBlock);
        if (digestResp.digest) {
          effectiveIssuanceTime = digestResp.digest.created;
        }
      } catch {
        // Digest not found on-chain — use issuedAt from VC if available
        effectiveIssuanceTime = extractIssuedAt(vc.vc);
      }
    } else {
      // AnonCreds: use current time
      effectiveIssuanceTime = new Date().toISOString();
    }

    // 5. Verify issuer has ISSUER permission at effective issuance time
    let issuerPermission: Permission | undefined;
    if (schema && vc.issuerDid) {
      issuerPermission = await findIssuerPermission(
        vc.issuerDid,
        schema.id,
        indexer,
        ctx.currentBlock,
      );
    }

    if (!issuerPermission) {
      return {
        failed: {
          id: vc.vcId,
          format: formatToString(vc.format),
          error: `No active ISSUER permission found for issuer ${vc.issuerDid} on schema ${schema?.id ?? 'unknown'}`,
          errorCode: 'ISSUER_NOT_AUTHORIZED',
        },
      };
    }

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
    return {
      failed: {
        id: vc.vcId,
        format: formatToString(vc.format),
        error: err instanceof Error ? err.message : String(err),
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
