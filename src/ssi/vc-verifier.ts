import { createHash, createPublicKey, verify } from 'node:crypto';
import jsonld from '@digitalcredentials/jsonld';
import { base58 } from '@scure/base';
import * as jose from 'jose';
import { resolveDID } from './did-resolver.js';
import { createLogger } from '../logger.js';
import type { DereferencedVC } from './types.js';

const logger = createLogger('vc-verifier');

// Ed25519 SPKI DER prefix (same as in did-resolver.ts)
const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

// Ed25519 multicodec prefix: 0xed01
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

// ---------------------------------------------------------------------------
// Public helpers (unchanged API)
// ---------------------------------------------------------------------------

export function extractCredentialsFromVP(vp: Record<string, unknown>): DereferencedVC[] {
  const vcArray = vp.verifiableCredential;
  if (!Array.isArray(vcArray)) return [];

  return vcArray.map((vc, index) => {
    const vcObj = typeof vc === 'string' ? { raw: vc } : (vc as Record<string, unknown>);
    const format = detectFormat(vc);
    const issuerDid = extractIssuerDid(vcObj);
    const credentialSchemaId = extractCredentialSchemaId(vcObj);

    return {
      vcId: String(vcObj.id ?? `vc-${index}`),
      vc: vcObj,
      format,
      issuerDid,
      credentialSchemaId,
      verified: false,
    };
  });
}

export function detectFormat(vc: unknown): DereferencedVC['format'] {
  if (typeof vc === 'string') {
    // JWT-encoded VC (compact JWS)
    return 'w3c-jwt';
  }

  const vcObj = vc as Record<string, unknown>;

  // Check for AnonCreds indicators
  if (vcObj.schema_id || vcObj.cred_def_id) {
    return 'anoncreds';
  }

  // Default to JSON-LD
  return 'w3c-jsonld';
}

export function extractIssuerDid(vc: Record<string, unknown>): string {
  const issuer = vc.issuer;
  if (typeof issuer === 'string') return issuer;
  if (typeof issuer === 'object' && issuer !== null) {
    return String((issuer as Record<string, unknown>).id ?? '');
  }
  return '';
}

export function extractCredentialSchemaId(vc: Record<string, unknown>): string | undefined {
  const credentialSchema = vc.credentialSchema;
  if (!credentialSchema) {
    // AnonCreds: check relatedJsonSchemaCredentialId
    if (vc.relatedJsonSchemaCredentialId) {
      return String(vc.relatedJsonSchemaCredentialId);
    }
    return undefined;
  }

  if (typeof credentialSchema === 'string') return credentialSchema;
  if (typeof credentialSchema === 'object' && credentialSchema !== null) {
    return String((credentialSchema as Record<string, unknown>).id ?? '');
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// W3C Credential verification \u2014 direct crypto (no Credo)
// ---------------------------------------------------------------------------

export async function verifyW3cCredential(
  vc: Record<string, unknown>,
): Promise<{ verified: boolean; error?: string }> {
  try {
    if (typeof vc.raw === 'string') {
      return await verifyJwtCredential(vc.raw);
    }
    return await verifyJsonLdCredential(vc);
  } catch (err) {
    return { verified: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Ed25519Signature2020 verification (JSON-LD Data Integrity)
//
// Algorithm (W3C LD-Proofs + Ed25519Signature2020 spec):
//   1. Separate proof from document
//   2. Canonicalize proof options (proof without proofValue, with @context)
//   3. Canonicalize document (without proof)
//   4. verifyData = SHA-256(proofOptionsNQuads) || SHA-256(documentNQuads)
//   5. Decode proofValue from multibase base58 ('z' prefix)
//   6. Resolve verification method DID \u2192 extract public key
//   7. Verify Ed25519 signature over verifyData
// ---------------------------------------------------------------------------

async function verifyJsonLdCredential(
  vc: Record<string, unknown>,
): Promise<{ verified: boolean; error?: string }> {
  const proof = vc.proof as Record<string, unknown> | undefined;
  if (!proof) {
    return { verified: false, error: 'Credential has no proof' };
  }

  if (proof.type !== 'Ed25519Signature2020') {
    return { verified: false, error: `Unsupported proof type: ${proof.type}` };
  }

  const proofValue = proof.proofValue as string | undefined;
  if (!proofValue || typeof proofValue !== 'string' || !proofValue.startsWith('z')) {
    return { verified: false, error: 'Missing or invalid proofValue (expected multibase base58)' };
  }

  const verificationMethodId = proof.verificationMethod as string | undefined;
  if (!verificationMethodId) {
    return { verified: false, error: 'Missing verificationMethod in proof' };
  }

  // 1. Build proof options: proof without proofValue, with @context from document
  const proofOptions: Record<string, unknown> = { ...proof };
  delete proofOptions.proofValue;
  proofOptions['@context'] = vc['@context'];

  // 2. Build document without proof
  const document: Record<string, unknown> = { ...vc };
  delete document.proof;

  // 3. Canonicalize both (use default document loader to match issuer's behavior)
  const [proofNQuads, docNQuads] = await Promise.all([
    jsonld.canonize(proofOptions, {
      algorithm: 'URDNA2015',
      format: 'application/n-quads',
      safe: false,
    }),
    jsonld.canonize(document, {
      algorithm: 'URDNA2015',
      format: 'application/n-quads',
      safe: false,
    }),
  ]);

  // 4. Hash and concatenate
  const proofHash = createHash('sha256').update(proofNQuads as string).digest();
  const docHash = createHash('sha256').update(docNQuads as string).digest();
  const verifyData = Buffer.concat([proofHash, docHash]);

  // 5. Decode signature from multibase base58
  const signatureBytes = base58.decode(proofValue.slice(1));

  // 6. Resolve verification method \u2192 extract public key
  const publicKeyBytes = await resolvePublicKey(verificationMethodId);
  if (!publicKeyBytes) {
    return { verified: false, error: `Cannot resolve verification method: ${verificationMethodId}` };
  }

  // 7. Verify Ed25519 signature
  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
    format: 'der',
    type: 'spki',
  });

  const valid = verify(null, verifyData, publicKey, signatureBytes);
  if (!valid) {
    return { verified: false, error: 'Ed25519 signature verification failed' };
  }

  logger.debug({ vcId: vc.id, verificationMethod: verificationMethodId }, 'Ed25519Signature2020 verified OK');
  return { verified: true };
}

// ---------------------------------------------------------------------------
// JWT credential verification
// ---------------------------------------------------------------------------

async function verifyJwtCredential(
  jwt: string,
): Promise<{ verified: boolean; error?: string }> {
  // Parse JWT header to get kid
  const header = jose.decodeProtectedHeader(jwt);
  const kid = header.kid;
  if (!kid) {
    return { verified: false, error: 'JWT missing kid in header' };
  }

  // Resolve public key from kid (DID URL)
  const publicKeyBytes = await resolvePublicKey(kid);
  if (!publicKeyBytes) {
    return { verified: false, error: `Cannot resolve JWT kid: ${kid}` };
  }

  // Import as JWK for jose
  const alg = header.alg ?? 'EdDSA';
  const jwk: jose.JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: Buffer.from(publicKeyBytes).toString('base64url'),
  };
  const key = await jose.importJWK(jwk, alg);

  // Verify JWT
  const { payload } = await jose.jwtVerify(jwt, key, {
    // Skip clock tolerance checks \u2014 credential validity is checked elsewhere
    clockTolerance: Infinity,
  });

  logger.debug({ kid, sub: payload.sub }, 'JWT credential verified OK');
  return { verified: true };
}

// ---------------------------------------------------------------------------
// Resolve a verification method DID URL to a raw Ed25519 public key (32 bytes)
// ---------------------------------------------------------------------------

async function resolvePublicKey(verificationMethodId: string): Promise<Uint8Array | null> {
  // Extract the DID (before the fragment)
  const did = verificationMethodId.split('#')[0];
  const { result, error } = await resolveDID(did);
  if (!result || error) {
    logger.debug({ did, error: error?.error }, 'Failed to resolve DID for verification method');
    return null;
  }

  const didDoc = result.didDocument;

  // Find the verification method by id
  const verificationMethods = (didDoc.verificationMethod ?? didDoc.publicKey ?? []) as Record<string, unknown>[];
  const vm = verificationMethods.find((m) => m.id === verificationMethodId);
  if (!vm) {
    logger.debug({ verificationMethodId, available: verificationMethods.map((m) => m.id) }, 'Verification method not found');
    return null;
  }

  // Extract raw public key bytes
  if (vm.publicKeyMultibase && typeof vm.publicKeyMultibase === 'string') {
    const multibase = vm.publicKeyMultibase as string;
    if (!multibase.startsWith('z')) {
      logger.debug({ verificationMethodId }, 'Unsupported multibase prefix');
      return null;
    }
    const decoded = base58.decode(multibase.slice(1));
    // Strip multicodec prefix if present (0xed 0x01 for Ed25519)
    if (decoded.length === 34 && decoded[0] === ED25519_MULTICODEC_PREFIX[0] && decoded[1] === ED25519_MULTICODEC_PREFIX[1]) {
      return decoded.slice(2);
    }
    // Already raw 32-byte key
    if (decoded.length === 32) {
      return decoded;
    }
    logger.debug({ verificationMethodId, decodedLength: decoded.length }, 'Unexpected public key length');
    return null;
  }

  if (vm.publicKeyBase58 && typeof vm.publicKeyBase58 === 'string') {
    return base58.decode(vm.publicKeyBase58 as string);
  }

  if (vm.publicKeyJwk && typeof vm.publicKeyJwk === 'object') {
    const jwk = vm.publicKeyJwk as Record<string, unknown>;
    if (jwk.x && typeof jwk.x === 'string') {
      return Buffer.from(jwk.x as string, 'base64url');
    }
  }

  logger.debug({ verificationMethodId, vmType: vm.type }, 'No supported public key format found');
  return null;
}

export async function verifyAnonCredsCredential(
  _vc: Record<string, unknown>,
): Promise<{ verified: boolean; error?: string }> {
  // AnonCreds verification requires resolving credential definitions,
  // schemas, and revocation registries from the Verana chain via an
  // AnonCredsRegistry implementation. This will be implemented once the
  // WebVhAnonCredsRegistry integration is in place.
  return { verified: false, error: 'AnonCreds verification not yet implemented \u2014 requires registry integration' };
}
