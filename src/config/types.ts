import { z } from 'zod';

export const VprConfigSchema = z.object({
  name: z.string(),
  baseurls: z.array(z.string().url()),
  version: z.string(),
  production: z.boolean(),
});

export const EcsEcosystemSchema = z.object({
  did: z.string(),
  vpr: z.string(),
});

export const ResolverConfigSchema = z.object({
  pollInterval: z.number().min(1).default(10),
  cacheTtl: z.number().min(60).default(3600),
  trustTtl: z.number().min(60).default(1800),
  objectCachingRetryDays: z.number().min(1).default(7),
  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(5435),
    database: z.string().default('verana_resolver'),
    username: z.string().default('verana_resolver_user'),
    password: z.string().default(''),
    synchronize: z.boolean().default(false),
    logging: z.boolean().default(false),
  }),
  api: z.object({
    port: z.number().default(4000),
  }),
  verifiablePublicRegistries: z.array(VprConfigSchema),
  ecsEcosystems: z.array(EcsEcosystemSchema),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type ResolverConfig = z.infer<typeof ResolverConfigSchema>;
export type VprConfig = z.infer<typeof VprConfigSchema>;
export type EcsEcosystem = z.infer<typeof EcsEcosystemSchema>;

export enum EntityType {
  TrustRegistry = 'TrustRegistry',
  CredentialSchema = 'CredentialSchema',
  Permission = 'Permission',
  PermissionSession = 'PermissionSession',
  DidDirectory = 'DidDirectory',
  GovernanceFrameworkVersion = 'GovernanceFrameworkVersion',
  GovernanceFrameworkDocument = 'GovernanceFrameworkDocument',
  TrustDeposit = 'TrustDeposit',
  GlobalVariables = 'GlobalVariables',
}

export enum OperationType {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
}

export interface EntityChange {
  entityType: EntityType;
  entityId: string;
  operationType: OperationType;
  data?: any;
}

export interface BlockChanges {
  blockHeight: number;
  changes: EntityChange[];
}

export enum TrustStatus {
  Trusted = 'trusted',
  PartiallyTrusted = 'partially_trusted',
  Untrusted = 'untrusted',
}

export enum CredentialType {
  VTC = 'VTC',
  VTP = 'VTP',
  VTJSC = 'VTJSC',
  ECSVTC = 'ECSVTC',
  ServiceECSVTC = 'ServiceECSVTC',
  OrganizationECSVTC = 'OrganizationECSVTC',
  PersonaECSVTC = 'PersonaECSVTC',
}

export interface CredentialValidationResult {
  url: string;
  type: CredentialType;
  isValid: boolean;
  isExpired: boolean;
  issuerDid?: string;
  subjectDid?: string;
  schemaId?: string;
  issuanceBlockHeight?: number;
  error?: string;
}

export interface TrustEvaluationResult {
  did: string;
  verifiableTrustStatus: TrustStatus;
  production: boolean;
  validCredentials: CredentialValidationResult[];
  ignoredCredentials: CredentialValidationResult[];
  failedCredentials: CredentialValidationResult[];
  evaluatedAt: Date;
  expiresAt: Date;
  isVerifiableService: boolean;
  ecosystems: string[];
  roles: string[];
}

export interface ProcessingState {
  lastProcessedBlock: number | null;
  reattemptableResources: ReattemptableResource[];
}

export interface ReattemptableResource {
  id: string;
  resourceType: 'dereference' | 'evaluation';
  firstFailureAt: Date;
  lastRetryAt: Date;
  errorType: string;
  retryCount: number;
}
