// Type declarations for @verana-labs/verre
// The package exports don't include a "types" condition, so Node16 moduleResolution
// can't resolve types through the exports map. This declaration bridges the gap.
declare module '@verana-labs/verre' {
  import { DIDDocument, Resolver } from 'did-resolver';

  // --- Enums ---

  export enum ECS {
    ORG = 'ecs-org',
    PERSONA = 'ecs-persona',
    SERVICE = 'ecs-service',
    USER_AGENT = 'ecs-user-agent',
  }

  export enum PermissionType {
    ISSUER = 'ISSUER',
    VERIFIER = 'VERIFIER',
    ISSUER_GRANTOR = 'ISSUER_GRANTOR',
    VERIFIER_GRANTOR = 'VERIFIER_GRANTOR',
    TRUST_REGISTRY = 'TRUST_REGISTRY',
    HOLDER = 'HOLDER',
  }

  export enum TrustResolutionOutcome {
    VERIFIED = 'verified',
    VERIFIED_TEST = 'verified-test',
    NOT_TRUSTED = 'not-trusted',
    INVALID = 'invalid',
  }

  export enum TrustErrorCode {
    INVALID = 'invalid',
    NOT_FOUND = 'not_found',
    NOT_SUPPORTED = 'not_supported',
    INVALID_PERMISSIONS = 'invalid_permissions',
    INVALID_REQUEST = 'invalid_request',
    SCHEMA_MISMATCH = 'schema_mismatch',
    VERIFICATION_FAILED = 'verification_failed',
  }

  // --- Types ---

  export type TrustResolution = {
    didDocument?: DIDDocument;
    verified: boolean;
    outcome: TrustResolutionOutcome;
    metadata?: TrustResolutionMetadata;
    service?: IService;
    serviceProvider?: ICredential;
  };

  export type CredentialResolution = {
    verified: boolean;
    outcome: TrustResolutionOutcome;
    issuer: string;
  };

  export type ResolverConfig = {
    verifiablePublicRegistries?: VerifiablePublicRegistry[];
    didResolver?: Resolver;
    cached?: boolean;
    skipDigestSRICheck?: boolean;
    logger?: IVerreLogger;
  };

  export type VerifyPermissionsOptions = {
    did: string;
    jsonSchemaCredentialId: string;
    issuanceDate: string;
    verifiablePublicRegistries: VerifiablePublicRegistry[];
    permissionType: PermissionType;
    logger?: IVerreLogger;
  };

  export type VerifiablePublicRegistry = {
    id: string;
    baseUrls: string[];
    production: boolean;
  };

  export type TrustResolutionMetadata = {
    errorMessage?: string;
    errorCode?: TrustErrorCode;
  };

  // --- Credential interfaces ---

  export interface BaseCredential {
    schemaType: ECS | 'unknown';
    id: string;
    issuer: string;
  }

  export interface IOrg extends BaseCredential {
    schemaType: typeof ECS.ORG;
    name: string;
    logo: string;
    registryId: string;
    registryUri?: string;
    address: string;
    countryCode: string;
    legalJurisdiction?: string;
    lei?: string;
    organizationKind?: string;
  }

  export interface IPersona extends BaseCredential {
    schemaType: typeof ECS.PERSONA;
    name: string;
    avatar?: string;
    controllerCountryCode: string;
    controllerJurisdiction?: string;
    description?: string;
    descriptionFormat?: string;
  }

  export interface IService extends BaseCredential {
    schemaType: typeof ECS.SERVICE;
    name: string;
    type: string;
    description: string;
    descriptionFormat?: string;
    logo: string;
    minimumAgeRequired: number;
    termsAndConditions: string;
    termsAndConditionsDigestSri?: string;
    privacyPolicy: string;
    privacyPolicyDigestSri?: string;
  }

  export interface IUserAgent extends BaseCredential {
    schemaType: typeof ECS.USER_AGENT;
    version: string;
    build?: string;
  }

  export interface IUnknownCredential extends BaseCredential {
    schemaType: 'unknown';
    [key: string]: unknown;
  }

  export type ICredential = IOrg | IPersona | IService | IUserAgent | IUnknownCredential;

  export interface IVerreLogger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: Error | unknown): void;
  }

  // --- Functions ---

  export function resolveDID(did: string, options: ResolverConfig): Promise<TrustResolution>;
  export function resolveCredential(credential: unknown, options: ResolverConfig): Promise<CredentialResolution>;
  export function verifyPermissions(options: VerifyPermissionsOptions): Promise<{ verified: boolean }>;
}
