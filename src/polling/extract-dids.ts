import type { ActivityItem } from '../indexer/types.js';

export function extractAffectedDids(activity: ActivityItem[]): Set<string> {
  const dids = new Set<string>();

  for (const item of activity) {
    // Permission changes reference a DID directly
    if (item.entity_type === 'permission' && item.changes) {
      const didChange = item.changes['did'];
      if (didChange?.new && typeof didChange.new === 'string') {
        dids.add(didChange.new);
      }
      if (didChange?.old && typeof didChange.old === 'string') {
        dids.add(didChange.old);
      }
      // Also check the grantee field
      const granteeChange = item.changes['grantee'];
      if (granteeChange?.new && typeof granteeChange.new === 'string') {
        dids.add(granteeChange.new);
      }
    }

    // Trust registry changes affect the ecosystem DID
    if (item.entity_type === 'trust_registry' && item.changes) {
      const didChange = item.changes['did'];
      if (didChange?.new && typeof didChange.new === 'string') {
        dids.add(didChange.new);
      }
    }

    // If the account field looks like a DID, include it
    if (item.account && item.account.startsWith('did:')) {
      dids.add(item.account);
    }
  }

  return dids;
}
