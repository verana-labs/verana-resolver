import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createQ3Route } from '../src/routes/q3-verifier-auth.js';
import { IndexerError } from '../src/indexer/errors.js';

function mockIndexer(overrides: Record<string, unknown> = {}) {
  return {
    listCredentialSchemas: vi.fn().mockResolvedValue({
      schemas: [
        { id: '12', json_schema: 'https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1', tr_id: '3' },
      ],
    }),
    listPermissions: vi.fn().mockResolvedValue({
      permissions: [
        {
          id: '275',
          schema_id: '12',
          type: 'VERIFIER',
          grantee: 'verana1vrf',
          did: 'did:web:employer-portal.example.com',
          created: '2025-04-01T00:00:00Z',
          modified: '2025-04-01T00:00:00Z',
          effective: '2025-04-01T00:00:00Z',
          expiration: '2027-04-01T00:00:00Z',
          effective_until: '2027-04-01T00:00:00Z',
          revoked: null,
          slashed: null,
          repaid: null,
          deposit: '2000000uvna',
          country: 'EU',
          vp_state: 'VALIDATED',
          perm_state: 'ACTIVE',
          validator_perm_id: '100',
          verification_fees: '50uvna',
          verification_fee_discount: '0',
          issued: 0,
          verified: 0,
          ecosystem_slash_events: 0,
          ecosystem_slashed_amount: '0',
          network_slash_events: 0,
          network_slashed_amount: '0',
        },
      ],
    }),
    getPermission: vi.fn().mockImplementation((id: string) => {
      if (id === '100') {
        return Promise.resolve({
          permission: {
            id: '100', type: 'VERIFIER_GRANTOR', did: 'did:web:eu-hr-association.example.com',
            deposit: '15000000uvna', perm_state: 'ACTIVE', validator_perm_id: '12',
            schema_id: '12', grantee: 'verana1gran',
          },
        });
      }
      if (id === '12') {
        return Promise.resolve({
          permission: {
            id: '12', type: 'ECOSYSTEM', did: 'did:web:hr-ecosystem.example.com',
            deposit: '60000000uvna', perm_state: 'ACTIVE', validator_perm_id: null,
            schema_id: '12', grantee: 'verana1eco',
          },
        });
      }
      throw new IndexerError('Not found', 404, 'NOT_FOUND');
    }),
    findBeneficiaries: vi.fn().mockResolvedValue({
      permissions: [
        { id: '275', type: 'VERIFIER', verification_fees: '50uvna' },
        { id: '100', type: 'VERIFIER_GRANTOR', verification_fees: '50uvna' },
        { id: '12', type: 'ECOSYSTEM', verification_fees: '50uvna' },
      ],
    }),
    getBlockHeight: vi.fn().mockResolvedValue({ height: 1500000 }),
    getPermissionSession: vi.fn().mockResolvedValue({
      permission_session: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        authority: 'verana1vrf',
        vs_operator: 'verana1op',
        agent_perm_id: '88',
        created: '2026-02-13T09:58:00Z',
        modified: '2026-02-13T09:58:00Z',
        records: [
          { issuer_perm_id: '0', verifier_perm_id: '275', wallet_agent_perm_id: '88' },
        ],
      },
    }),
    ...overrides,
  } as any;
}

async function buildApp(indexer: any) {
  const app = Fastify();
  await createQ3Route(indexer)(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Parameter validation ---

describe('Q3 /v1/trust/verifier-authorization \u2014 parameter validation', () => {
  it('returns 400 when did is missing', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({ method: 'GET', url: '/v1/trust/verifier-authorization' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "did"/);
  });

  it('returns 400 when did does not start with did:', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=notadid&vtjscId=https://example.com/schema',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when vtjscId is missing', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:test.example.com',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "vtjscId"/);
  });
});

// --- Schema not found ---

describe('Q3 /v1/trust/verifier-authorization \u2014 schema lookup', () => {
  it('returns 404 when schema not found', async () => {
    const idx = mockIndexer({
      listCredentialSchemas: vi.fn().mockResolvedValue({ schemas: [] }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:test.example.com&vtjscId=https://unknown.example.com/schema',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/No CredentialSchema found/);
  });
});

// --- Not authorized ---

describe('Q3 /v1/trust/verifier-authorization \u2014 not authorized', () => {
  it('returns authorized=false when no VERIFIER permission', async () => {
    const idx = mockIndexer({
      listPermissions: vi.fn().mockResolvedValue({ permissions: [] }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:unknown.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toMatch(/No active VERIFIER permission/);
  });
});

// --- Authorized with fees + session ---

describe('Q3 /v1/trust/verifier-authorization \u2014 authorized', () => {
  it('returns authorized=true with permission chain and fees when session provided', async () => {
    const idx = mockIndexer();
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1&sessionId=a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(true);
    expect(body.did).toBe('did:web:employer-portal.example.com');
    expect(body.permission.id).toBe(275);
    expect(body.permission.type).toBe('VERIFIER');
    expect(body.permission.verificationFeeDiscount).toBe('0');
    expect(body.permissionChain).toHaveLength(3);
    expect(body.permissionChain[0].type).toBe('VERIFIER');
    expect(body.permissionChain[1].type).toBe('VERIFIER_GRANTOR');
    expect(body.permissionChain[2].type).toBe('ECOSYSTEM');
    expect(body.fees.required).toBe(true);
    expect(body.fees.beneficiaries[0].verificationFees).toBe('50uvna');
    expect(body.session.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(body.session.paid).toBe(true);
    expect(body.session.verifierPermId).toBe(275);
    expect(res.headers['x-evaluated-at-block']).toBe('1500000');
  });

  it('returns HTTP 402 when fees required but no sessionId', async () => {
    const idx = mockIndexer();
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1',
    });
    expect(res.statusCode).toBe(402);
    const body = res.json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toMatch(/Payment required/);
    expect(body.reason).toMatch(/Verification fees/);
    expect(body.fees.required).toBe(true);
    expect(body.fees.beneficiaries).toHaveLength(3);
  });

  it('returns authorized=true with no fees when discount is 1', async () => {
    const idx = mockIndexer({
      listPermissions: vi.fn().mockResolvedValue({
        permissions: [
          {
            id: '275', schema_id: '12', type: 'VERIFIER',
            grantee: 'verana1vrf', did: 'did:web:employer-portal.example.com',
            created: '2025-04-01T00:00:00Z', modified: '2025-04-01T00:00:00Z',
            effective: '2025-04-01T00:00:00Z', expiration: '2027-04-01T00:00:00Z',
            effective_until: '2027-04-01T00:00:00Z',
            revoked: null, slashed: null, repaid: null,
            deposit: '2000000uvna', country: 'EU',
            vp_state: 'VALIDATED', perm_state: 'ACTIVE',
            validator_perm_id: '100',
            verification_fees: '50uvna',
            verification_fee_discount: '1',
            issued: 0, verified: 0,
            ecosystem_slash_events: 0, ecosystem_slashed_amount: '0',
            network_slash_events: 0, network_slashed_amount: '0',
          },
        ],
      }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(true);
    expect(body.fees.required).toBe(false);
    expect(body.permission.verificationFeeDiscount).toBe('1');
  });
});

// --- Session not found ---

describe('Q3 /v1/trust/verifier-authorization \u2014 session errors', () => {
  it('returns 400 when sessionId not found', async () => {
    const idx = mockIndexer({
      getPermissionSession: vi.fn().mockRejectedValue(
        new IndexerError('Not found', 404, 'NOT_FOUND'),
      ),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1&sessionId=nonexistent',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/PermissionSession not found/);
  });
});

// --- findBeneficiaries uses verifier_perm_id ---

describe('Q3 /v1/trust/verifier-authorization \u2014 fee computation', () => {
  it('calls findBeneficiaries with verifier_perm_id (second arg)', async () => {
    const idx = mockIndexer();
    const app = await buildApp(idx);
    await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1&sessionId=a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    // findBeneficiaries should be called with ('0', verifierPermId, atBlock)
    expect(idx.findBeneficiaries).toHaveBeenCalledWith('0', '275', undefined);
  });
});
