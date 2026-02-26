import { describe, it, expect, vi } from 'vitest';
import { evaluateVSRequirements } from '../src/trust/vs-requirements.js';
import { createEvaluationContext } from '../src/trust/resolve-trust.js';
import type { CredentialEvaluation, TrustResult, EvaluationContext } from '../src/trust/types.js';
import type { IndexerClient } from '../src/indexer/client.js';

// --- createEvaluationContext ---

describe('createEvaluationContext', () => {
  it('creates a context with empty visited set and memo', () => {
    const allowed = new Set(['did:web:ecosystem.example.com']);
    const ctx = createEvaluationContext(1500000, 3600, allowed);
    expect(ctx.currentBlock).toBe(1500000);
    expect(ctx.cacheTtlSeconds).toBe(3600);
    expect(ctx.visitedDids.size).toBe(0);
    expect(ctx.trustMemo.size).toBe(0);
    expect(ctx.allowedEcosystemDids).toBe(allowed);
  });
});

// --- evaluateVSRequirements ---

function makeCred(overrides: Partial<CredentialEvaluation>): CredentialEvaluation {
  return {
    result: 'VALID',
    ecsType: null,
    presentedBy: 'did:web:test.example.com',
    issuedBy: 'did:web:issuer.example.com',
    id: 'urn:uuid:test',
    type: 'VerifiableTrustCredential',
    format: 'W3C_VTC',
    claims: {},
    permissionChain: [],
    schema: {
      id: 1,
      jsonSchema: 'https://example.com/schemas/ecs-service/v1',
      ecosystemDid: 'did:web:ecosystem.example.com',
      issuerPermManagementMode: 'OPEN',
    },
    ...overrides,
  };
}

function makeTrustResult(did: string, creds: CredentialEvaluation[]): TrustResult {
  return {
    did,
    trustStatus: 'TRUSTED',
    production: true,
    evaluatedAt: new Date().toISOString(),
    evaluatedAtBlock: 1500000,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    credentials: creds,
    failedCredentials: [],
    dereferenceErrors: [],
  };
}

const mockIndexer = {} as IndexerClient;

const defaultAllowedEcosystems = new Set([
  'did:web:ecosystem.example.com',
  'did:web:eco1.example.com',
  'did:web:eco2.example.com',
]);

describe('evaluateVSRequirements', () => {
  it('returns UNTRUSTED when no valid credentials', async () => {
    const ctx = createEvaluationContext(1500000, 3600, defaultAllowedEcosystems);
    const mockResolve = vi.fn();
    const result = await evaluateVSRequirements('did:web:test.example.com', [], mockIndexer, ctx, mockResolve, defaultAllowedEcosystems);
    expect(result).toBe('UNTRUSTED');
  });

  it('returns UNTRUSTED when credentials have no ecosystem', async () => {
    const ctx = createEvaluationContext(1500000, 3600, defaultAllowedEcosystems);
    const mockResolve = vi.fn();
    const cred = makeCred({ ecsType: 'ECS-SERVICE', schema: undefined });
    const result = await evaluateVSRequirements('did:web:test.example.com', [cred], mockIndexer, ctx, mockResolve, defaultAllowedEcosystems);
    expect(result).toBe('UNTRUSTED');
  });

  it('returns TRUSTED for VS-REQ-3: self-issued service + org (same DID)', async () => {
    const did = 'did:web:acme.example.com';
    const ctx = createEvaluationContext(1500000, 3600, defaultAllowedEcosystems);
    const mockResolve = vi.fn();

    const serviceCred = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: did,
    });
    const orgCred = makeCred({
      ecsType: 'ECS-ORG',
      presentedBy: did,
      issuedBy: 'did:web:ca-doi.example.com',
      schema: {
        id: 2,
        jsonSchema: 'https://example.com/schemas/ecs-org/v1',
        ecosystemDid: 'did:web:ecosystem.example.com',
        issuerPermManagementMode: 'OPEN',
      },
    });

    const result = await evaluateVSRequirements(did, [serviceCred, orgCred], mockIndexer, ctx, mockResolve, defaultAllowedEcosystems);
    expect(result).toBe('TRUSTED');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('returns UNTRUSTED for VS-REQ-3: self-issued service but no org/persona', async () => {
    const did = 'did:web:acme.example.com';
    const ctx = createEvaluationContext(1500000, 3600, defaultAllowedEcosystems);
    const mockResolve = vi.fn();

    const serviceCred = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: did,
    });

    const result = await evaluateVSRequirements(did, [serviceCred], mockIndexer, ctx, mockResolve, defaultAllowedEcosystems);
    expect(result).toBe('UNTRUSTED');
  });

  it('returns TRUSTED for VS-REQ-4: externally issued service + issuer has org', async () => {
    const did = 'did:web:alice.example.com';
    const issuerDid = 'did:web:certify.example.com';
    const ctx = createEvaluationContext(1500000, 3600, defaultAllowedEcosystems);

    const serviceCred = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: issuerDid,
    });

    const issuerOrgCred = makeCred({
      ecsType: 'ECS-ORG',
      presentedBy: issuerDid,
      issuedBy: 'did:web:authority.example.com',
      result: 'VALID',
    });

    const mockResolve = vi.fn().mockResolvedValue(makeTrustResult(issuerDid, [issuerOrgCred]));

    const result = await evaluateVSRequirements(did, [serviceCred], mockIndexer, ctx, mockResolve, defaultAllowedEcosystems);
    expect(result).toBe('TRUSTED');
    expect(mockResolve).toHaveBeenCalledWith(issuerDid, mockIndexer, ctx);
  });

  it('returns UNTRUSTED for VS-REQ-4: externally issued service but issuer has no org', async () => {
    const did = 'did:web:alice.example.com';
    const issuerDid = 'did:web:certify.example.com';
    const ctx = createEvaluationContext(1500000, 3600, defaultAllowedEcosystems);

    const serviceCred = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: issuerDid,
    });

    const mockResolve = vi.fn().mockResolvedValue(makeTrustResult(issuerDid, []));

    const result = await evaluateVSRequirements(did, [serviceCred], mockIndexer, ctx, mockResolve, defaultAllowedEcosystems);
    expect(result).toBe('UNTRUSTED');
  });

  it('returns PARTIAL when some ecosystems satisfied, others not', async () => {
    const did = 'did:web:acme.example.com';
    const ctx = createEvaluationContext(1500000, 3600, defaultAllowedEcosystems);
    const mockResolve = vi.fn();

    // Ecosystem 1: satisfied (self-issued service + org)
    const serviceCred1 = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: did,
      schema: {
        id: 1,
        jsonSchema: 'https://example.com/schemas/ecs-service/v1',
        ecosystemDid: 'did:web:eco1.example.com',
        issuerPermManagementMode: 'OPEN',
      },
    });
    const orgCred1 = makeCred({
      ecsType: 'ECS-ORG',
      presentedBy: did,
      issuedBy: 'did:web:issuer.example.com',
      schema: {
        id: 2,
        jsonSchema: 'https://example.com/schemas/ecs-org/v1',
        ecosystemDid: 'did:web:eco1.example.com',
        issuerPermManagementMode: 'OPEN',
      },
    });

    // Ecosystem 2: not satisfied (service only, no org, self-issued)
    const serviceCred2 = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: did,
      schema: {
        id: 3,
        jsonSchema: 'https://another.example.com/schemas/ecs-service/v1',
        ecosystemDid: 'did:web:eco2.example.com',
        issuerPermManagementMode: 'OPEN',
      },
    });

    const result = await evaluateVSRequirements(
      did,
      [serviceCred1, orgCred1, serviceCred2],
      mockIndexer,
      ctx,
      mockResolve,
      defaultAllowedEcosystems,
    );
    expect(result).toBe('PARTIAL');
  });

  it('returns UNTRUSTED when ecosystem DID is not in the allowlist', async () => {
    const did = 'did:web:acme.example.com';
    const disallowedEcosystems = new Set(['did:web:other-ecosystem.example.com']);
    const ctx = createEvaluationContext(1500000, 3600, disallowedEcosystems);
    const mockResolve = vi.fn();

    const serviceCred = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: did,
    });
    const orgCred = makeCred({
      ecsType: 'ECS-ORG',
      presentedBy: did,
      issuedBy: 'did:web:ca-doi.example.com',
    });

    const result = await evaluateVSRequirements(did, [serviceCred, orgCred], mockIndexer, ctx, mockResolve, disallowedEcosystems);
    expect(result).toBe('UNTRUSTED');
  });

  it('only considers credentials from allowed ecosystems', async () => {
    const did = 'did:web:acme.example.com';
    const partialAllow = new Set(['did:web:eco1.example.com']);
    const ctx = createEvaluationContext(1500000, 3600, partialAllow);
    const mockResolve = vi.fn();

    // Ecosystem 1 (allowed): satisfied
    const serviceCred1 = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: did,
      schema: {
        id: 1,
        jsonSchema: 'https://example.com/schemas/ecs-service/v1',
        ecosystemDid: 'did:web:eco1.example.com',
        issuerPermManagementMode: 'OPEN',
      },
    });
    const orgCred1 = makeCred({
      ecsType: 'ECS-ORG',
      presentedBy: did,
      issuedBy: 'did:web:issuer.example.com',
      schema: {
        id: 2,
        jsonSchema: 'https://example.com/schemas/ecs-org/v1',
        ecosystemDid: 'did:web:eco1.example.com',
        issuerPermManagementMode: 'OPEN',
      },
    });

    // Ecosystem 2 (NOT allowed): would be unsatisfied, but filtered out
    const serviceCred2 = makeCred({
      ecsType: 'ECS-SERVICE',
      presentedBy: did,
      issuedBy: did,
      schema: {
        id: 3,
        jsonSchema: 'https://another.example.com/schemas/ecs-service/v1',
        ecosystemDid: 'did:web:eco2.example.com',
        issuerPermManagementMode: 'OPEN',
      },
    });

    // eco2 is NOT in allowlist, so only eco1 is evaluated \u2192 TRUSTED (not PARTIAL)
    const result = await evaluateVSRequirements(
      did,
      [serviceCred1, orgCred1, serviceCred2],
      mockIndexer,
      ctx,
      mockResolve,
      partialAllow,
    );
    expect(result).toBe('TRUSTED');
  });
});

// --- Cycle detection (via memoization in resolveTrust) ---

describe('EvaluationContext cycle detection', () => {
  it('visitedDids tracks seen DIDs', () => {
    const ctx = createEvaluationContext(100, 3600, defaultAllowedEcosystems);
    ctx.visitedDids.add('did:web:a.example.com');
    expect(ctx.visitedDids.has('did:web:a.example.com')).toBe(true);
    expect(ctx.visitedDids.has('did:web:b.example.com')).toBe(false);
  });

  it('trustMemo caches results', () => {
    const ctx = createEvaluationContext(100, 3600, defaultAllowedEcosystems);
    const result = makeTrustResult('did:web:a.example.com', []);
    ctx.trustMemo.set('did:web:a.example.com', result);
    expect(ctx.trustMemo.get('did:web:a.example.com')).toBe(result);
  });
});

// --- Permission chain entry derivation ---

describe('PermissionChainEntry structure', () => {
  it('contains required fields for ISSUER type', () => {
    const entry = {
      permissionId: 142,
      type: 'ISSUER' as const,
      did: 'did:web:acme.example.com',
      didIsTrustedVS: true,
      deposit: '5000000uvna',
      permState: 'ACTIVE',
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveUntil: '2027-01-01T00:00:00Z',
    };

    expect(entry.permissionId).toBe(142);
    expect(entry.type).toBe('ISSUER');
    expect(entry.didIsTrustedVS).toBe(true);
  });
});
