import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createQ4Route } from '../src/routes/q4-ecosystem-participant.js';

function mockIndexer(overrides: Record<string, unknown> = {}) {
  return {
    listTrustRegistries: vi.fn().mockResolvedValue({
      trust_registries: [
        {
          id: '3',
          did: 'did:web:insurance-trust.example.com',
          controller: 'verana1eco',
          created: '2024-01-01T00:00:00Z',
          modified: '2024-06-01T00:00:00Z',
          archived: null,
          deposit: '60000000uvna',
          aka: 'Global Insurance Trust Network',
          language: 'en',
          active_version: 1,
          participants: 5,
          active_schemas: 2,
          archived_schemas: 0,
          weight: '100',
          issued: 0,
          verified: 0,
          ecosystem_slash_events: 0,
          ecosystem_slashed_amount: '0',
          ecosystem_slashed_amount_repaid: '0',
          network_slash_events: 0,
          network_slashed_amount: '0',
          network_slashed_amount_repaid: '0',
          versions: [],
        },
      ],
    }),
    listCredentialSchemas: vi.fn().mockResolvedValue({
      schemas: [
        {
          id: '7',
          tr_id: '3',
          title: 'ECS Service',
          description: 'ECS Service credential schema',
          json_schema: 'https://credentials.insurance-trust.example.com/schemas/ecs-service/v1',
          created: '2024-01-01T00:00:00Z',
          modified: '2024-01-01T00:00:00Z',
          archived: null,
        },
        {
          id: '8',
          tr_id: '3',
          title: 'Regulated Insurer',
          description: 'Regulated Insurer credential schema',
          json_schema: 'https://credentials.insurance-trust.example.com/schemas/regulated-insurer/v1',
          created: '2024-01-01T00:00:00Z',
          modified: '2024-01-01T00:00:00Z',
          archived: null,
        },
      ],
    }),
    listPermissions: vi.fn().mockImplementation((params: { schema_id?: string }) => {
      if (params.schema_id === '7') {
        return Promise.resolve({
          permissions: [
            {
              id: '142',
              schema_id: '7',
              type: 'ISSUER',
              grantee: 'verana1abc',
              did: 'did:web:ca-doi.gov.example.com',
              effective: '2025-01-01T00:00:00Z',
              expiration: '2027-01-01T00:00:00Z',
              effective_until: '2027-01-01T00:00:00Z',
              deposit: '5000000uvna',
              perm_state: 'ACTIVE',
              validator_perm_id: '50',
            },
            {
              id: '50',
              schema_id: '7',
              type: 'ISSUER_GRANTOR',
              grantee: 'verana1abc',
              did: 'did:web:ca-doi.gov.example.com',
              effective: '2024-06-01T00:00:00Z',
              expiration: '2028-06-01T00:00:00Z',
              effective_until: '2028-06-01T00:00:00Z',
              deposit: '20000000uvna',
              perm_state: 'ACTIVE',
              validator_perm_id: '3',
            },
          ],
        });
      }
      if (params.schema_id === '8') {
        return Promise.resolve({
          permissions: [
            {
              id: '143',
              schema_id: '8',
              type: 'ISSUER',
              grantee: 'verana1abc',
              did: 'did:web:ca-doi.gov.example.com',
              effective: '2025-01-01T00:00:00Z',
              expiration: '2027-01-01T00:00:00Z',
              effective_until: '2027-01-01T00:00:00Z',
              deposit: '5000000uvna',
              perm_state: 'ACTIVE',
              validator_perm_id: '50',
            },
          ],
        });
      }
      return Promise.resolve({ permissions: [] });
    }),
    getBlockHeight: vi.fn().mockResolvedValue({ height: 1500000 }),
    ...overrides,
  } as any;
}

async function buildApp(indexer: any) {
  const app = Fastify();
  await createQ4Route(indexer)(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Parameter validation ---

describe('Q4 /v1/trust/ecosystem-participant \u2014 parameter validation', () => {
  it('returns 400 when did is missing', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({ method: 'GET', url: '/v1/trust/ecosystem-participant' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "did"/);
  });

  it('returns 400 when did does not start with did:', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=notadid&ecosystemDid=did:web:eco.example.com',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when ecosystemDid is missing', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=did:web:test.example.com',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "ecosystemDid"/);
  });

  it('returns 400 when ecosystemDid does not start with did:', async () => {
    const app = await buildApp(mockIndexer());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=did:web:test.example.com&ecosystemDid=notadid',
    });
    expect(res.statusCode).toBe(400);
  });
});

// --- Ecosystem not found ---

describe('Q4 /v1/trust/ecosystem-participant \u2014 ecosystem lookup', () => {
  it('returns 404 when ecosystem DID not found', async () => {
    const idx = mockIndexer({
      listTrustRegistries: vi.fn().mockResolvedValue({ trust_registries: [] }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=did:web:test.example.com&ecosystemDid=did:web:unknown-eco.example.com',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/No Trust Registry found/);
  });
});

// --- Participant with multiple roles ---

describe('Q4 /v1/trust/ecosystem-participant \u2014 participant', () => {
  it('returns isParticipant=true with all active permissions across schemas', async () => {
    const idx = mockIndexer();
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=did:web:ca-doi.gov.example.com&ecosystemDid=did:web:insurance-trust.example.com',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.did).toBe('did:web:ca-doi.gov.example.com');
    expect(body.ecosystemDid).toBe('did:web:insurance-trust.example.com');
    expect(body.ecosystemAka).toBe('Global Insurance Trust Network');
    expect(body.isParticipant).toBe(true);
    expect(body.permissions).toHaveLength(3);
    expect(body.permissions[0].permissionId).toBe(142);
    expect(body.permissions[0].type).toBe('ISSUER');
    expect(body.permissions[0].vtjscId).toBe('https://credentials.insurance-trust.example.com/schemas/ecs-service/v1');
    expect(body.permissions[1].permissionId).toBe(50);
    expect(body.permissions[1].type).toBe('ISSUER_GRANTOR');
    expect(body.permissions[2].permissionId).toBe(143);
    expect(body.permissions[2].type).toBe('ISSUER');
    expect(body.permissions[2].schemaId).toBe(8);
    expect(res.headers['x-evaluated-at-block']).toBe('1500000');
  });

  it('calls listPermissions once per schema with did filter', async () => {
    const idx = mockIndexer();
    const app = await buildApp(idx);
    await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=did:web:ca-doi.gov.example.com&ecosystemDid=did:web:insurance-trust.example.com',
    });
    expect(idx.listPermissions).toHaveBeenCalledTimes(2);
    expect(idx.listPermissions).toHaveBeenCalledWith(
      { did: 'did:web:ca-doi.gov.example.com', schema_id: '7', only_valid: true },
      undefined,
    );
    expect(idx.listPermissions).toHaveBeenCalledWith(
      { did: 'did:web:ca-doi.gov.example.com', schema_id: '8', only_valid: true },
      undefined,
    );
  });
});

// --- Not a participant ---

describe('Q4 /v1/trust/ecosystem-participant \u2014 not a participant', () => {
  it('returns isParticipant=false when DID has no permissions', async () => {
    const idx = mockIndexer({
      listPermissions: vi.fn().mockResolvedValue({ permissions: [] }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=did:web:random-service.example.com&ecosystemDid=did:web:insurance-trust.example.com',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isParticipant).toBe(false);
    expect(body.permissions).toHaveLength(0);
    expect(body.ecosystemAka).toBe('Global Insurance Trust Network');
  });
});

// --- No aka ---

describe('Q4 /v1/trust/ecosystem-participant \u2014 no aka', () => {
  it('omits ecosystemAka when trust registry has no aka', async () => {
    const idx = mockIndexer({
      listTrustRegistries: vi.fn().mockResolvedValue({
        trust_registries: [
          {
            id: '3',
            did: 'did:web:insurance-trust.example.com',
            aka: null,
            controller: 'verana1eco',
            created: '2024-01-01T00:00:00Z',
            archived: null,
            deposit: '60000000uvna',
            versions: [],
          },
        ],
      }),
      listPermissions: vi.fn().mockResolvedValue({ permissions: [] }),
    });
    const app = await buildApp(idx);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/ecosystem-participant?did=did:web:test.example.com&ecosystemDid=did:web:insurance-trust.example.com',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ecosystemAka).toBeUndefined();
  });
});
