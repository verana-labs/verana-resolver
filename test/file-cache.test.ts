import { describe, it, expect } from 'vitest';
import { objectKey, stateKey } from '../src/cache/file-cache.js';

describe('cache key formatting', () => {
  it('formats object keys with prefix', () => {
    expect(objectKey('did:web:example.com')).toBe('resolver:obj:did:web:example.com');
    expect(objectKey('https://example.com/vp/1')).toBe(
      'resolver:obj:https://example.com/vp/1',
    );
  });

  it('formats state keys with prefix', () => {
    expect(stateKey('lastBlock')).toBe('resolver:state:lastBlock');
  });
});

describe('file cache operations (no Redis)', () => {
  it('getCachedFile returns null when Redis is not connected', async () => {
    const { getCachedFile } = await import('../src/cache/file-cache.js');
    const result = await getCachedFile('did:web:example.com');
    expect(result).toBeNull();
  });

  it('setCachedFile does not throw when Redis is not connected', async () => {
    const { setCachedFile } = await import('../src/cache/file-cache.js');
    await expect(setCachedFile('did:web:example.com', '{}')).resolves.toBeUndefined();
  });

  it('deleteCachedFile does not throw when Redis is not connected', async () => {
    const { deleteCachedFile } = await import('../src/cache/file-cache.js');
    await expect(deleteCachedFile('did:web:example.com')).resolves.toBeUndefined();
  });

  it('setCachedFilesBatch does not throw when Redis is not connected', async () => {
    const { setCachedFilesBatch } = await import('../src/cache/file-cache.js');
    await expect(
      setCachedFilesBatch([
        { urlOrDid: 'did:web:a.com', content: '{}' },
        { urlOrDid: 'did:web:b.com', content: '{}' },
      ]),
    ).resolves.toBeUndefined();
  });

  it('getState returns null when Redis is not connected', async () => {
    const { getState } = await import('../src/cache/file-cache.js');
    const result = await getState('lastBlock');
    expect(result).toBeNull();
  });
});
