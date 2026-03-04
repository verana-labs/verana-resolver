export { getSummaryTrustResult, getFullTrustResult, upsertTrustResult, markUntrusted } from './trust-store.js';
export type { TrustResultSummary } from './trust-store.js';
export { verreLogger } from './verre-logger.js';
export type {
  TrustResult,
  TrustStatus,
  CredentialEvaluation,
  CredentialResultStatus,
  FailedCredential,
  VPDereferenceError,
  PermissionChainEntry,
  PermissionType,
  EcsType,
  CredentialSchemaInfo,
  EvaluationContext,
} from './types.js';
