import {
  JsonTransformer,
  W3cJsonLdVerifiableCredential,
  W3cJwtVerifiableCredential,
} from '@credo-ts/core';
import { getAgent } from './agent.js';
import type { DereferencedVC } from './types.js';

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

export async function verifyW3cCredential(
  vc: Record<string, unknown>,
): Promise<{ verified: boolean; error?: string }> {
  try {
    const agent = getAgent();

    let result;
    if (typeof vc.raw === 'string') {
      // JWT-encoded VC (compact JWS)
      const credential = W3cJwtVerifiableCredential.fromSerializedJwt(vc.raw);
      result = await agent.w3cCredentials.verifyCredential({ credential });
    } else {
      // JSON-LD VC
      const credential = JsonTransformer.fromJSON(vc, W3cJsonLdVerifiableCredential);
      result = await agent.w3cCredentials.verifyCredential({ credential });
    }

    if (!result.isValid) {
      const errorMsg = result.error?.message ?? 'Credential verification failed';
      return { verified: false, error: errorMsg };
    }

    return { verified: true };
  } catch (err) {
    return { verified: false, error: err instanceof Error ? err.message : String(err) };
  }
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
