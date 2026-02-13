import { getAgent } from './agent.js';
import { getCachedFile, setCachedFile } from '../cache/file-cache.js';
import type { ResolvedDIDDocument, DereferenceError } from './types.js';

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
          // Expired — fall through to re-resolve
        } else {
          return { result: parsed };
        }
      } else {
        return { result: parsed };
      }
    } catch {
      // Invalid cache entry — re-resolve
    }
  }

  // Resolve via Credo agent
  try {
    const agent = getAgent();
    const resolution = await agent.dids.resolve(did);

    if (resolution.didResolutionMetadata.error || !resolution.didDocument) {
      return {
        error: {
          resource: did,
          resourceType: 'did-document',
          error: resolution.didResolutionMetadata.error ?? 'DID Document not found',
          timestamp: Date.now(),
        },
      };
    }

    const didDocJson = resolution.didDocument.toJSON();
    const resolved: ResolvedDIDDocument = {
      did,
      didDocument: didDocJson as Record<string, unknown>,
      cachedAt: Date.now(),
      validUntil: (resolution.didDocumentMetadata?.nextUpdate as string) ?? undefined,
    };

    // Cache in Redis
    await setCachedFile(did, JSON.stringify(resolved));

    return { result: resolved };
  } catch (err) {
    return {
      error: {
        resource: did,
        resourceType: 'did-document',
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      },
    };
  }
}
