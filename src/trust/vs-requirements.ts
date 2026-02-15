import type { IndexerClient } from '../indexer/client.js';
import type { CredentialEvaluation, EvaluationContext, TrustResult, TrustStatus } from './types.js';

/**
 * Evaluate VS-REQ-2/3/4 requirements.
 *
 * Groups valid credentials by ecosystem, then for each ecosystem:
 * - Checks for ECS-SERVICE presence (VS-REQ-2)
 * - VS-REQ-3: if self-issued service cred → VS must also present ECS-ORG or ECS-PERSONA
 * - VS-REQ-4: if externally issued service cred → issuer's DID must present ECS-ORG or ECS-PERSONA
 */
export async function evaluateVSRequirements(
  did: string,
  validCredentials: CredentialEvaluation[],
  indexer: IndexerClient,
  ctx: EvaluationContext,
  resolveTrustFn: (did: string, indexer: IndexerClient, ctx: EvaluationContext) => Promise<TrustResult>,
  allowedEcosystemDids: Set<string>,
): Promise<TrustStatus> {
  // Group valid credentials by ecosystem, filtering out ecosystems not in the allowlist
  const byEcosystem = new Map<string, CredentialEvaluation[]>();
  for (const cred of validCredentials) {
    const ecosystemDid = cred.schema?.ecosystemDid;
    if (!ecosystemDid) continue;
    if (!allowedEcosystemDids.has(ecosystemDid)) continue;

    const existing = byEcosystem.get(ecosystemDid) ?? [];
    existing.push(cred);
    byEcosystem.set(ecosystemDid, existing);
  }

  if (byEcosystem.size === 0) return 'UNTRUSTED';

  let satisfiedEcosystems = 0;
  const totalEcosystems = byEcosystem.size;

  for (const [, creds] of byEcosystem) {
    const serviceCred = creds.find((c) => c.ecsType === 'ECS-SERVICE');
    if (!serviceCred) continue;

    // VS-REQ-3: self-issued → VS must also present ECS-ORG or ECS-PERSONA
    if (serviceCred.issuedBy === did) {
      const hasOrgOrPersona = creds.some(
        (c) =>
          (c.ecsType === 'ECS-ORG' || c.ecsType === 'ECS-PERSONA') &&
          c.presentedBy === did,
      );
      if (hasOrgOrPersona) satisfiedEcosystems++;
      continue;
    }

    // VS-REQ-4: issued by another DID → issuer's DID must present ECS-ORG or ECS-PERSONA
    const issuerResult = await resolveTrustFn(serviceCred.issuedBy, indexer, ctx);
    const issuerHasOrgOrPersona = issuerResult.credentials.some(
      (c) =>
        (c.ecsType === 'ECS-ORG' || c.ecsType === 'ECS-PERSONA') &&
        c.presentedBy === serviceCred.issuedBy &&
        c.result === 'VALID',
    );
    if (issuerHasOrgOrPersona) satisfiedEcosystems++;
  }

  if (satisfiedEcosystems === totalEcosystems && totalEcosystems > 0) return 'TRUSTED';
  if (satisfiedEcosystems > 0) return 'PARTIAL';
  return 'UNTRUSTED';
}
