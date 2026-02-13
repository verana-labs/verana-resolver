import { describe, it, expect } from 'vitest';
import { computeDigestSRISync } from '../src/ssi/digest.js';

describe('digestSRI computation', () => {
  it('computes sha256 digest with sri prefix', () => {
    const canonical = '{"hello":"world"}';
    const result = computeDigestSRISync(canonical);
    expect(result).toMatch(/^sha256-/);
    expect(result.length).toBeGreaterThan(10);
  });

  it('produces consistent results for same input', () => {
    const canonical = '{"a":"b","c":"d"}';
    const r1 = computeDigestSRISync(canonical);
    const r2 = computeDigestSRISync(canonical);
    expect(r1).toBe(r2);
  });

  it('produces different results for different input', () => {
    const r1 = computeDigestSRISync('{"a":"1"}');
    const r2 = computeDigestSRISync('{"a":"2"}');
    expect(r1).not.toBe(r2);
  });

  it('produces valid base64 after prefix', () => {
    const result = computeDigestSRISync('{"test":true}');
    const base64Part = result.replace('sha256-', '');
    expect(() => Buffer.from(base64Part, 'base64')).not.toThrow();
    expect(Buffer.from(base64Part, 'base64').length).toBe(32);
  });
});
