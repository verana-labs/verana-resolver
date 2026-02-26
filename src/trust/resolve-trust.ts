import type { IndexerClient } from '../indexer/client.js';
import { resolveDID } from '../ssi/did-resolver.js';
import { dereferenceAllVPs } from '../ssi/vp-dereferencer.js';
import { evaluateCredential } from './evaluate-credential.js';
import { evaluateVSRequirements } from './vs-requirements.js';
import type {
  TrustResult,
  CredentialEvaluation,
  FailedCredential,
  VPDereferenceError,
  EvaluationContext,
} from './types.js';
import { createLogger } from '../logger.js';

const logger = createLogger('resolve-trust');

export async function resolveTrust(
  did: string,
  indexer: IndexerClient,
  ctx: EvaluationContext,
): Promise<TrustResult> {
  logger.info({ did, block: ctx.currentBlock }, 'Trust evaluation started');

  // 1. Check in-memory memo
  const memoized = ctx.trustMemo.get(did);
  if (memoized) {
    logger.debug({ did, trustStatus: memoized.trustStatus }, 'Trust memo hit \u2014 returning cached result');
    return memoized;
  }

  // 2. Cycle detection
  if (ctx.visitedDids.has(did)) {
    logger.warn({ did }, 'Circular reference detected \u2014 marking UNTRUSTED');
    const circular: TrustResult = {
      did,
      trustStatus: 'UNTRUSTED',
      production: false,
      evaluatedAt: new Date().toISOString(),
      evaluatedAtBlock: ctx.currentBlock,
      expiresAt: computeExpiresAt(ctx.cacheTtlSeconds),
      credentials: [],
      failedCredentials: [{
        id: did,
        format: 'N/A',
        error: 'Circular reference detected',
        errorCode: 'CIRCULAR_REFERENCE',
      }],
      dereferenceErrors: [],
    };
    ctx.trustMemo.set(did, circular);
    return circular;
  }
  ctx.visitedDids.add(did);

  // 3. Resolve DID Document
  logger.debug({ did }, 'Step 1/5: Resolving DID document');
  const didResult = await resolveDID(did);
  if (didResult.error || !didResult.result) {
    const error = didResult.error?.error ?? 'DID resolution failed';
    const message = didResult.error?.message;
    logger.info({ did, error, message: message ?? 'none' }, 'Trust evaluation \u2014 DID resolution failed \u2014 UNTRUSTED');
    const unresolvedResult: TrustResult = {
      did,
      trustStatus: 'UNTRUSTED',
      production: false,
      evaluatedAt: new Date().toISOString(),
      evaluatedAtBlock: ctx.currentBlock,
      expiresAt: computeExpiresAt(ctx.cacheTtlSeconds),
      credentials: [],
      failedCredentials: [{
        id: did,
        format: 'N/A',
        error: message ? `${error}: ${message}` : error,
        errorCode: 'DID_RESOLUTION_FAILED',
      }],
      dereferenceErrors: [],
    };
    ctx.trustMemo.set(did, unresolvedResult);
    return unresolvedResult;
  }
  logger.debug({ did }, 'Step 1/5: DID document resolved OK');

  const didDoc = didResult.result.didDocument;

  // 4. Dereference VPs and extract VCs
  logger.debug({ did }, 'Step 2/5: Dereferencing VPs');
  const { vps, errors: vpErrors } = await dereferenceAllVPs(didDoc);

  const totalVcCount = vps.reduce((sum, vp) => sum + vp.credentials.length, 0);
  logger.debug({ did, vpsOk: vps.length, vpsFailed: vpErrors.length, totalCredentials: totalVcCount }, 'Step 2/5: VP dereference complete');

  const credentials: CredentialEvaluation[] = [];
  const failedCredentials: FailedCredential[] = [];

  // Record VP dereference errors separately (these are not credential failures)
  const dereferenceErrors: VPDereferenceError[] = [];
  for (const vpErr of vpErrors) {
    logger.debug({ did, vpUrl: vpErr.resource, error: vpErr.error }, 'VP dereference error');
    dereferenceErrors.push({
      vpUrl: vpErr.resource,
      error: vpErr.error,
    });
  }

  // 5. Evaluate each credential from all VPs
  logger.debug({ did, totalCredentials: totalVcCount }, 'Step 3/5: Evaluating credentials');
  for (const vp of vps) {
    for (const vc of vp.credentials) {
      const evalResult = await evaluateCredential(vc, did, indexer, ctx);
      if (evalResult.credential) {
        credentials.push(evalResult.credential);
      }
      if (evalResult.failed) {
        failedCredentials.push(evalResult.failed);
      }
    }
  }

  // 6. Classify credentials
  const validCredentials = credentials.filter((c) => c.result === 'VALID');
  const ignoredCredentials = credentials.filter((c) => c.result === 'IGNORED');
  logger.debug({ did, valid: validCredentials.length, ignored: ignoredCredentials.length, failed: failedCredentials.length }, 'Step 3/5: Credential evaluation summary');

  // Detailed per-credential debug summary
  for (const c of validCredentials) {
    logger.debug(
      { did, vcId: c.id, result: 'VALID', ecsType: c.ecsType, issuer: c.issuedBy, type: c.type, vtjscId: c.vtjscId ?? 'none', chainLength: c.permissionChain?.length ?? 0 },
      'Credential result: VALID',
    );
  }
  for (const c of ignoredCredentials) {
    logger.debug(
      { did, vcId: c.id, result: 'IGNORED', issuer: c.issuedBy, type: c.type, vtjscId: c.vtjscId ?? 'none' },
      'Credential result: IGNORED (no ECS type match)',
    );
  }
  for (const f of failedCredentials) {
    logger.debug(
      { did, vcId: f.id, result: 'FAILED', errorCode: f.errorCode, error: f.error, format: f.format },
      'Credential result: FAILED',
    );
  }

  // 7. Evaluate VS-REQ-2/3/4
  logger.debug({ did }, 'Step 4/5: Evaluating VS requirements');
  const trustStatus = await evaluateVSRequirements(
    did,
    validCredentials,
    indexer,
    ctx,
    resolveTrust,
    ctx.allowedEcosystemDids,
  );

  // 8. Derive production flag
  const production = deriveProduction(validCredentials);

  // 9. Build result
  const result: TrustResult = {
    did,
    trustStatus,
    production,
    evaluatedAt: new Date().toISOString(),
    evaluatedAtBlock: ctx.currentBlock,
    expiresAt: computeExpiresAt(ctx.cacheTtlSeconds),
    credentials,
    failedCredentials,
    dereferenceErrors,
  };

  logger.info(
    { did, trustStatus, production, validCredentials: validCredentials.length, ignoredCredentials: ignoredCredentials.length, failedCredentials: failedCredentials.length, dereferenceErrors: dereferenceErrors.length, block: ctx.currentBlock },
    'Step 5/5: Trust evaluation complete',
  );
  if (trustStatus === 'UNTRUSTED') {
    logger.debug(
      { did, failedCredentials: failedCredentials.map((f) => ({ id: f.id, errorCode: f.errorCode, error: f.error })) },
      'Trust evaluation UNTRUSTED \u2014 failure details',
    );
  }

  ctx.trustMemo.set(did, result);
  return result;
}

export function createEvaluationContext(
  currentBlock: number,
  cacheTtlSeconds: number,
  allowedEcosystemDids: Set<string>,
): EvaluationContext {
  return {
    visitedDids: new Set<string>(),
    currentBlock,
    cacheTtlSeconds,
    trustMemo: new Map<string, TrustResult>(),
    allowedEcosystemDids,
  };
}

function deriveProduction(validCredentials: CredentialEvaluation[]): boolean {
  // A DID is "production" if it has at least one VALID credential
  // and no credential is explicitly marked as non-production / sandbox.
  // For now: production = has any VALID ECS credential.
  return validCredentials.some((c) => c.ecsType !== null);
}

function computeExpiresAt(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}
