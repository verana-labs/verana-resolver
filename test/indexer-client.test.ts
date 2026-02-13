import { describe, it, expect, beforeEach } from 'vitest';
import { IndexerClient } from '../src/indexer/client.js';
import { IndexerError, isNotFound } from '../src/indexer/errors.js';

describe('IndexerClient', () => {
  let client: IndexerClient;

  beforeEach(() => {
    client = new IndexerClient('http://localhost:3001');
  });

  describe('URL building', () => {
    it('builds simple path URL', () => {
      const url = client.buildUrl('/verana/indexer/v1/block-height');
      expect(url).toBe('http://localhost:3001/verana/indexer/v1/block-height');
    });

    it('builds URL with path parameter', () => {
      const url = client.buildUrl('/verana/tr/v1/get/42');
      expect(url).toBe('http://localhost:3001/verana/tr/v1/get/42');
    });

    it('builds URL with query parameters', () => {
      const url = client.buildUrl('/verana/perm/v1/list', {
        did: 'did:web:example.com',
        type: 'ISSUER',
        only_valid: true,
      });
      expect(url).toContain('did=did%3Aweb%3Aexample.com');
      expect(url).toContain('type=ISSUER');
      expect(url).toContain('only_valid=true');
    });

    it('skips undefined and null params', () => {
      const url = client.buildUrl('/verana/perm/v1/list', {
        did: 'did:web:example.com',
        type: undefined,
        schema_id: null,
      });
      expect(url).toContain('did=');
      expect(url).not.toContain('type=');
      expect(url).not.toContain('schema_id=');
    });

    it('strips trailing slash from base URL', () => {
      const c = new IndexerClient('http://localhost:3001/');
      const url = c.buildUrl('/verana/indexer/v1/block-height');
      expect(url).toBe('http://localhost:3001/verana/indexer/v1/block-height');
    });
  });

  describe('memoization', () => {
    it('clearMemo resets the cache', () => {
      client.clearMemo();
      // No error — just verifies the method exists and runs
    });
  });

  describe('IndexerError', () => {
    it('creates error with all fields', () => {
      const err = new IndexerError('test', 404, 'NOT_FOUND');
      expect(err.message).toBe('test');
      expect(err.statusCode).toBe(404);
      expect(err.errorType).toBe('NOT_FOUND');
      expect(err.name).toBe('IndexerError');
    });

    it('isNotFound returns true for NOT_FOUND errors', () => {
      expect(isNotFound(new IndexerError('x', 404, 'NOT_FOUND'))).toBe(true);
    });

    it('isNotFound returns false for other errors', () => {
      expect(isNotFound(new IndexerError('x', 500, 'SERVER'))).toBe(false);
      expect(isNotFound(new Error('random'))).toBe(false);
      expect(isNotFound(null)).toBe(false);
    });
  });
});
