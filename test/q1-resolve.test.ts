import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerQ1Route } from '../src/routes/q1-resolve.js';

// Mock the trust-store module
vi.mock('../src/trust/trust-store.js', () => ({
  getSummaryTrustResult: vi.fn(),
  getFullTrustResult: vi.fn(),
}));

import { getSummaryTrustResult, getFullTrustResult } from '../src/trust/trust-store.js';

const mockGetSummary = vi.mocked(getSummaryTrustResult);
const mockGetFull = vi.mocked(getFullTrustResult);

async function buildApp() {
  const app = Fastify();
  await registerQ1Route(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Parameter validation ---

describe('Q1 /v1/trust/resolve — parameter validation', () => {
  it('returns 400 when did is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/trust/resolve' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "did"/);
  });

  it('returns 400 when did does not start with did:', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/trust/resolve?did=notadid' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when detail is invalid', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:example.com&detail=invalid',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Invalid "detail"/);
  });
});

// --- Summary mode ---

describe('Q1 /v1/trust/resolve — summary mode', () => {
  it('returns 404 when DID not found', async () => {
    mockGetSummary.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:unknown.example.com',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/No trust evaluation found/);
  });

  it('returns summary result with correct headers', async () => {
    mockGetSummary.mockResolvedValue({
      did: 'did:web:acme.example.com',
      trustStatus: 'TRUSTED',
      production: true,
      evaluatedAt: '2026-02-13T10:00:00.000Z',
      evaluatedAtBlock: 1500000,
      expiresAt: '2026-02-14T10:00:00.000Z',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:acme.example.com',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.did).toBe('did:web:acme.example.com');
    expect(body.trustStatus).toBe('TRUSTED');
    expect(body.production).toBe(true);
    expect(body.evaluatedAtBlock).toBe(1500000);
    expect(res.headers['x-evaluated-at-block']).toBe('1500000');
    expect(res.headers['x-cache-hit']).toBe('true');
  });

  it('defaults to summary when detail is not specified', async () => {
    mockGetSummary.mockResolvedValue({
      did: 'did:web:test.example.com',
      trustStatus: 'UNTRUSTED',
      production: false,
      evaluatedAt: '2026-02-13T10:00:00.000Z',
      evaluatedAtBlock: 100,
      expiresAt: '2026-02-14T10:00:00.000Z',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:test.example.com',
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetSummary).toHaveBeenCalledWith('did:web:test.example.com');
    expect(mockGetFull).not.toHaveBeenCalled();
  });

  it('calls getSummaryTrustResult for detail=summary', async () => {
    mockGetSummary.mockResolvedValue({
      did: 'did:web:test.example.com',
      trustStatus: 'PARTIAL',
      production: false,
      evaluatedAt: '2026-02-13T10:00:00.000Z',
      evaluatedAtBlock: 200,
      expiresAt: '2026-02-14T10:00:00.000Z',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:test.example.com&detail=summary',
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetSummary).toHaveBeenCalledWith('did:web:test.example.com');
  });
});

// --- Full mode ---

describe('Q1 /v1/trust/resolve — full mode', () => {
  it('returns 404 when DID not found in full mode', async () => {
    mockGetFull.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:unknown.example.com&detail=full',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns full result with credentials and headers', async () => {
    mockGetFull.mockResolvedValue({
      did: 'did:web:acme.example.com',
      trustStatus: 'TRUSTED',
      production: true,
      evaluatedAt: '2026-02-13T10:00:00.000Z',
      evaluatedAtBlock: 1500000,
      expiresAt: '2026-02-14T10:00:00.000Z',
      credentials: [
        {
          result: 'VALID',
          ecsType: 'ECS-SERVICE',
          presentedBy: 'did:web:acme.example.com',
          issuedBy: 'did:web:acme.example.com',
          id: 'urn:uuid:test',
          type: 'VerifiableTrustCredential',
          format: 'W3C_VTC',
          claims: { name: 'Acme Insurance Portal' },
          permissionChain: [
            {
              permissionId: 142,
              type: 'ISSUER',
              did: 'did:web:acme.example.com',
              didIsTrustedVS: true,
              deposit: '5000000uvna',
              permState: 'ACTIVE',
            },
          ],
        },
      ],
      failedCredentials: [],
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:acme.example.com&detail=full',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.credentials).toHaveLength(1);
    expect(body.credentials[0].ecsType).toBe('ECS-SERVICE');
    expect(body.credentials[0].claims.name).toBe('Acme Insurance Portal');
    expect(body.credentials[0].permissionChain).toHaveLength(1);
    expect(res.headers['x-evaluated-at-block']).toBe('1500000');
    expect(res.headers['x-cache-hit']).toBe('true');
  });

  it('calls getFullTrustResult for detail=full', async () => {
    mockGetFull.mockResolvedValue({
      did: 'did:web:test.example.com',
      trustStatus: 'UNTRUSTED',
      production: false,
      evaluatedAt: '2026-02-13T10:00:00.000Z',
      evaluatedAtBlock: 300,
      expiresAt: '2026-02-14T10:00:00.000Z',
      credentials: [],
      failedCredentials: [],
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/resolve?did=did:web:test.example.com&detail=full',
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetFull).toHaveBeenCalledWith('did:web:test.example.com');
    expect(mockGetSummary).not.toHaveBeenCalled();
  });
});
