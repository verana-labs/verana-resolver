import { createPublicKey, verify } from 'node:crypto';
import { JsonTransformer, DidDocument } from '@credo-ts/core';
import type { AgentContext } from '@credo-ts/core';
import { resolveDID as resolveWebVh } from 'didwebvh-ts';

// Ed25519 verifier for didwebvh-ts (uses Node.js built-in crypto)
const ED25519_SPKI_PREFIX = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
const ed25519Verifier = {
  async verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey)]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, message, key, signature);
  },
};

/**
 * Custom Credo DID resolver for did:webvh.
 *
 * Wraps the DIF didwebvh-ts reference implementation so that
 * Credo's W3cCredentialsModule can resolve did:webvh issuer DIDs
 * during credential signature verification.
 */
export class WebVhDidResolver {
  readonly supportedMethods = ['webvh'];
  readonly allowsCaching = true;
  readonly allowsLocalDidRecord = false;

  async resolve(
    _agentContext: AgentContext,
    did: string,
  ): Promise<{
    didResolutionMetadata: Record<string, unknown>;
    didDocument: DidDocument | null;
    didDocumentMetadata: Record<string, unknown>;
  }> {
    try {
      const resolution = await resolveWebVh(did, { verifier: ed25519Verifier });

      if (resolution.meta?.error || !resolution.doc) {
        return {
          didResolutionMetadata: {
            error: resolution.meta?.error ?? 'notFound',
            message: resolution.meta?.problemDetails?.detail,
          },
          didDocument: null,
          didDocumentMetadata: {},
        };
      }

      const didDocument = JsonTransformer.fromJSON(resolution.doc, DidDocument);

      return {
        didResolutionMetadata: {},
        didDocument,
        didDocumentMetadata: {
          updated: resolution.meta?.updated,
        },
      };
    } catch (err) {
      return {
        didResolutionMetadata: {
          error: 'notFound',
          message: err instanceof Error ? err.message : String(err),
        },
        didDocument: null,
        didDocumentMetadata: {},
      };
    }
  }
}
