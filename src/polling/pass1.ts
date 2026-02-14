import type { IndexerClient } from '../indexer/client.js';
import type { ActivityItem } from '../indexer/types.js';
import { deleteCachedFile } from '../cache/file-cache.js';
import { resolveDID } from '../ssi/did-resolver.js';
import { dereferenceAllVPs } from '../ssi/vp-dereferencer.js';
import { addReattemptable } from './reattemptable.js';
import pino from 'pino';

const logger = pino({ name: 'pass1' });

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

export async function runPass1(
  affectedDids: Set<string>,
  _indexer: IndexerClient,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const did of affectedDids) {
    try {
      // 1. Invalidate cached DID Document
      await deleteCachedFile(did);

      // 2. Re-resolve DID Document (will re-cache)
      const didResult = await resolveDID(did);
      if (didResult.error || !didResult.result) {
        logger.warn({ did, error: didResult.error?.error }, 'Pass1: DID resolution failed');
        await addReattemptable(did, 'DID_DOC', 'TRANSIENT');
        failed.push(did);
        continue;
      }

      // 3. Dereference VPs and cache VCs
      const { errors: vpErrors } = await dereferenceAllVPs(didResult.result.didDocument);

      if (vpErrors.length > 0) {
        logger.warn({ did, vpErrors: vpErrors.length }, 'Pass1: some VPs failed to dereference');
        for (const vpErr of vpErrors) {
          await addReattemptable(vpErr.resource, 'VP', 'TRANSIENT');
        }
      }

      succeeded.push(did);
    } catch (err) {
      logger.error({ did, err }, 'Pass1: unexpected error');
      await addReattemptable(did, 'DID_DOC', 'TRANSIENT');
      failed.push(did);
    }
  }

  return { succeeded, failed };
}
