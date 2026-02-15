import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock all DB/external dependencies ---

vi.mock('../src/db/index.js', () => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
  return {
    getPool: vi.fn().mockReturnValue({
      query: mockQuery,
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
    }),
    query: mockQuery,
  };
});

vi.mock('../src/cache/file-cache.js', () => ({
  deleteCachedFile: vi.fn().mockResolvedValue(undefined),
  getCachedFile: vi.fn().mockResolvedValue(null),
  setCachedFile: vi.fn().mockResolvedValue(undefined),
  getState: vi.fn().mockResolvedValue(null),
  setState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/ssi/did-resolver.js', () => ({
  resolveDID: vi.fn().mockResolvedValue({ result: null, error: { error: 'mock' } }),
}));

vi.mock('../src/ssi/vp-dereferencer.js', () => ({
  dereferenceAllVPs: vi.fn().mockResolvedValue({ vps: [], errors: [] }),
}));

vi.mock('../src/polling/reattemptable.js', () => ({
  addReattemptable: vi.fn().mockResolvedValue(undefined),
  getRetryEligible: vi.fn().mockResolvedValue([]),
  removeReattemptable: vi.fn().mockResolvedValue(undefined),
  cleanupExpiredRetries: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/trust/trust-store.js', () => ({
  upsertTrustResult: vi.fn().mockResolvedValue(undefined),
  markUntrusted: vi.fn().mockResolvedValue(undefined),
  getSummaryTrustResult: vi.fn(),
  getFullTrustResult: vi.fn(),
}));

vi.mock('../src/trust/resolve-trust.js', () => ({
  resolveTrust: vi.fn().mockResolvedValue({
    did: 'did:web:test.example.com',
    trustStatus: 'UNTRUSTED',
    production: false,
    evaluatedAt: new Date().toISOString(),
    evaluatedAtBlock: 100,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    credentials: [],
    failedCredentials: [],
  }),
  createEvaluationContext: vi.fn().mockReturnValue({
    visitedDids: new Set(),
    currentBlock: 100,
    cacheTtlSeconds: 3600,
    trustMemo: new Map(),
    allowedEcosystemDids: new Set(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Error classification in Pass1 ---

describe('Pass1 \u2014 error classification', () => {
  it('marks DID as PERMANENT + UNTRUSTED on notFound error', async () => {
    const { resolveDID } = await import('../src/ssi/did-resolver.js');
    const { markUntrusted } = await import('../src/trust/trust-store.js');
    const { runPass1 } = await import('../src/polling/pass1.js');
    const { addReattemptable } = await import('../src/polling/reattemptable.js');

    vi.mocked(resolveDID).mockResolvedValueOnce({
      result: undefined,
      error: { resource: 'did:web:gone.example.com', resourceType: 'did-document', error: 'notFound', timestamp: Date.now() },
    });

    const result = await runPass1(
      new Set(['did:web:gone.example.com']),
      {} as any,
      500,
      3600,
    );

    expect(result.failed).toContain('did:web:gone.example.com');
    expect(markUntrusted).toHaveBeenCalledWith('did:web:gone.example.com', 500, 3600);
    expect(vi.mocked(addReattemptable)).toHaveBeenCalledWith('did:web:gone.example.com', 'DID_DOC', 'PERMANENT');
  });

  it('marks DID as PERMANENT + UNTRUSTED on invalidDid error', async () => {
    const { resolveDID } = await import('../src/ssi/did-resolver.js');
    const { markUntrusted } = await import('../src/trust/trust-store.js');
    const { runPass1 } = await import('../src/polling/pass1.js');
    const { addReattemptable } = await import('../src/polling/reattemptable.js');

    vi.mocked(resolveDID).mockResolvedValueOnce({
      result: undefined,
      error: { resource: 'did:web:bad.example.com', resourceType: 'did-document', error: 'invalidDid', timestamp: Date.now() },
    });

    const result = await runPass1(
      new Set(['did:web:bad.example.com']),
      {} as any,
      500,
      3600,
    );

    expect(result.failed).toContain('did:web:bad.example.com');
    expect(markUntrusted).toHaveBeenCalledWith('did:web:bad.example.com', 500, 3600);
    expect(vi.mocked(addReattemptable)).toHaveBeenCalledWith('did:web:bad.example.com', 'DID_DOC', 'PERMANENT');
  });

  it('marks DID as PERMANENT + UNTRUSTED on methodNotSupported error', async () => {
    const { resolveDID } = await import('../src/ssi/did-resolver.js');
    const { markUntrusted } = await import('../src/trust/trust-store.js');
    const { runPass1 } = await import('../src/polling/pass1.js');

    vi.mocked(resolveDID).mockResolvedValueOnce({
      result: undefined,
      error: { resource: 'did:xyz:foo', resourceType: 'did-document', error: 'methodNotSupported', timestamp: Date.now() },
    });

    const result = await runPass1(new Set(['did:xyz:foo']), {} as any, 500, 3600);
    expect(result.failed).toContain('did:xyz:foo');
    expect(markUntrusted).toHaveBeenCalledWith('did:xyz:foo', 500, 3600);
  });

  it('marks DID as TRANSIENT on network/5xx error (no markUntrusted)', async () => {
    const { resolveDID } = await import('../src/ssi/did-resolver.js');
    const { markUntrusted } = await import('../src/trust/trust-store.js');
    const { runPass1 } = await import('../src/polling/pass1.js');
    const { addReattemptable } = await import('../src/polling/reattemptable.js');

    vi.mocked(resolveDID).mockResolvedValueOnce({
      result: undefined,
      error: { resource: 'did:web:timeout.example.com', resourceType: 'did-document', error: 'networkTimeout', timestamp: Date.now() },
    });

    const result = await runPass1(
      new Set(['did:web:timeout.example.com']),
      {} as any,
      500,
      3600,
    );

    expect(result.failed).toContain('did:web:timeout.example.com');
    expect(markUntrusted).not.toHaveBeenCalled();
    expect(vi.mocked(addReattemptable)).toHaveBeenCalledWith('did:web:timeout.example.com', 'DID_DOC', 'TRANSIENT');
  });

  it('succeeds when DID resolves correctly', async () => {
    const { resolveDID } = await import('../src/ssi/did-resolver.js');
    const { markUntrusted } = await import('../src/trust/trust-store.js');
    const { runPass1 } = await import('../src/polling/pass1.js');
    const { addReattemptable } = await import('../src/polling/reattemptable.js');

    vi.mocked(resolveDID).mockResolvedValueOnce({
      result: {
        did: 'did:web:ok.example.com',
        didDocument: {},
        cachedAt: Date.now(),
      },
    });

    const result = await runPass1(
      new Set(['did:web:ok.example.com']),
      {} as any,
      500,
      3600,
    );

    expect(result.succeeded).toContain('did:web:ok.example.com');
    expect(result.failed).toHaveLength(0);
    expect(markUntrusted).not.toHaveBeenCalled();
    expect(vi.mocked(addReattemptable)).not.toHaveBeenCalled();
  });
});

// --- Pass2 error handling ---

describe('Pass2 \u2014 error handling', () => {
  it('adds to reattemptable on trust evaluation failure', async () => {
    const { resolveTrust } = await import('../src/trust/resolve-trust.js');
    const { runPass2 } = await import('../src/polling/pass2.js');
    const { addReattemptable } = await import('../src/polling/reattemptable.js');

    vi.mocked(resolveTrust).mockRejectedValueOnce(new Error('evaluation failed'));

    const result = await runPass2(
      new Set(['did:web:evalfail.example.com']),
      {} as any,
      500,
      3600,
      new Set(),
    );

    expect(result.failed).toContain('did:web:evalfail.example.com');
    expect(vi.mocked(addReattemptable)).toHaveBeenCalledWith('did:web:evalfail.example.com', 'TRUST_EVAL', 'TRANSIENT');
  });
});
