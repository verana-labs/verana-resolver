import type { IndexerClient } from '../indexer/client.js';
import type { Permission } from '../indexer/types.js';
import type { PermissionChainEntry, PermissionType, TrustResult } from './types.js';

export async function buildPermissionChain(
  issuerPermission: Permission,
  schema: { issuerPermManagementMode: string; ecosystemDid: string },
  indexer: IndexerClient,
  trustMemo: Map<string, TrustResult>,
  atBlock?: number,
): Promise<PermissionChainEntry[]> {
  const chain: PermissionChainEntry[] = [];

  // 1. ISSUER entry
  chain.push(
    await buildChainEntry(issuerPermission, 'ISSUER', trustMemo),
  );

  // 2. ISSUER_GRANTOR (only if GRANTOR_VALIDATION mode)
  if (schema.issuerPermManagementMode === 'GRANTOR_VALIDATION' && issuerPermission.validator_perm_id) {
    try {
      const grantorResp = await indexer.getPermission(issuerPermission.validator_perm_id, atBlock);
      chain.push(
        await buildChainEntry(grantorResp.permission, 'ISSUER_GRANTOR', trustMemo),
      );
    } catch {
      // Grantor permission not found — chain is incomplete but we continue
    }
  }

  // 3. ECOSYSTEM — find the ECOSYSTEM permission for this schema's ecosystem DID
  try {
    const ecosystemPerms = await indexer.listPermissions({
      did: schema.ecosystemDid,
      type: 'ECOSYSTEM',
      only_valid: true,
    }, atBlock);

    const ecosystemPerm = ecosystemPerms.permissions[0];
    if (ecosystemPerm) {
      chain.push(
        await buildChainEntry(ecosystemPerm, 'ECOSYSTEM', trustMemo),
      );
    }
  } catch {
    // Ecosystem permission not found
  }

  return chain;
}

async function buildChainEntry(
  perm: Permission,
  type: PermissionType,
  trustMemo: Map<string, TrustResult>,
): Promise<PermissionChainEntry> {
  const entry: PermissionChainEntry = {
    permissionId: Number(perm.id),
    type,
    did: perm.did,
    didIsTrustedVS: false,
    deposit: perm.deposit,
    permState: perm.perm_state,
    effectiveFrom: perm.effective || undefined,
    effectiveUntil: perm.expiration || undefined,
  };

  // Check if this DID is a trusted VS from the memo cache
  const cachedTrust = trustMemo.get(perm.did);
  if (cachedTrust) {
    entry.didIsTrustedVS = cachedTrust.trustStatus === 'TRUSTED';
    // Derive serviceName, organizationName, countryCode from the participant's own ECS credentials
    const serviceNameCred = cachedTrust.credentials.find(
      (c) => c.ecsType === 'ECS-SERVICE' && c.result === 'VALID',
    );
    if (serviceNameCred?.claims) {
      entry.serviceName = String(serviceNameCred.claims.name ?? '');
    }

    const orgCred = cachedTrust.credentials.find(
      (c) => (c.ecsType === 'ECS-ORG' || c.ecsType === 'ECS-PERSONA') && c.result === 'VALID',
    );
    if (orgCred?.claims) {
      entry.organizationName = String(orgCred.claims.name ?? '');
      entry.countryCode = String(orgCred.claims.countryCode ?? '');
      entry.legalJurisdiction = String(orgCred.claims.legalJurisdiction ?? '');
    }
  }

  return entry;
}

export async function getTrustDepositForEntry(
  entry: PermissionChainEntry,
  indexer: IndexerClient,
  atBlock?: number,
): Promise<PermissionChainEntry> {
  try {
    const depositResp = await indexer.getTrustDepositByAccount(entry.did, atBlock);
    if (depositResp.trust_deposit) {
      entry.deposit = depositResp.trust_deposit.amount;
    }
  } catch {
    // Deposit not found — keep the permission deposit
  }
  return entry;
}
