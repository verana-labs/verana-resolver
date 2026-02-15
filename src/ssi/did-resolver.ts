import { getAgent } from './agent.js';
import { getCachedFile, setCachedFile } from '../cache/file-cache.js';
import type { ResolvedDIDDocument, DereferenceError } from './types.js';
import pino from 'pino';

const logger = pino({ name: 'did-resolver' });

export async function resolveDID(did: string): Promise<{
  result?: ResolvedDIDDocument;
  error?: DereferenceError;
}> {
  // Check Redis cache first
  const cached = await getCachedFile(did);
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached) as ResolvedDIDDocument;

      // Check validUntil expiry
      if (parsed.validUntil) {
        const validUntilDate = new Date(parsed.validUntil);
        if (validUntilDate.getTime() < Date.now()) {
          logger.debug({ did, validUntil: parsed.validUntil }, 'DID cache expired \u2014 re-resolving');
          // Expired \u2014 fall through to re-resolve
        } else {
          logger.debug({ did, validUntil: parsed.validUntil }, 'DID cache hit (valid)');
          return { result: parsed };
        }
      } else {
        logger.debug({ did }, 'DID cache hit (no expiry)');
        return { result: parsed };
      }
    } catch {
      logger.debug({ did }, 'DID cache entry invalid \u2014 re-resolving');
      // Invalid cache entry \u2014 re-resolve
    }
  } else {
    logger.debug({ did }, 'DID cache miss');
  }

  // Resolve via Credo agent
  logger.debug({ did }, 'Resolving DID via Credo agent');
  try {
    const agent = getAgent();
    const resolution = await agent.dids.resolve(did);

    if (resolution.didResolutionMetadata.error || !resolution.didDocument) {
      const error = resolution.didResolutionMetadata.error ?? 'DID Document not found';
      const message = (resolution.didResolutionMetadata as Record<string, unknown>).message as string | undefined;
      logger.debug({ did, error, message: message ?? 'none' }, 'DID resolution failed');
      return {
        error: {
          resource: did,
          resourceType: 'did-document',
          error,
          message,
          timestamp: Date.now(),
        },
      };
    }

    const didDocJson = resolution.didDocument.toJSON();
    const serviceCount = Array.isArray((didDocJson as Record<string, unknown>).service)
      ? ((didDocJson as Record<string, unknown>).service as unknown[]).length
      : 0;
    const resolved: ResolvedDIDDocument = {
      did,
      didDocument: didDocJson as Record<string, unknown>,
      cachedAt: Date.now(),
      validUntil: (resolution.didDocumentMetadata?.nextUpdate as string) ?? undefined,
    };

    logger.debug({ did, serviceCount, validUntil: resolved.validUntil ?? 'none' }, 'DID resolved successfully');

    // Cache in Redis
    await setCachedFile(did, JSON.stringify(resolved));

    return { result: resolved };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.debug({ did, error: errorMsg }, 'DID resolution threw an exception');
    return {
      error: {
        resource: did,
        resourceType: 'did-document',
        error: errorMsg,
        timestamp: Date.now(),
      },
    };
  }
}
