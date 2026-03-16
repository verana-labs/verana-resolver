import type { ActivityItem } from '../indexer/types.js';

const WATCHED_ENTITY_TYPES = new Set(['Permission', 'TrustRegistry']);

function extractDidsFromChanges(changes: Record<string, unknown>): string[] {
  return Object.values(changes).filter(
    (v): v is string => typeof v === 'string' && v.startsWith('did:'),
  );
}

export function extractAffectedDids(activity: ActivityItem[]): Set<string> {
  const dids = new Set<string>();

  for (const item of activity) {
    if (item.account?.startsWith('did:')) {
      dids.add(item.account);
    }

    if (WATCHED_ENTITY_TYPES.has(item.entity_type) && item.changes) {
      for (const did of extractDidsFromChanges(item.changes)) {
        dids.add(did);
      }
    }
  }

  return dids;
}
