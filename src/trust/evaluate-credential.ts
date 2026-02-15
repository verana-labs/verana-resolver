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
import { getConfig } from '../config/index.js';

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

    // 2. Determine the effective schema reference for on-chain lookup.
    //    - VTJSCs (JsonSchemaCredential): the VPR URI is in credentialSubject.id
    //    - Regular VCs: credentialSchema.id points to the VTJSC URL
    const vcTypes = Array.isArray(vc.vc.type) ? vc.vc.type as string[] : [];
    const isVtjsc = vcTypes.includes('JsonSchemaCredential');
    let schemaRef: string | undefined;

    if (isVtjsc) {
      // VTJSC: extract VPR URI from credentialSubject.id
      const subject = vc.vc.credentialSubject as Record<string, unknown> | undefined;
      schemaRef = typeof subject?.id === 'string' ? subject.id as string : undefined;
      logger.debug({ vcId: vc.vcId, isVtjsc: true, schemaRef: schemaRef ?? 'none', credentialSchemaId: vc.credentialSchemaId ?? 'none' }, 'VTJSC detected \u2014 using credentialSubject.id as schema reference');
    } else {
      // Regular VC: credentialSchema.id is the VTJSC URL
      schemaRef = vc.credentialSchemaId;
      logger.debug({ vcId: vc.vcId, isVtjsc: false, schemaRef: schemaRef ?? 'none' }, 'Regular VC \u2014 using credentialSchema.id as schema reference');
    }

    let schema: CredentialSchema | undefined;
    let schemaInfo: CredentialSchemaInfo | undefined;

    if (schemaRef) {
      logger.info({ vcId: vc.vcId, schemaRef, isVtjsc }, 'Resolving schema reference to on-chain CredentialSchema');
      schema = await resolveVtjscToSchema(schemaRef, indexer, ctx.currentBlock);
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
        logger.warn({ vcId: vc.vcId, schemaRef, isVtjsc }, 'CredentialSchema NOT found on-chain for schema reference');
      }
    } else {
      logger.warn({ vcId: vc.vcId, credentialSchemaId: vc.credentialSchemaId ?? 'none', isVtjsc }, 'No schema reference found on credential');
    }

    // 2b. Verify digestSRI of the JSON schema content from the VPR
    if (isVtjsc && schema) {
      if (getConfig().DISABLE_DIGEST_SRI_VERIFICATION) {
        logger.info({ vcId: vc.vcId, schemaRef: schemaRef ?? 'none' }, 'Digest SRI verification OMITTED (DISABLE_DIGEST_SRI_VERIFICATION=true)');
      } else {
        const vtjscSubject = vc.vc.credentialSubject as Record<string, unknown> | undefined;
        const expectedDigestSri = typeof vtjscSubject?.digestSRI === 'string' ? vtjscSubject.digestSRI as string : undefined;
        if (expectedDigestSri && schemaRef) {
          const jsId = parseVprJsonSchemaId(schemaRef);
          if (jsId) {
            try {
              const jsonSchemaContent = await indexer.fetchJsonSchemaContent(jsId, ctx.currentBlock);
              const digestResult = await verifySriDigest(jsonSchemaContent, expectedDigestSri);
              if (!digestResult.valid) {
                const error = `JSON schema digestSRI mismatch: expected=${expectedDigestSri}, computed=${digestResult.computed ?? 'unknown'}`;
                logger.warn({ vcId: vc.vcId, schemaRef, jsId, expected: expectedDigestSri, computed: digestResult.computed }, 'JSON schema digestSRI verification FAILED');
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
      }
    }

    // 3. Determine ECS type from schema reference
    const ecsType = classifyEcsType(schemaRef);
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
        ? `schema not found on-chain (schemaRef=${schemaRef ?? 'none'})`
        : `no active ISSUER permission for did=${vc.issuerDid} on schema_id=${schema.id}`;
      const error = `ISSUER_NOT_AUTHORIZED: ${reason}`;
      logger.warn({
        vcId: vc.vcId,
        issuerDid: vc.issuerDid,
        schemaRef: schemaRef ?? 'none',
        onChainSchemaId: schema?.id ?? 'none',
        schemaFound: !!schema,
        isVtjsc,
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
        vtjscId: schemaRef,
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
  schemaRef: string,
  indexer: IndexerClient,
  atBlock?: number,
): Promise<CredentialSchema | undefined> {
  // Determine the VPR URI to search for
  let vprUri: string | undefined;

  if (schemaRef.startsWith('vpr:')) {
    // Already a VPR URI (from VTJSC credentialSubject.id)
    vprUri = schemaRef;
  } else if (schemaRef.startsWith('http://') || schemaRef.startsWith('https://')) {
    // VTJSC URL (from regular VC credentialSchema.id) \u2014 dereference to extract VPR URI
    try {
      logger.debug({ schemaRef }, 'Dereferencing VTJSC URL to extract VPR URI');
      const response = await fetch(schemaRef, {
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        const vtjsc = (await response.json()) as Record<string, unknown>;
        const subject = vtjsc.credentialSubject as Record<string, unknown> | undefined;
        if (typeof subject?.id === 'string' && (subject.id as string).startsWith('vpr:')) {
          vprUri = subject.id as string;
          logger.debug({ schemaRef, vprUri }, 'Extracted VPR URI from VTJSC');
        } else {
          logger.debug({ schemaRef }, 'VTJSC fetched but no VPR URI found in credentialSubject.id');
        }
      } else {
        logger.debug({ schemaRef, status: response.status }, 'Failed to fetch VTJSC URL');
      }
    } catch (err) {
      logger.debug({ schemaRef, error: err instanceof Error ? err.message : String(err) }, 'Error dereferencing VTJSC URL');
    }
  }

  if (!vprUri) {
    logger.debug({ schemaRef }, 'No VPR URI resolved \u2014 cannot look up on-chain schema');
    return undefined;
  }

  // Search on-chain schemas: list all and find the one whose json_schema content has matching $id
  try {
    logger.debug({ schemaRef, vprUri }, 'Searching on-chain schemas by VPR URI ($id match)');
    const resp = await indexer.listCredentialSchemas({}, atBlock);
    for (const schema of resp.schemas) {
      try {
        const parsed = JSON.parse(schema.json_schema) as Record<string, unknown>;
        if (parsed.$id === vprUri) {
          logger.debug({ schemaRef, vprUri, onChainSchemaId: schema.id, trId: schema.tr_id }, 'On-chain schema matched by $id');
          return schema;
        }
      } catch {
        // skip unparseable json_schema entries
      }
    }
    logger.debug({ schemaRef, vprUri, schemasChecked: resp.schemas.length }, 'No on-chain schema matched VPR URI');
    return undefined;
  } catch (err) {
    logger.debug({ schemaRef, vprUri, error: err instanceof Error ? err.message : String(err) }, 'listCredentialSchemas failed');
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
