import { createPublicKey, verify } from 'node:crypto';
import { Resolver } from 'did-resolver';
import { getResolver as getWebDidResolver } from 'web-did-resolver';
import { resolveDID as resolveWebVh } from 'didwebvh-ts';
import { getCachedFile, setCachedFile } from '../cache/file-cache.js';
import type { ResolvedDIDDocument, DereferenceError } from './types.js';
import pino from 'pino';

const logger = pino({ name: 'did-resolver' });

// did:web resolver via DIF web-did-resolver
const webResolver = new Resolver(getWebDidResolver());

// Ed25519 verifier for didwebvh-ts (uses Node.js built-in crypto)
const ED25519_SPKI_PREFIX = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
const ed25519Verifier: { verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> } = {
  async verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey)]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, message, key, signature);
  },
};

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

  // Route to the correct resolver based on DID method
  const method = did.split(':')[1];
  logger.debug({ did, method }, 'Resolving DID');

  try {
    if (method === 'webvh') {
      return await resolveDidWebVh(did);
    } else if (method === 'web') {
      return await resolveDidWeb(did);
    } else {
      return {
        error: {
          resource: did,
          resourceType: 'did-document',
          error: 'unsupportedDidMethod',
          message: `DID method '${method}' is not supported`,
          timestamp: Date.now(),
        },
      };
    }
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

async function resolveDidWeb(did: string): Promise<{
  result?: ResolvedDIDDocument;
  error?: DereferenceError;
}> {
  const resolution = await webResolver.resolve(did);

  if (resolution.didResolutionMetadata.error || !resolution.didDocument) {
    const error = resolution.didResolutionMetadata.error ?? 'DID Document not found';
    const message = resolution.didResolutionMetadata.message as string | undefined;
    logger.debug({ did, error, message: message ?? 'none' }, 'did:web resolution failed');
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

  const didDoc = resolution.didDocument as Record<string, unknown>;
  const serviceCount = Array.isArray(didDoc.service) ? (didDoc.service as unknown[]).length : 0;
  const resolved: ResolvedDIDDocument = {
    did,
    didDocument: didDoc,
    cachedAt: Date.now(),
    validUntil: (resolution.didDocumentMetadata?.nextUpdate as string) ?? undefined,
  };

  logger.debug({ did, serviceCount, validUntil: resolved.validUntil ?? 'none' }, 'did:web resolved successfully');
  await setCachedFile(did, JSON.stringify(resolved));
  return { result: resolved };
}

async function resolveDidWebVh(did: string): Promise<{
  result?: ResolvedDIDDocument;
  error?: DereferenceError;
}> {
  const resolution = await resolveWebVh(did, { verifier: ed25519Verifier });

  if (resolution.meta?.error || !resolution.doc) {
    const error = resolution.meta?.error ?? 'DID Document not found';
    const message = resolution.meta?.problemDetails?.detail;
    logger.debug({ did, error, message: message ?? 'none' }, 'did:webvh resolution failed');
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

  const didDoc = resolution.doc as Record<string, unknown>;
  const serviceCount = Array.isArray(didDoc.service) ? (didDoc.service as unknown[]).length : 0;
  const resolved: ResolvedDIDDocument = {
    did,
    didDocument: didDoc,
    cachedAt: Date.now(),
    validUntil: (resolution.meta?.updated as string) ?? undefined,
  };

  logger.debug({ did, serviceCount, validUntil: resolved.validUntil ?? 'none' }, 'did:webvh resolved successfully');
  await setCachedFile(did, JSON.stringify(resolved));
  return { result: resolved };
}
