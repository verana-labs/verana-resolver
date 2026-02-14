import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createQ2Route } from '../src/routes/q2-issuer-auth.js';
import { IndexerError } from '../src/indexer/errors.js';

function mockIndexer(overrides: Record<string, unknown> = {}) {
  return {
    listCredentialSchemas: vi.fn().mockResolvedValue({
      credential_schemas: [
        { id: '7', json_schema: 'https://example.com/schemas/regulated-insurer/v1', tr_id: '1' },
      ],
    }),
    listPermissions: vi.fn().mockResolvedValue({
      permissions: [
        {
          id: '142',
          schema_id: '7',
          type: 'ISSUER',
          grantee: 'verana1abc',
          did: 'did:web:ca-doi.gov.example.com',
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
          effective: '2025-01-01T00:00:00Z',
          expiration: '2027-01-01T00:00:00Z',
          effective_until: '2027-01-01T00:00:00Z',
          revoked: null,
          slashed: null,
          repaid: null,
          deposit: '5000000uvna',
          country: 'US',
          vp_state: 'VALIDATED',
          perm_state: 'ACTIVE',
          validator_perm_id: '50',
          issuance_fees: '500000uvna',
          issuance_fee_discount: '0',
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
      if (id === '50') {
        return Promise.resolve({
          permission: {
            id: '50', type: 'ISSUER_GRANTOR', did: 'did:web:naic.example.com',
            deposit: '20000000uvna', perm_state: 'ACTIVE', validator_perm_id: '7',
            schema_id: '7', grantee: 'verana1xyz',
          },
        });
      }
      if (id === '7') {
        return Promise.resolve({
          permission: {
            id: '7', type: 'ECOSYSTEM', did: 'did:web:insurance-trust.example.com',
            deposit: '50000000uvna', perm_state: 'ACTIVE', validator_perm_id: null,
            schema_id: '7', grantee: 'verana1eco',
          },
        });
      }
      throw new IndexerError('Not found', 404, 'NOT_FOUND');
    }),
    findBeneficiaries: vi.fn().mockResolvedValue({
      permissions: [
        { id: '142', type: 'ISSUER', issuance_fees: '500000uvna' },
        { id: '50', type: 'ISSUER_GRANTOR', issuance_fees: '500000uvna' },
        { id: '7', type: 'ECOSYSTEM', issuance_fees: '1000000uvna' },
      ],
    }),
    getBlockHeight: vi.fn().mockResolvedValue({ height: 1500000 }),
    getPermissionSession: vi.fn().mockResolvedValue({
      permission_session: {
        id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        authority: 'verana1abc',
        vs_operator: 'verana1op',
        agent_perm_id: '88',
        created: '2026-02-13T09:55:00Z',
        modified: '2026-02-13T09:55:00Z',
        records: [
          { issuer_perm_id: '142', verifier_perm_id: '0', wallet_agent_perm_id: '92' },
        ],
      },
    }),
    ...overrides,
  } as any;
}

async function buildApp(indexer: any) {
  const app = Fastify();
  await createQ2Route(indexer)(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Parameter validation ---

describe('Q2 /v1/trust/issuer-authorization \u2014 parameter validation', () => {
  it('returns 400 when did is missing', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({ method: 'GET', url: '/v1/trust/issuer-authorization' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "did"/);
  });

  it('returns 400 when did does not start with did:', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/issuer-authorization?did=notadid&vtjscId=https://example.com/schema',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when vtjscId is missing', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/issuer-authorization?did=did:web:test.example.com',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "vtjscId"/);
  });
});

// --- Schema not found ---

describe('Q2 /v1/trust/issuer-authorization \u2014 schema lookup', () => {
  it('returns 404 when schema not found', async () => {
    const idx = mockIndexer({
      listCredentialSchemas: vi.fn().mockResolvedValue({ credential_schemas: [] }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/issuer-authorization?did=did:web:test.example.com&vtjscId=https://unknown.example.com/schema',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/No CredentialSchema found/);
  });
});

// --- Not authorized ---

describe('Q2 /v1/trust/issuer-authorization \u2014 not authorized', () => {
  it('returns authorized=false when no ISSUER permission', async () => {
    const idx = mockIndexer({
      listPermissions: vi.fn().mockResolvedValue({ permissions: [] }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/issuer-authorization?did=did:web:unknown.example.com&vtjscId=https://example.com/schemas/regulated-insurer/v1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toMatch(/No active ISSUER permission/);
  });
});

// --- Authorized with fees + session ---

describe('Q2 /v1/trust/issuer-authorization \u2014 authorized', () => {
  it('returns authorized=true with permission chain and fees when session provided', async () => {
    const idx = mockIndexer();
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/issuer-authorization?did=did:web:ca-doi.gov.example.com&vtjscId=https://example.com/schemas/regulated-insurer/v1&sessionId=b2c3d4e5-f6a7-8901-bcde-f12345678901',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(true);
    expect(body.did).toBe('did:web:ca-doi.gov.example.com');
    expect(body.permission.id).toBe(142);
    expect(body.permission.type).toBe('ISSUER');
    expect(body.permissionChain).toHaveLength(3);
    expect(body.permissionChain[0].type).toBe('ISSUER');
    expect(body.permissionChain[1].type).toBe('ISSUER_GRANTOR');
    expect(body.permissionChain[2].type).toBe('ECOSYSTEM');
    expect(body.fees.required).toBe(true);
    expect(body.session.id).toBe('b2c3d4e5-f6a7-8901-bcde-f12345678901');
    expect(body.session.paid).toBe(true);
    expect(res.headers['x-evaluated-at-block']).toBe('1500000');
  });

  it('returns HTTP 402 when fees required but no sessionId', async () => {
    const idx = mockIndexer();
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/issuer-authorization?did=did:web:ca-doi.gov.example.com&vtjscId=https://example.com/schemas/regulated-insurer/v1',
    });
    expect(res.statusCode).toBe(402);
    const body = res.json();
    expect(body.authorized).toBe(false);
    expect(body.reason).toMatch(/Payment required/);
    expect(body.fees.required).toBe(true);
    expect(body.fees.beneficiaries).toHaveLength(3);
  });

  it('returns authorized=true with no fees when discount is 1', async () => {
    const idx = mockIndexer({
      listPermissions: vi.fn().mockResolvedValue({
        permissions: [
          {
            id: '142', schema_id: '7', type: 'ISSUER',
            grantee: 'verana1abc', did: 'did:web:ca-doi.gov.example.com',
            created: '2025-01-01T00:00:00Z', modified: '2025-01-01T00:00:00Z',
            effective: '2025-01-01T00:00:00Z', expiration: '2027-01-01T00:00:00Z',
            effective_until: '2027-01-01T00:00:00Z',
            revoked: null, slashed: null, repaid: null,
            deposit: '5000000uvna', country: 'US',
            vp_state: 'VALIDATED', perm_state: 'ACTIVE',
            validator_perm_id: '50',
            issuance_fees: '500000uvna',
            issuance_fee_discount: '1',
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
      url: '/v1/trust/issuer-authorization?did=did:web:ca-doi.gov.example.com&vtjscId=https://example.com/schemas/regulated-insurer/v1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(true);
    expect(body.fees.required).toBe(false);
  });
});

// --- Session not found ---

describe('Q2 /v1/trust/issuer-authorization \u2014 session errors', () => {
  it('returns 400 when sessionId not found', async () => {
    const idx = mockIndexer({
      getPermissionSession: vi.fn().mockRejectedValue(
        new IndexerError('Not found', 404, 'NOT_FOUND'),
      ),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/issuer-authorization?did=did:web:ca-doi.gov.example.com&vtjscId=https://example.com/schemas/regulated-insurer/v1&sessionId=nonexistent',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/PermissionSession not found/);
  });
});
