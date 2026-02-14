export { resolveTrust, createEvaluationContext } from './resolve-trust.js';
export { evaluateCredential, classifyEcsType } from './evaluate-credential.js';
export { evaluateVSRequirements } from './vs-requirements.js';
export { buildPermissionChain } from './permission-chain.js';
export { getSummaryTrustResult, getFullTrustResult, upsertTrustResult } from './trust-store.js';
export type { TrustResultSummary } from './trust-store.js';
export type {
  TrustResult,
  TrustStatus,
  CredentialEvaluation,
  CredentialResultStatus,
  FailedCredential,
  PermissionChainEntry,
  PermissionType,
  EcsType,
  CredentialSchemaInfo,
  EvaluationContext,
} from './types.js';
