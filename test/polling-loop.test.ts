import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAffectedDids } from '../src/polling/pass1.js';
import type { ActivityItem } from '../src/indexer/types.js';

// --- extractAffectedDids ---

describe('extractAffectedDids', () => {
  it('returns empty set for empty activity', () => {
    expect(extractAffectedDids([]).size).toBe(0);
  });

  it('extracts DID from permission change (new did)', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'permission',
      entity_id: '1',
      account: 'verana1abc',
      msg: 'MsgCreatePermission',
      changes: {
        did: { old: null, new: 'did:web:acme.example.com' },
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:acme.example.com')).toBe(true);
  });

  it('extracts DID from permission change (old did \u2014 revoked)', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'permission',
      entity_id: '1',
      account: 'verana1abc',
      msg: 'MsgRevokePermission',
      changes: {
        did: { old: 'did:web:old.example.com', new: null },
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:old.example.com')).toBe(true);
  });

  it('extracts DID from grantee field in permission', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'permission',
      entity_id: '2',
      account: 'verana1xyz',
      msg: 'MsgGrantPermission',
      changes: {
        grantee: { old: null, new: 'did:web:grantee.example.com' },
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:grantee.example.com')).toBe(true);
  });

  it('extracts DID from trust_registry change', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'trust_registry',
      entity_id: '5',
      account: 'verana1abc',
      msg: 'MsgCreateTrustRegistry',
      changes: {
        did: { old: null, new: 'did:web:ecosystem.example.com' },
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:ecosystem.example.com')).toBe(true);
  });

  it('extracts DID from account field if it starts with did:', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'credential_schema',
      entity_id: '10',
      account: 'did:web:issuer.example.com',
      msg: 'MsgCreateCredentialSchema',
      changes: {},
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:issuer.example.com')).toBe(true);
  });

  it('deduplicates DIDs across multiple activity items', () => {
    const activity: ActivityItem[] = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'permission',
        entity_id: '1',
        account: 'verana1abc',
        msg: 'MsgCreatePermission',
        changes: { did: { old: null, new: 'did:web:acme.example.com' } },
      },
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'permission',
        entity_id: '2',
        account: 'verana1def',
        msg: 'MsgCreatePermission',
        changes: { did: { old: null, new: 'did:web:acme.example.com' } },
      },
    ];
    const dids = extractAffectedDids(activity);
    expect(dids.size).toBe(1);
    expect(dids.has('did:web:acme.example.com')).toBe(true);
  });

  it('ignores non-DID accounts', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'permission',
      entity_id: '1',
      account: 'verana1abc123',
      msg: 'MsgCreatePermission',
      changes: {},
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.size).toBe(0);
  });

  it('handles mixed activity types', () => {
    const activity: ActivityItem[] = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'permission',
        entity_id: '1',
        account: 'verana1abc',
        msg: 'MsgCreatePermission',
        changes: { did: { old: null, new: 'did:web:a.example.com' } },
      },
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'trust_registry',
        entity_id: '5',
        account: 'verana1xyz',
        msg: 'MsgCreateTrustRegistry',
        changes: { did: { old: null, new: 'did:web:eco.example.com' } },
      },
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'credential_schema',
        entity_id: '10',
        account: 'did:web:b.example.com',
        msg: 'MsgCreateCredentialSchema',
        changes: {},
      },
    ];
    const dids = extractAffectedDids(activity);
    expect(dids.size).toBe(3);
    expect(dids.has('did:web:a.example.com')).toBe(true);
    expect(dids.has('did:web:eco.example.com')).toBe(true);
    expect(dids.has('did:web:b.example.com')).toBe(true);
  });
});

// --- pollOnce orchestration ---

describe('pollOnce', () => {
  // Mock all dependencies
  vi.mock('../src/polling/indexer-ws.js', () => ({
    IndexerWebSocket: vi.fn().mockImplementation(() => ({
      waitForBlock: vi.fn().mockResolvedValue(false),
      onBlock: vi.fn().mockReturnValue(() => {}),
      close: vi.fn(),
    })),
  }));

  vi.mock('../src/polling/leader.js', () => ({
    tryAcquireLeaderLock: vi.fn().mockResolvedValue(true),
    releaseLeaderLock: vi.fn().mockResolvedValue(undefined),
  }));

  vi.mock('../src/polling/resolver-state.js', () => ({
    getLastProcessedBlock: vi.fn().mockResolvedValue(99),
    setLastProcessedBlock: vi.fn().mockResolvedValue(undefined),
  }));

  vi.mock('../src/polling/reattemptable.js', () => ({
    addReattemptable: vi.fn().mockResolvedValue(undefined),
    getRetryEligible: vi.fn().mockResolvedValue([]),
    removeReattemptable: vi.fn().mockResolvedValue(undefined),
    cleanupExpiredRetries: vi.fn().mockResolvedValue([]),
  }));

  vi.mock('../src/db/index.js', () => ({
    getPool: vi.fn().mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }),
  }));

  vi.mock('../src/ssi/did-resolver.js', () => ({
    resolveDID: vi.fn().mockResolvedValue({ result: null, error: { error: 'mock' } }),
  }));

  vi.mock('../src/ssi/vp-dereferencer.js', () => ({
    dereferenceAllVPs: vi.fn().mockResolvedValue({ vps: [], errors: [] }),
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
      dereferenceErrors: [],
    }),
    createEvaluationContext: vi.fn().mockReturnValue({
      visitedDids: new Set(),
      currentBlock: 100,
      cacheTtlSeconds: 3600,
      trustMemo: new Map(),
      allowedEcosystemDids: new Set(),
    }),
  }));

  vi.mock('../src/trust/trust-store.js', () => ({
    upsertTrustResult: vi.fn().mockResolvedValue(undefined),
    markUntrusted: vi.fn().mockResolvedValue(undefined),
    getSummaryTrustResult: vi.fn(),
    getFullTrustResult: vi.fn(),
  }));

  vi.mock('../src/cache/file-cache.js', () => ({
    deleteCachedFile: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue(null),
    setState: vi.fn().mockResolvedValue(undefined),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes blocks and returns counts', async () => {
    const { pollOnce } = await import('../src/polling/polling-loop.js');
    const { getLastProcessedBlock, setLastProcessedBlock } = await import('../src/polling/resolver-state.js');
    const { cleanupExpiredRetries } = await import('../src/polling/reattemptable.js');

    vi.mocked(getLastProcessedBlock).mockResolvedValue(99);
    vi.mocked(cleanupExpiredRetries).mockResolvedValue([]);

    const mockIndexer = {
      getBlockHeight: vi.fn().mockResolvedValue({ height: 101 }),
      listChanges: vi.fn()
        .mockResolvedValueOnce({
          block_height: 100,
          activity: [{
            timestamp: '2026-01-01T00:00:00Z',
            block_height: '100',
            entity_type: 'permission',
            entity_id: '1',
            account: 'verana1abc',
            msg: 'MsgCreatePermission',
            changes: { did: { old: null, new: 'did:web:test.example.com' } },
          }],
        })
        .mockResolvedValueOnce({
          block_height: 101,
          activity: [],
        }),
      clearMemo: vi.fn(),
    } as any;

    const config = {
      POLL_INTERVAL: 5,
      TRUST_TTL: 3600,
      POLL_OBJECT_CACHING_RETRY_DAYS: 7,
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    } as any;

    const result = await pollOnce(mockIndexer, config);

    expect(result.blocksProcessed).toBe(2);
    expect(result.didsAffected).toBeGreaterThanOrEqual(1);
    expect(setLastProcessedBlock).toHaveBeenCalledWith(101);
  });

  it('returns zero when no new blocks', async () => {
    const { pollOnce } = await import('../src/polling/polling-loop.js');
    const { getLastProcessedBlock } = await import('../src/polling/resolver-state.js');
    const { cleanupExpiredRetries } = await import('../src/polling/reattemptable.js');

    vi.mocked(getLastProcessedBlock).mockResolvedValue(100);
    vi.mocked(cleanupExpiredRetries).mockResolvedValue([]);

    const mockIndexer = {
      getBlockHeight: vi.fn().mockResolvedValue({ height: 100 }),
      listChanges: vi.fn(),
      clearMemo: vi.fn(),
    } as any;

    const config = {
      POLL_INTERVAL: 5,
      TRUST_TTL: 3600,
      POLL_OBJECT_CACHING_RETRY_DAYS: 7,
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    } as any;

    const result = await pollOnce(mockIndexer, config);
    expect(result.blocksProcessed).toBe(0);
    expect(result.didsAffected).toBe(0);
    expect(mockIndexer.listChanges).not.toHaveBeenCalled();
  });
});
