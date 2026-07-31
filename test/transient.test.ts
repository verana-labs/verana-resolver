import { describe, it, expect } from 'vitest';
import { isTransientTrustResult } from '../src/polling/verre-pass.js';
import type { TrustResult } from '../src/trust/types.js';

function result(overrides: Partial<TrustResult>): TrustResult {
  return {
    did: 'did:web:service.example',
    trustStatus: 'UNTRUSTED',
    production: false,
    evaluatedAt: new Date(0).toISOString(),
    evaluatedAtBlock: 1,
    expiresAt: new Date(3600 * 1000).toISOString(),
    credentials: [],
    failedCredentials: [],
    dereferenceErrors: [],
    ...overrides,
  };
}

const failed = (error: string) => ({
  id: 'did:web:service.example',
  format: 'N/A',
  error,
  errorCode: 'invalid',
});

describe('isTransientTrustResult', () => {
  it('matches upstream 5xx while dereferencing (the flapping-registry case)', () => {
    expect(
      isTransientTrustResult(
        result({
          failedCredentials: [
            failed(
              'Failed to validate credential: Failed to fetch data from https://ecs-trust-registry.testnet.verana.network/vt/schemas-service-jsc.json: 503 Service Temporarily Unavailable',
            ),
          ],
        }),
      ),
    ).toBe(true);
  });

  it('matches network-level failures', () => {
    for (const error of [
      'request to https://x.example failed, reason: connect ECONNREFUSED 1.2.3.4:443',
      'fetch failed',
      'socket hang up',
      'The operation timed out',
    ]) {
      expect(isTransientTrustResult(result({ failedCredentials: [failed(error)] }))).toBe(true);
    }
  });

  it('matches transient errors on dereferenceErrors too', () => {
    expect(
      isTransientTrustResult(
        result({
          dereferenceErrors: [
            { vpUrl: 'https://x.example/vp.json', error: 'Failed to fetch data from https://x.example/vp.json: 502 Bad Gateway' },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('does NOT match definitive HTTP answers - a removed VP is a real signal', () => {
    for (const error of [
      'Failed to fetch data from https://x.example/vp.json: 404 Not Found',
      'Failed to fetch data from https://x.example/vp.json: 410 Gone',
      'Failed to fetch data from https://x.example/vp.json: 403 Forbidden',
    ]) {
      expect(isTransientTrustResult(result({ failedCredentials: [failed(error)] }))).toBe(false);
    }
  });

  it('does NOT match genuine trust failures', () => {
    expect(
      isTransientTrustResult(
        result({
          failedCredentials: [
            failed(
              'Credential issuance date (2026-07-30T18:28:47.387Z) is not within the permission effective range',
            ),
          ],
        }),
      ),
    ).toBe(false);
  });

  it('never marks a TRUSTED result transient', () => {
    expect(
      isTransientTrustResult(
        result({
          trustStatus: 'TRUSTED',
          failedCredentials: [failed('Failed to fetch data from https://x.example/vp.json: 503')],
        }),
      ),
    ).toBe(false);
  });

  it('is false without any error', () => {
    expect(isTransientTrustResult(result({}))).toBe(false);
  });
});
