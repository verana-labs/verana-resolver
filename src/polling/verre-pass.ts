import {
  resolveDID as verreResolveDID,
  TrustResolutionOutcome,
  ECS,
  type VerifiablePublicRegistry,
  type TrustResolution,
  type ICredential,
  type IService,
  type IOrg,
  type IPersona,
  type IUserAgent,
} from '@verana-labs/verre';
import type { IndexerClient } from '../indexer/client.js';
import { deleteCachedFile } from '../cache/file-cache.js';
import { upsertTrustResult, markUntrusted } from '../trust/trust-store.js';
import { addReattemptable } from './reattemptable.js';
import type {
  TrustResult,
  TrustStatus,
  CredentialEvaluation,
  FailedCredential,
  EcsType,
} from '../trust/types.js';
import { verreLogger } from '../trust/verre-logger.js';
import { createLogger } from '../logger.js';

const logger = createLogger('verre-pass');

// ---------------------------------------------------------------------------
// Outcome → TrustStatus mapping
// ---------------------------------------------------------------------------

function mapOutcomeToTrustStatus(outcome: TrustResolutionOutcome, verified: boolean): TrustStatus {
  if (!verified) return 'UNTRUSTED';
  switch (outcome) {
    case TrustResolutionOutcome.VERIFIED:
    case TrustResolutionOutcome.VERIFIED_TEST:
      return 'TRUSTED';
    case TrustResolutionOutcome.NOT_TRUSTED:
      return 'UNTRUSTED';
    case TrustResolutionOutcome.INVALID:
      return 'UNTRUSTED';
    default:
      return 'UNTRUSTED';
  }
}

function mapOutcomeToProduction(outcome: TrustResolutionOutcome, verified: boolean): boolean {
  if (!verified) return false;
  return outcome === TrustResolutionOutcome.VERIFIED;
}

// ---------------------------------------------------------------------------
// ICredential → CredentialEvaluation mapping
// ---------------------------------------------------------------------------

function mapEcsType(schemaType: ICredential['schemaType']): EcsType {
  switch (schemaType) {
    case ECS.SERVICE: return 'ECS-SERVICE';
    case ECS.ORG: return 'ECS-ORG';
    case ECS.PERSONA: return 'ECS-PERSONA';
    case ECS.USER_AGENT: return 'ECS-UA';
    default: return null;
  }
}

export function extractClaimsFromCredential(cred: ICredential): Record<string, unknown> {
  const claims: Record<string, unknown> = { id: cred.id, issuer: cred.issuer };

  switch (cred.schemaType) {
    case ECS.SERVICE: {
      const svc = cred as IService;
      claims.name = svc.name;
      claims.type = svc.type;
      claims.description = svc.description;
      claims.logo = svc.logo;
      claims.minimumAgeRequired = svc.minimumAgeRequired;
      claims.termsAndConditions = svc.termsAndConditions;
      claims.termsAndConditionsDigestSri = svc.termsAndConditionsDigestSri;
      claims.privacyPolicy = svc.privacyPolicy;
      claims.privacyPolicyDigestSri = svc.privacyPolicyDigestSri;
      break;
    }
    case ECS.ORG: {
      const org = cred as IOrg;
      claims.name = org.name;
      claims.logo = org.logo;
      claims.registryId = org.registryId;
      claims.registryUri = org.registryUri;
      claims.address = org.address;
      claims.countryCode = org.countryCode;
      claims.legalJurisdiction = org.legalJurisdiction;
      claims.lei = org.lei;
      claims.organizationKind = org.organizationKind;
      break;
    }
    case ECS.PERSONA: {
      const persona = cred as IPersona;
      claims.name = persona.name;
      claims.avatar = persona.avatar;
      claims.controllerCountryCode = persona.controllerCountryCode;
      claims.controllerJurisdiction = persona.controllerJurisdiction;
      claims.description = persona.description;
      break;
    }
    case ECS.USER_AGENT: {
      const ua = cred as IUserAgent;
      claims.version = ua.version;
      claims.build = ua.build;
      break;
    }
    default: {
      // Unknown credential — copy all extra keys as claims
      const { schemaType: _st, id: _id, issuer: _iss, ...rest } = cred as Record<string, unknown>;
      Object.assign(claims, rest);
      break;
    }
  }

  return claims;
}

function credentialToEvaluation(
  cred: ICredential,
  presentedBy: string,
): CredentialEvaluation {
  const ecsType = mapEcsType(cred.schemaType);
  const result = ecsType !== null ? 'VALID' as const : 'IGNORED' as const;

  return {
    result,
    ecsType,
    presentedBy,
    issuedBy: cred.issuer,
    id: cred.id,
    type: 'VerifiableTrustCredential',
    format: 'W3C_VTC',
    claims: extractClaimsFromCredential(cred),
    permissionChain: [],
  };
}

// ---------------------------------------------------------------------------
// Build TrustResult from verre TrustResolution
// ---------------------------------------------------------------------------

function buildTrustResult(
  did: string,
  resolution: TrustResolution,
  currentBlock: number,
  cacheTtlSeconds: number,
): TrustResult {
  const trustStatus = mapOutcomeToTrustStatus(resolution.outcome, resolution.verified);
  const production = mapOutcomeToProduction(resolution.outcome, resolution.verified);
  const now = new Date();

  const credentials: CredentialEvaluation[] = [];
  const failedCredentials: FailedCredential[] = [];

  // Map service credential (ECS-SERVICE)
  if (resolution.service) {
    credentials.push(credentialToEvaluation(resolution.service, did));
  }

  // Map serviceProvider credential (ECS-ORG / ECS-PERSONA)
  if (resolution.serviceProvider) {
    // serviceProvider may be presented by the DID itself (VS-REQ-3) or by the issuer (VS-REQ-4)
    const providerPresentedBy = resolution.service && resolution.service.issuer !== did
      ? resolution.service.issuer
      : did;
    credentials.push(credentialToEvaluation(resolution.serviceProvider, providerPresentedBy));
  }

  // If not verified, record reason as a failed credential
  if (!resolution.verified && resolution.metadata) {
    failedCredentials.push({
      id: did,
      format: 'N/A',
      error: resolution.metadata.errorMessage ?? 'Trust resolution failed',
      errorCode: resolution.metadata.errorCode ?? 'VERRE_RESOLUTION_FAILED',
    });
  }

  return {
    did,
    trustStatus,
    production,
    evaluatedAt: now.toISOString(),
    evaluatedAtBlock: currentBlock,
    expiresAt: new Date(now.getTime() + cacheTtlSeconds * 1000).toISOString(),
    credentials,
    failedCredentials,
    dereferenceErrors: [],
  };
}

// ---------------------------------------------------------------------------
// Transient failure detection
// ---------------------------------------------------------------------------

// A verdict caused by an upstream hiccup (a flapping 5xx on a VP fetch, a
// timeout, a dropped connection) is indistinguishable from a genuinely
// untrusted service in the stored result - but it must not be cached as
// UNTRUSTED for the full TRUST_TTL. These patterns match the error strings
// verre produces for such failures ("Failed to fetch data from <url>:
// <status> <text>" and Node network error codes). Definitive HTTP answers
// (404, 410, 403, ...) are deliberately NOT matched: a removed or refused
// VP is a real trust signal.
const TRANSIENT_ERROR_PATTERNS: RegExp[] = [
  /failed to fetch data from .*?:\s*(?:408|425|429|5\d\d)\b/i,
  /\b(?:ETIMEDOUT|ECONNREFUSED|ECONNRESET|ECONNABORTED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|UND_ERR\w*)\b/,
  /\b(?:socket hang up|fetch failed|network error|timed out|timeout|aborted)\b/i,
];

/** True when a non-TRUSTED result carries at least one transient
 *  (network / upstream availability) failure among its errors. */
export function isTransientTrustResult(result: TrustResult): boolean {
  if (result.trustStatus === 'TRUSTED') return false;
  const messages = [
    ...result.failedCredentials.map((f) => f.error),
    ...result.dereferenceErrors.map((d) => d.error),
  ];
  return messages.some(
    (m) => typeof m === 'string' && TRANSIENT_ERROR_PATTERNS.some((p) => p.test(m)),
  );
}

const TRANSIENT_RETRY_DELAY_MS = 2_000;
const DEFAULT_TRANSIENT_TTL_SECONDS = 300;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Unified pass: replaces runPass1 + runPass2
// ---------------------------------------------------------------------------

export async function runVerrePass(
  affectedDids: Set<string>,
  _indexer: IndexerClient,
  currentBlock: number,
  trustTtlSeconds: number,
  verifiablePublicRegistries: VerifiablePublicRegistry[],
  skipDigestSRICheck: boolean,
  transientTtlSeconds: number = DEFAULT_TRANSIENT_TTL_SECONDS,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  logger.info(
    { didCount: affectedDids.size, block: currentBlock },
    'Verre pass started — DID resolution + trust evaluation',
  );

  for (const did of affectedDids) {
    try {
      // 1. Invalidate cached DID Document (same as old Pass1)
      logger.debug({ did }, 'Invalidating cached DID document');
      await deleteCachedFile(did);

      // 2. Single verre call: DID resolution + VP dereferencing + trust evaluation
      logger.debug({ did }, 'Calling verre resolveDID');
      const verreOptions = {
        verifiablePublicRegistries,
        skipDigestSRICheck,
        logger: verreLogger,
      };
      let resolution = await verreResolveDID(did, verreOptions);

      logger.debug(
        {
          did,
          verified: resolution.verified,
          outcome: resolution.outcome,
          hasService: !!resolution.service,
          hasServiceProvider: !!resolution.serviceProvider,
          errorCode: resolution.metadata?.errorCode,
          errorMessage: resolution.metadata?.errorMessage,
        },
        'Verre resolveDID complete',
      );

      // 3. Map verre result to TrustResult
      let trustResult = buildTrustResult(did, resolution, currentBlock, trustTtlSeconds);

      // 3b. A verdict produced by a transient upstream failure gets one
      // immediate retry: most flaps (a 503 on a VP fetch, a dropped
      // connection) heal within seconds.
      if (isTransientTrustResult(trustResult)) {
        logger.warn(
          { did, errors: trustResult.failedCredentials.map((f) => f.error) },
          'Verre pass: transient upstream failure — retrying once',
        );
        await sleep(TRANSIENT_RETRY_DELAY_MS);
        await deleteCachedFile(did);
        resolution = await verreResolveDID(did, verreOptions);
        trustResult = buildTrustResult(did, resolution, currentBlock, trustTtlSeconds);
      }

      // 3c. Still failing on a transient error: store the verdict with the
      // short TTL so it re-evaluates quickly instead of poisoning the DID
      // for the full TRUST_TTL, and queue a reattempt.
      if (isTransientTrustResult(trustResult)) {
        trustResult = {
          ...trustResult,
          expiresAt: new Date(Date.now() + transientTtlSeconds * 1000).toISOString(),
        };
        await addReattemptable(did, 'TRUST_EVAL', 'TRANSIENT');
        logger.warn(
          { did, transientTtlSeconds },
          'Verre pass: transient failure persisted — storing short-lived verdict',
        );
      }

      await upsertTrustResult(trustResult);

      logger.info(
        {
          did,
          trustStatus: trustResult.trustStatus,
          production: trustResult.production,
          validCredentials: trustResult.credentials.filter((c) => c.result === 'VALID').length,
          failedCredentials: trustResult.failedCredentials.length,
        },
        'Verre pass: DID processed and trust stored',
      );

      succeeded.push(did);
    } catch (err) {
      logger.error({ did, err }, 'Verre pass: unexpected error');

      // On failure, mark as reattemptable and UNTRUSTED. A thrown error is
      // transient by nature (crash, timeout, network) - never a verdict on
      // the DID itself - so the UNTRUSTED marker uses the short TTL.
      await addReattemptable(did, 'TRUST_EVAL', 'TRANSIENT');
      await markUntrusted(did, currentBlock, Math.min(transientTtlSeconds, trustTtlSeconds));
      failed.push(did);
    }
  }

  logger.info(
    { succeeded: succeeded.length, failed: failed.length, block: currentBlock },
    'Verre pass complete',
  );
  return { succeeded, failed };
}
