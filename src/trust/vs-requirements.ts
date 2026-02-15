import type { IndexerClient } from '../indexer/client.js';
import type { CredentialEvaluation, EvaluationContext, TrustResult, TrustStatus } from './types.js';
import pino from 'pino';

const logger = pino({ name: 'vs-requirements' });

/**
 * Evaluate VS-REQ-2/3/4 requirements.
 *
 * Groups valid credentials by ecosystem, then for each ecosystem:
 * - Checks for ECS-SERVICE presence (VS-REQ-2)
 * - VS-REQ-3: if self-issued service cred \u2192 VS must also present ECS-ORG or ECS-PERSONA
 * - VS-REQ-4: if externally issued service cred \u2192 issuer's DID must present ECS-ORG or ECS-PERSONA
 */
export async function evaluateVSRequirements(
  did: string,
  validCredentials: CredentialEvaluation[],
  indexer: IndexerClient,
  ctx: EvaluationContext,
  resolveTrustFn: (did: string, indexer: IndexerClient, ctx: EvaluationContext) => Promise<TrustResult>,
  allowedEcosystemDids: Set<string>,
): Promise<TrustStatus> {
  logger.debug({ did, validCredentials: validCredentials.length, allowedEcosystems: [...allowedEcosystemDids] }, 'Evaluating VS requirements');

  // Group valid credentials by ecosystem, filtering out ecosystems not in the allowlist
  const byEcosystem = new Map<string, CredentialEvaluation[]>();
  for (const cred of validCredentials) {
    const ecosystemDid = cred.schema?.ecosystemDid;
    if (!ecosystemDid) {
      logger.debug({ did, credId: cred.id, ecsType: cred.ecsType }, 'Credential has no ecosystem DID \u2014 skipped');
      continue;
    }
    if (!allowedEcosystemDids.has(ecosystemDid)) {
      logger.debug({ did, credId: cred.id, ecosystemDid }, 'Credential ecosystem not in allowlist \u2014 skipped');
      continue;
    }

    const existing = byEcosystem.get(ecosystemDid) ?? [];
    existing.push(cred);
    byEcosystem.set(ecosystemDid, existing);
  }

  logger.debug({ did, ecosystemCount: byEcosystem.size, ecosystems: [...byEcosystem.keys()] }, 'Credentials grouped by ecosystem');

  if (byEcosystem.size === 0) {
    logger.debug({ did }, 'No valid credentials in any allowed ecosystem \u2014 UNTRUSTED');
    return 'UNTRUSTED';
  }

  let satisfiedEcosystems = 0;
  const totalEcosystems = byEcosystem.size;

  for (const [ecosystemDid, creds] of byEcosystem) {
    const ecsTypes = creds.map((c) => c.ecsType);
    logger.debug({ did, ecosystemDid, credCount: creds.length, ecsTypes }, 'Checking ecosystem');

    const serviceCred = creds.find((c) => c.ecsType === 'ECS-SERVICE');
    if (!serviceCred) {
      logger.debug({ did, ecosystemDid }, 'VS-REQ-2: no ECS-SERVICE credential \u2014 ecosystem not satisfied');
      continue;
    }

    // VS-REQ-3: self-issued \u2192 VS must also present ECS-ORG or ECS-PERSONA
    if (serviceCred.issuedBy === did) {
      const hasOrgOrPersona = creds.some(
        (c) =>
          (c.ecsType === 'ECS-ORG' || c.ecsType === 'ECS-PERSONA') &&
          c.presentedBy === did,
      );
      logger.debug({ did, ecosystemDid, selfIssued: true, hasOrgOrPersona }, 'VS-REQ-3: self-issued ECS-SERVICE check');
      if (hasOrgOrPersona) satisfiedEcosystems++;
      continue;
    }

    // VS-REQ-4: issued by another DID \u2192 issuer's DID must present ECS-ORG or ECS-PERSONA
    logger.debug({ did, ecosystemDid, issuerDid: serviceCred.issuedBy }, 'VS-REQ-4: resolving issuer trust');
    const issuerResult = await resolveTrustFn(serviceCred.issuedBy, indexer, ctx);
    const issuerHasOrgOrPersona = issuerResult.credentials.some(
      (c) =>
        (c.ecsType === 'ECS-ORG' || c.ecsType === 'ECS-PERSONA') &&
        c.presentedBy === serviceCred.issuedBy &&
        c.result === 'VALID',
    );
    logger.debug({ did, ecosystemDid, issuerDid: serviceCred.issuedBy, issuerHasOrgOrPersona, issuerTrustStatus: issuerResult.trustStatus }, 'VS-REQ-4: issuer trust resolved');
    if (issuerHasOrgOrPersona) satisfiedEcosystems++;
  }

  let status: TrustStatus;
  if (satisfiedEcosystems === totalEcosystems && totalEcosystems > 0) status = 'TRUSTED';
  else if (satisfiedEcosystems > 0) status = 'PARTIAL';
  else status = 'UNTRUSTED';

  logger.debug({ did, satisfiedEcosystems, totalEcosystems, status }, 'VS requirements evaluation complete');
  return status;
}
