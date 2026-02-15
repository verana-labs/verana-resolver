import type { IndexerClient } from '../indexer/client.js';
import type { DereferencedVC } from '../ssi/types.js';
import type { CredentialSchema, Permission } from '../indexer/types.js';
import { computeDigestSRI, verifySriDigest } from '../ssi/digest.js';
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
      logger.info({ vcId: vc.vcId, vtjscId }, 'Resolving schema reference to on-chain CredentialSchema');
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
        logger.info({ vcId: vc.vcId, onChainSchemaId: schema.id, trId: schema.tr_id, ecosystemDid, ecosystemAka: ecosystemAka ?? 'none', jsonSchema: schema.json_schema }, 'CredentialSchema resolved OK');
      } else {
        logger.warn({ vcId: vc.vcId, vtjscId }, 'CredentialSchema NOT found on-chain for schema reference');
      }
    } else {
      logger.warn({ vcId: vc.vcId, credentialSchemaId: (vc.vc.credentialSchema as Record<string, unknown>)?.id ?? 'none', credentialSubjectId: (vc.vc.credentialSubject as Record<string, unknown>)?.id ?? 'none' }, 'No VPR URI or credentialSchemaId found on credential');
    }

    // 2b. Verify digestSRI of the JSON schema content from the VPR
    const subject = vc.vc.credentialSubject as Record<string, unknown> | undefined;
    const expectedDigestSri = typeof subject?.digestSRI === 'string' ? subject.digestSRI as string : undefined;
    if (expectedDigestSri && vtjscId && schema) {
      const jsId = parseVprJsonSchemaId(vtjscId);
      if (jsId) {
        try {
          const jsonSchemaContent = await indexer.fetchJsonSchemaContent(jsId, ctx.currentBlock);
          const digestResult = await verifySriDigest(jsonSchemaContent, expectedDigestSri);
          if (!digestResult.valid) {
            const error = `JSON schema digestSRI mismatch: expected=${expectedDigestSri}, computed=${digestResult.computed ?? 'unknown'}`;
            logger.warn({ vcId: vc.vcId, vtjscId, jsId, expected: expectedDigestSri, computed: digestResult.computed }, 'JSON schema digestSRI verification FAILED');
            return {
              failed: {
                id: vc.vcId,
                format: formatToString(vc.format),
                error,
                errorCode: 'DIGEST_SRI_MISMATCH',
              },
            };
          }
          logger.debug({ vcId: vc.vcId, digestSri: expectedDigestSri }, 'JSON schema digestSRI verified OK');
        } catch (err) {
          logger.warn({ vcId: vc.vcId, jsId, error: err instanceof Error ? err.message : String(err) }, 'Failed to fetch JSON schema content for digestSRI verification');
        }
      }
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
      const reason = !schema
        ? `schema not found on-chain (vtjscId=${vtjscId ?? 'none'})`
        : `no active ISSUER permission for did=${vc.issuerDid} on schema_id=${schema.id}`;
      const error = `ISSUER_NOT_AUTHORIZED: ${reason}`;
      logger.warn({
        vcId: vc.vcId,
        issuerDid: vc.issuerDid,
        vtjscId: vtjscId ?? 'none',
        onChainSchemaId: schema?.id ?? 'none',
        schemaFound: !!schema,
        reason,
      }, 'ISSUER permission NOT found \u2014 credential FAILED');
      return {
        failed: {
          id: vc.vcId,
          format: formatToString(vc.format),
          error,
          errorCode: 'ISSUER_NOT_AUTHORIZED',
        },
      };
    }
    logger.info({ vcId: vc.vcId, permissionId: issuerPermission.id, permState: issuerPermission.perm_state, schemaId: schema!.id }, 'ISSUER permission found');

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

// Parse a VPR URI like vpr:verana:vna-testnet-1/cs/v1/js/47
// Returns the JSON schema ID (e.g. '47') or null if not a VPR URI.
function parseVprJsonSchemaId(uri: string): string | null {
  const match = uri.match(/^vpr:verana:[^/]+\/cs\/v1\/js\/(\d+)$/);
  return match ? match[1] : null;
}

async function resolveVtjscToSchema(
  vtjscId: string,
  indexer: IndexerClient,
  atBlock?: number,
): Promise<CredentialSchema | undefined> {
  // 1. If vtjscId is a VPR URI, resolve via indexer /verana/cs/v1/js/{id}
  const jsId = parseVprJsonSchemaId(vtjscId);
  if (jsId) {
    try {
      logger.debug({ vtjscId, jsId }, 'Resolving VPR URI via indexer /verana/cs/v1/js/{id}');
      const resp = await indexer.getCredentialSchemaByJsonSchemaId(jsId, atBlock);
      return resp.credential_schema;
    } catch (err) {
      logger.debug({ vtjscId, jsId, error: err instanceof Error ? err.message : String(err) }, 'VPR URI resolution failed');
      return undefined;
    }
  }

  // 2. Otherwise, try matching by json_schema field (e.g. VTJSC URL)
  try {
    logger.debug({ vtjscId }, 'Resolving schema reference via listCredentialSchemas filter');
    const resp = await indexer.listCredentialSchemas({ json_schema: vtjscId }, atBlock);
    if (resp.credential_schemas.length > 0) {
      return resp.credential_schemas[0];
    }
    logger.debug({ vtjscId, schemasReturned: resp.credential_schemas.length }, 'No on-chain schema matched json_schema filter');
    return undefined;
  } catch (err) {
    logger.debug({ vtjscId, error: err instanceof Error ? err.message : String(err) }, 'listCredentialSchemas failed');
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
