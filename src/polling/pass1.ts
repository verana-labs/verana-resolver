import type { IndexerClient } from '../indexer/client.js';
import type { ActivityItem } from '../indexer/types.js';
import { deleteCachedFile } from '../cache/file-cache.js';
import { resolveDID } from '../ssi/did-resolver.js';
import { dereferenceAllVPs } from '../ssi/vp-dereferencer.js';
import { addReattemptable } from './reattemptable.js';
import { markUntrusted } from '../trust/trust-store.js';
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

const PERMANENT_DID_ERRORS = ['notFound', 'invalidDid', 'methodNotSupported'];

function isPermanentDIDError(error: string | undefined): boolean {
  if (!error) return false;
  return PERMANENT_DID_ERRORS.some((pe) => error.includes(pe));
}

export async function runPass1(
  affectedDids: Set<string>,
  _indexer: IndexerClient,
  currentBlock = 0,
  trustTtlSeconds = 3600,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  logger.info({ didCount: affectedDids.size, block: currentBlock }, 'Pass1 started \u2014 DID resolution + VP dereferencing');

  for (const did of affectedDids) {
    try {
      // 1. Invalidate cached DID Document
      logger.debug({ did }, 'Pass1: invalidating cached DID document');
      await deleteCachedFile(did);

      // 2. Re-resolve DID Document (will re-cache)
      logger.debug({ did }, 'Pass1: resolving DID document');
      const didResult = await resolveDID(did);
      if (didResult.error || !didResult.result) {
        const errorMsg = didResult.error?.error;
        if (isPermanentDIDError(errorMsg)) {
          logger.warn({ did, error: errorMsg }, 'Pass1: permanent DID resolution failure \u2014 marking UNTRUSTED');
          await markUntrusted(did, currentBlock, trustTtlSeconds);
          await addReattemptable(did, 'DID_DOC', 'PERMANENT');
        } else {
          logger.warn({ did, error: errorMsg }, 'Pass1: DID resolution failed (transient)');
          await addReattemptable(did, 'DID_DOC', 'TRANSIENT');
        }
        failed.push(did);
        continue;
      }

      logger.debug({ did }, 'Pass1: DID resolved OK \u2014 dereferencing VPs');

      // 3. Dereference VPs and cache VCs
      const { vps, errors: vpErrors } = await dereferenceAllVPs(didResult.result.didDocument);

      if (vpErrors.length > 0) {
        logger.warn(
          { did, vpErrors: vpErrors.length, failedUrls: vpErrors.map((e) => e.resource) },
          'Pass1: some VPs failed to dereference',
        );
        for (const vpErr of vpErrors) {
          logger.debug({ did, vpUrl: vpErr.resource, error: vpErr.error }, 'Pass1: VP dereference error detail');
          await addReattemptable(vpErr.resource, 'VP', 'TRANSIENT');
        }
      }

      const totalCreds = vps.reduce((sum, vp) => sum + vp.credentials.length, 0);
      logger.info({ did, vpsOk: vps.length, vpsFailed: vpErrors.length, credentials: totalCreds }, 'Pass1: DID processed OK');
      succeeded.push(did);
    } catch (err) {
      logger.error({ did, err }, 'Pass1: unexpected error');
      await addReattemptable(did, 'DID_DOC', 'TRANSIENT');
      failed.push(did);
    }
  }

  logger.info({ succeeded: succeeded.length, failed: failed.length, block: currentBlock }, 'Pass1 complete');
  return { succeeded, failed };
}
