import { createLogger } from '../logger.js';

const logger = createLogger('indexer-ws');

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export interface BlockProcessedEvent {
  type: 'block-processed';
  height: number;
  timestamp: string;
}

/**
 * Derives the WebSocket URL from the Indexer HTTP API URL.
 * http(s)://host:port/... \u2192 ws(s)://host:port/verana/indexer/v1/events
 */
export function deriveWsUrl(indexerApi: string): string {
  const url = new URL(indexerApi);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/verana/indexer/v1/events';
  return url.toString();
}

type BlockListener = (event: BlockProcessedEvent) => void;

/**
 * Persistent WebSocket connection to the Indexer events endpoint.
 * Reconnects automatically with exponential backoff on failures.
 */
export class IndexerWebSocket {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private listeners: Set<BlockListener> = new Set();
  private backoff = INITIAL_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(indexerApi: string, private signal?: AbortSignal) {
    this.wsUrl = deriveWsUrl(indexerApi);
    this.signal?.addEventListener('abort', () => this.close(), { once: true });
    this.connect();
  }

  onBlock(listener: BlockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Returns a promise that resolves when a block-processed event arrives
   * or after `timeoutMs` milliseconds, whichever comes first.
   * Resolves `true` if a block event was received, `false` on timeout.
   */
  waitForBlock(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);

      const cleanup = this.onBlock(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      });

      this.signal?.addEventListener('abort', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          resolve(false);
        }
      }, { once: true });
    });
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }

  private connect(): void {
    if (this.closed) return;

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      logger.info({ url: this.wsUrl }, 'Connected to Indexer WebSocket');
      this.backoff = INITIAL_BACKOFF_MS;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (data.type === 'block-processed' && typeof data.height === 'number') {
          const blockEvent: BlockProcessedEvent = {
            type: 'block-processed',
            height: data.height,
            timestamp: String(data.timestamp ?? ''),
          };
          logger.debug({ height: blockEvent.height }, 'Block-processed event received');
          for (const listener of this.listeners) {
            listener(blockEvent);
          }
        }
      } catch {
        logger.warn('Failed to parse WebSocket message');
      }
    };

    this.ws.onclose = () => {
      if (!this.closed) {
        logger.info('Indexer WebSocket closed \u2014 reconnecting');
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, which triggers reconnect
      logger.warn('Indexer WebSocket error');
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoff);

    logger.info({ backoffMs: this.backoff }, 'Scheduling WebSocket reconnect');
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }
}
