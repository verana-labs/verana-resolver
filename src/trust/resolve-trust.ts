import type { IndexerClient } from '../indexer/client.js';
import { resolveDID } from '../ssi/did-resolver.js';
import { dereferenceAllVPs } from '../ssi/vp-dereferencer.js';
import { evaluateCredential } from './evaluate-credential.js';
import { evaluateVSRequirements } from './vs-requirements.js';
import type {
  TrustResult,
  CredentialEvaluation,
  FailedCredential,
  EvaluationContext,
} from './types.js';

export async function resolveTrust(
  did: string,
  indexer: IndexerClient,
  ctx: EvaluationContext,
): Promise<TrustResult> {
  // 1. Check in-memory memo
  const memoized = ctx.trustMemo.get(did);
  if (memoized) return memoized;

  // 2. Cycle detection
  if (ctx.visitedDids.has(did)) {
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
    };
    ctx.trustMemo.set(did, circular);
    return circular;
  }
  ctx.visitedDids.add(did);

  // 3. Resolve DID Document
  const didResult = await resolveDID(did);
  if (didResult.error || !didResult.result) {
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
        error: didResult.error?.error ?? 'DID resolution failed',
        errorCode: 'DID_RESOLUTION_FAILED',
      }],
    };
    ctx.trustMemo.set(did, unresolvedResult);
    return unresolvedResult;
  }

  const didDoc = didResult.result.didDocument;

  // 4. Dereference VPs and extract VCs
  const { vps, errors: vpErrors } = await dereferenceAllVPs(didDoc);

  const credentials: CredentialEvaluation[] = [];
  const failedCredentials: FailedCredential[] = [];

  // Convert VP dereference errors to failed credentials
  for (const vpErr of vpErrors) {
    failedCredentials.push({
      id: vpErr.resource,
      uri: vpErr.resource,
      format: 'UNKNOWN',
      error: vpErr.error,
      errorCode: 'VP_DEREFERENCE_FAILED',
    });
  }

  // 5. Evaluate each credential from all VPs
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

  // 7. Evaluate VS-REQ-2/3/4
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
  };

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
