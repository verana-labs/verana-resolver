import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deriveWsUrl, IndexerWebSocket } from '../src/polling/indexer-ws.js';

// --- deriveWsUrl ---

describe('deriveWsUrl', () => {
  it('converts http to ws and appends events path', () => {
    expect(deriveWsUrl('http://localhost:1317')).toBe('ws://localhost:1317/verana/indexer/v1/events');
  });

  it('converts https to wss and appends events path', () => {
    expect(deriveWsUrl('https://idx.testnet.verana.network')).toBe(
      'wss://idx.testnet.verana.network/verana/indexer/v1/events',
    );
  });

  it('strips existing path and replaces with events path', () => {
    expect(deriveWsUrl('http://localhost:1317/verana/indexer/v1')).toBe(
      'ws://localhost:1317/verana/indexer/v1/events',
    );
  });

  it('preserves port', () => {
    const url = deriveWsUrl('http://127.0.0.1:3001');
    expect(url).toBe('ws://127.0.0.1:3001/verana/indexer/v1/events');
  });
});

// --- IndexerWebSocket ---

// Mock the global WebSocket since we're in Node test env without a real server
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 5);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  // Test helper: simulate receiving a message
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Test helper: simulate close
  simulateClose() {
    this.onclose?.();
  }
}

describe('IndexerWebSocket', () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('connects to the derived WebSocket URL', () => {
    const ws = new IndexerWebSocket('http://localhost:1317');
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:1317/verana/indexer/v1/events');
    ws.close();
  });

  it('onBlock listener fires on block-processed message', async () => {
    const ws = new IndexerWebSocket('http://localhost:1317');
    const events: unknown[] = [];
    ws.onBlock((e) => events.push(e));

    // Wait for connection
    await new Promise((r) => setTimeout(r, 10));

    const mock = MockWebSocket.instances[0];
    mock.simulateMessage({ type: 'block-processed', height: 42, timestamp: '2026-01-01T00:00:00Z' });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'block-processed',
      height: 42,
      timestamp: '2026-01-01T00:00:00Z',
    });
    ws.close();
  });

  it('ignores non-block-processed messages', async () => {
    const ws = new IndexerWebSocket('http://localhost:1317');
    const events: unknown[] = [];
    ws.onBlock((e) => events.push(e));

    await new Promise((r) => setTimeout(r, 10));

    const mock = MockWebSocket.instances[0];
    mock.simulateMessage({ type: 'other-event', data: 'hello' });

    expect(events).toHaveLength(0);
    ws.close();
  });

  it('waitForBlock resolves true on block event', async () => {
    const ws = new IndexerWebSocket('http://localhost:1317');
    await new Promise((r) => setTimeout(r, 10));

    const mock = MockWebSocket.instances[0];

    // Fire a block event after 20ms
    setTimeout(() => {
      mock.simulateMessage({ type: 'block-processed', height: 100, timestamp: '2026-01-01T00:00:00Z' });
    }, 20);

    const result = await ws.waitForBlock(5000);
    expect(result).toBe(true);
    ws.close();
  });

  it('waitForBlock resolves false on timeout', async () => {
    const ws = new IndexerWebSocket('http://localhost:1317');
    await new Promise((r) => setTimeout(r, 10));

    const result = await ws.waitForBlock(50);
    expect(result).toBe(false);
    ws.close();
  });

  it('waitForBlock resolves false on abort', async () => {
    const ac = new AbortController();
    const ws = new IndexerWebSocket('http://localhost:1317', ac.signal);
    await new Promise((r) => setTimeout(r, 10));

    setTimeout(() => ac.abort(), 20);

    const result = await ws.waitForBlock(5000);
    expect(result).toBe(false);
    // ws is auto-closed by abort signal
  });

  it('unsubscribe removes listener', async () => {
    const ws = new IndexerWebSocket('http://localhost:1317');
    const events: unknown[] = [];
    const unsub = ws.onBlock((e) => events.push(e));

    await new Promise((r) => setTimeout(r, 10));

    unsub();

    const mock = MockWebSocket.instances[0];
    mock.simulateMessage({ type: 'block-processed', height: 1, timestamp: '' });

    expect(events).toHaveLength(0);
    ws.close();
  });

  it('close() cleans up the WebSocket', () => {
    const ws = new IndexerWebSocket('http://localhost:1317');
    ws.close();
    expect(MockWebSocket.instances[0].closed).toBe(true);
  });

  it('schedules reconnect on close', async () => {
    vi.useFakeTimers();
    const ws = new IndexerWebSocket('http://localhost:1317');

    // Simulate the initial connection opening
    await vi.advanceTimersByTimeAsync(10);
    expect(MockWebSocket.instances.length).toBe(1);

    // Simulate a close event
    MockWebSocket.instances[0].simulateClose();

    // Advance past the initial backoff (1000ms)
    await vi.advanceTimersByTimeAsync(1100);

    // Should have created a second WebSocket instance
    expect(MockWebSocket.instances.length).toBe(2);

    ws.close();
    vi.useRealTimers();
  });
});
