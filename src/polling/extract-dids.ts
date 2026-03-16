import type { ActivityItem } from '../indexer/types.js';

const WATCHED_ENTITY_TYPES = new Set(['Permission', 'TrustRegistry']);

export function extractAffectedDids(activity: ActivityItem[]): Set<string> {
  const dids = new Set<string>();

  for (const item of activity) {
    if (item.account?.startsWith('did:')) {
      dids.add(item.account);
    }

    if (WATCHED_ENTITY_TYPES.has(item.entity_type) && item.changes) {
      const { did, grantee } = item.changes;
      if (did?.startsWith('did:')) dids.add(did);
      if (grantee?.startsWith('did:')) dids.add(grantee);
    }
  }

  return dids;
}
