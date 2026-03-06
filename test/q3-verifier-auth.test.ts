import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createQ3Route } from '../src/routes/q3-verifier-auth.js';

vi.mock('@verana-labs/verre', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@verana-labs/verre')>();
  return {
    ...actual,
    verifyPermissions: vi.fn().mockResolvedValue({ verified: true }),
  };
});

vi.mock('../src/polling/resolver-state.js', () => ({
  getLastProcessedBlock: vi.fn().mockResolvedValue(1500000),
}));

import { verifyPermissions } from '@verana-labs/verre';

const TEST_REGISTRIES = [{ id: 'reg1', baseUrls: ['https://registry.example.com'], production: true }];

async function buildApp() {
  const app = Fastify();
  await createQ3Route(TEST_REGISTRIES)(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyPermissions).mockResolvedValue({ verified: true });
});

// --- Parameter validation ---

describe('Q3 /v1/trust/verifier-authorization — parameter validation', () => {
  it('returns 400 when did is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/trust/verifier-authorization' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "did"/);
  });

  it('returns 400 when did does not start with did:', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=notadid&vtjscId=https://example.com/schema',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when vtjscId is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:test.example.com',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Missing or invalid "vtjscId"/);
  });
});

// --- Not authorized ---

describe('Q3 /v1/trust/verifier-authorization — not authorized', () => {
  it('returns authorized=false when no VERIFIER permission', async () => {
    vi.mocked(verifyPermissions).mockResolvedValue({ verified: false });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:unknown.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(false);
  });
});

// --- Authorized with fees + session ---

describe('Q3 /v1/trust/verifier-authorization — authorized', () => {
  it('returns authorized=true with permission chain and fees when session provided', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1&sessionId=a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(true);
    expect(body.did).toBe('did:web:employer-portal.example.com');
    expect(body.permission).toEqual(expect.any(Object));
    expect(body.permissionChain).toEqual(expect.any(Object));
    expect(body.fees).toEqual(expect.any(Object));
    expect(res.headers['x-evaluated-at-block']).toBe('1500000');
  });

  it('returns authorized=true when no sessionId (fees not enforced)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(true);
    expect(body.fees).toEqual(expect.any(Object));
  });

  it('returns authorized=true with fees', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorized).toBe(true);
    expect(body.fees).toEqual(expect.any(Object));
  });
});

// --- Session errors ---

describe('Q3 /v1/trust/verifier-authorization — session errors', () => {
  it('sessionId is accepted but ignored, returns result from verifyPermissions', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1&sessionId=nonexistent',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().authorized).toBe(true);
  });
});

// --- fee computation ---

describe('Q3 /v1/trust/verifier-authorization — fee computation', () => {
  it('returns fees object in response', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/trust/verifier-authorization?did=did:web:employer-portal.example.com&vtjscId=https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1&sessionId=a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().fees).toEqual(expect.any(Object));
  });
});
