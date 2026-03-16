import type { ActivityItem } from '../indexer/types.js';

const DID_FIELDS = ['did', 'grantee'] as const;
const WATCHED_ENTITY_TYPES = new Set(['Permission', 'TrustRegistry']);

export function extractAffectedDids(activity: ActivityItem[]): Set<string> {
  const dids = new Set<string>();

  for (const item of activity) {
    if (item.account?.startsWith('did:')) {
      dids.add(item.account);
    }

    if (WATCHED_ENTITY_TYPES.has(item.entity_type) && item.changes) {
      for (const field of DID_FIELDS) {
        const value = item.changes[field];
        if (typeof value === 'string' && value.startsWith('did:')) {
          dids.add(value);
        }
      }
    }
  }

  return dids;
}
