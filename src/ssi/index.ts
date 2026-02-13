export { initializeAgent, getAgent, shutdownAgent } from './agent.js';
export { resolveDID } from './did-resolver.js';
export { extractLinkedVPEndpoints, dereferenceVP, dereferenceAllVPs } from './vp-dereferencer.js';
export {
  extractCredentialsFromVP,
  detectFormat,
  extractIssuerDid,
  extractCredentialSchemaId,
  verifyW3cCredential,
  verifyAnonCredsCredential,
} from './vc-verifier.js';
export { computeDigestSRI, computeDigestSRISync } from './digest.js';
export type {
  ResolvedDIDDocument,
  LinkedVPEndpoint,
  DereferencedVP,
  DereferencedVC,
  DereferenceError,
} from './types.js';
