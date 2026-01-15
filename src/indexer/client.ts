import axios, { type AxiosInstance } from 'axios';
import WebSocket from 'ws';

import { config } from '../config';

type NodeJSTimeout = NodeJS.Timeout;

export interface BlockHeightResponse {
  type?: string;
  job_name?: string;
  height: number;
  updated_at?: string;
  timestamp?: string;
}

export interface BlockProcessedEvent {
  type: 'block-processed';
  height: number;
  timestamp: string;
}

export interface WebSocketConnectedEvent {
  type: 'connected';
  message: string;
}

export type WebSocketEvent = BlockProcessedEvent | WebSocketConnectedEvent;

export interface BlockChangesResponse {
  block_height: number;
  changes: any[];
}

export interface ConnectivityTestResult {
  connected: boolean;
  blockHeightAvailable: boolean;
  webSocketAvailable: boolean;
  errors: string[];
}

export class IndexerClient {
  private readonly httpClients = new Map<string, AxiosInstance>();
  private readonly wsClients = new Map<string, WebSocket>();
  private readonly reconnectTimeouts = new Map<string, NodeJSTimeout>();

  constructor() {
    this.initializeHttpClients();
  }

  private initializeHttpClients(): void {
    for (const vpr of config.verifiablePublicRegistries) {
      for (const baseUrl of vpr.baseurls) {
        const client = axios.create({
          baseURL: baseUrl,
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Verana-Trust-Resolver/0.1.0',
          },
        });

        this.httpClients.set(`${vpr.name}:${baseUrl}`, client);
      }
    }
  }

  private getHttpClient(vprName: string): AxiosInstance {
    for (const [key, client] of this.httpClients) {
      if (key.startsWith(`${vprName}:`)) {
        return client;
      }
    }
    throw new Error(`No HTTP client configured for VPR: ${vprName}`);
  }

  private getBaseUrl(vprName: string): string {
    for (const vpr of config.verifiablePublicRegistries) {
      if (vpr.name === vprName) {
        const baseUrl = vpr.baseurls[0];
        if (!baseUrl) {
          throw new Error(`No base URL configured for VPR: ${vprName}`);
        }
        return baseUrl;
      }
    }
    throw new Error(`No base URL configured for VPR: ${vprName}`);
  }

  async getBlockHeight(vprName: string): Promise<BlockHeightResponse> {
    const client = this.getHttpClient(vprName);

    try {
      console.log(`Fetching block height for ${vprName}`);
      const response = await client.get('/verana/indexer/v1/block-height');

      console.log('Raw block height response:', JSON.stringify(response.data, null, 2));

      if (!this.isValidBlockHeightResponse(response.data)) {
        console.error('Invalid response format. Expected: {job_name, height, updated_at}');
        console.error('   Received:', response.data);
        throw new Error('Invalid block height response format');
      }

      console.log(`Block height: ${response.data.height} (${response.data.updated_at})`);
      return response.data;
    } catch (error: any) {
      const statusCode = error?.response?.status;
      console.error(`Block height fetch failed for ${vprName}: ${statusCode || error.message}`);
      throw new Error(`Block height fetch failed: ${error.message}`);
    }
  }

  async listChanges(vprName: string, blockHeight: number): Promise<BlockChangesResponse> {
    const client = this.getHttpClient(vprName);

    try {
      console.log(`Fetching changes for block ${blockHeight} from ${vprName}`);
      const response = await client.get(`/verana/indexer/v1/changes/${blockHeight}`);

      if (!this.isValidBlockChangesResponse(response.data)) {
        throw new Error('Invalid block changes response format');
      }

      console.log(`Changes for block ${blockHeight}: ${response.data.changes.length} changes`);
      return response.data;
    } catch (error: any) {
      const statusCode = error?.response?.status;
      console.error(`Block changes fetch failed for ${vprName} block ${blockHeight}: ${statusCode || error.message}`);
      throw new Error(`Block changes fetch failed: ${error.message}`);
    }
  }

  private isValidBlockHeightResponse(data: any): data is BlockHeightResponse {
    if (data.job_name && data.updated_at) {
      return (
        typeof data.job_name === 'string' &&
        typeof data.height === 'number' &&
        data.height >= 0 &&
        typeof data.updated_at === 'string'
      );
    }

    if (data.type || data.timestamp) {
      return (
        typeof data.height === 'number' &&
        data.height >= 0 &&
        (!data.timestamp || typeof data.timestamp === 'string')
      );
    }

    return typeof data.height === 'number' && data.height >= 0;
  }

  private isValidBlockChangesResponse(data: any): data is BlockChangesResponse {
    return (
      data &&
      typeof data.block_height === 'number' &&
      data.block_height >= 0 &&
      Array.isArray(data.changes)
    );
  }

  connectWebSocket(
    vprName: string,
    onBlockProcessed: (event: BlockProcessedEvent) => void,
  ): WebSocket | null {
    try {
      this.disconnectWebSocket(vprName);

      const baseUrl = this.getBaseUrl(vprName);
      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/verana/indexer/v1/events`;

      console.log(`Connecting to WebSocket: ${wsUrl}`);

      const ws = new WebSocket(wsUrl);
      let reconnectAttempts = 0;
      const maxReconnectAttempts = 5;

      ws.on('open', () => {
        console.log(`WebSocket connected for ${vprName}`);
        reconnectAttempts = 0;
      });

      ws.on('message', (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          console.log('Raw WebSocket message received:', JSON.stringify(event, null, 2));

          if (this.isValidBlockProcessedEvent(event)) {
            console.log(`Block ${event.height} processed at ${event.timestamp}`);
            onBlockProcessed(event);
          } else if (this.isValidWebSocketConnectedEvent(event)) {
            console.log(`WebSocket connected: ${event.message}`);
          } else {
            console.warn('Unknown WebSocket event format - checking fields:');
            console.warn(`   - type: ${event.type} (expected: 'block-processed' or 'connected')`);
            console.warn('Full event object:', event);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          console.error('Raw message data:', data.toString());
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${vprName}:`, error.message);
      });

      ws.on('close', (code, _reason) => {
        console.log(`WebSocket closed for ${vprName} (code: ${code})`);

        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`Reconnecting WebSocket for ${vprName} in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);

          const timeout = setTimeout(() => {
            reconnectAttempts++;
            this.connectWebSocket(vprName, onBlockProcessed);
          }, delay);

          this.reconnectTimeouts.set(vprName, timeout);
        } else {
          console.error(`WebSocket reconnection failed after ${maxReconnectAttempts} attempts for ${vprName}`);
        }
      });

      this.wsClients.set(vprName, ws);
      return ws;

    } catch (error) {
      console.error(`Failed to create WebSocket connection for ${vprName}:`, error);
      return null;
    }
  }

  private isValidBlockProcessedEvent(event: any): event is BlockProcessedEvent {
    return (
      event &&
      event.type === 'block-processed' &&
      typeof event.height === 'number' &&
      event.height >= 0 &&
      typeof event.timestamp === 'string'
    );
  }

  private isValidWebSocketConnectedEvent(event: any): event is WebSocketConnectedEvent {
    return (
      event &&
      event.type === 'connected' &&
      typeof event.message === 'string'
    );
  }

  disconnectWebSocket(vprName: string): void {
    const timeout = this.reconnectTimeouts.get(vprName);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(vprName);
    }

    const ws = this.wsClients.get(vprName);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Client disconnect');
      console.log(`WebSocket disconnected for ${vprName}`);
    }

    this.wsClients.delete(vprName);
  }

  getAvailableVprs(): string[] {
    return config.verifiablePublicRegistries.map(vpr => vpr.name);
  }

  async testConnectivity(vprName: string): Promise<ConnectivityTestResult> {
    const client = this.getHttpClient(vprName);
    const result: ConnectivityTestResult = {
      connected: false,
      blockHeightAvailable: false,
      webSocketAvailable: false,
      errors: [],
    };

    console.log(`Testing indexer connectivity for ${vprName}`);

    try {
      const response = await client.get('/');
      result.connected = response.status === 200;
      console.log(`HTTP connectivity: ${result.connected ? 'OK' : 'FAILED'}`);
    } catch (error: any) {
      result.errors.push(`HTTP connectivity failed: ${error.message}`);
      console.log('HTTP connectivity: FAILED');
      return result;
    }

    try {
      const response = await client.get('/verana/indexer/v1/block-height');
      result.blockHeightAvailable =
        response.status === 200 && this.isValidBlockHeightResponse(response.data);
      console.log(`Block-height endpoint: ${result.blockHeightAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);
    } catch (error: any) {
      result.errors.push(`Block-height endpoint failed: ${error.message}`);
      console.log('Block-height endpoint: UNAVAILABLE');
    }

    try {
      const wsTest = this.connectWebSocket(vprName, () => {});
      if (wsTest) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            resolve();
          }, 3000);

          wsTest.once('open', () => {
            clearTimeout(timeout);
            resolve();
          });

          wsTest.once('error', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        result.webSocketAvailable = wsTest.readyState === WebSocket.OPEN;
        this.disconnectWebSocket(vprName);
        console.log(`WebSocket: ${result.webSocketAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);
      } else {
        console.log('WebSocket: CONNECTION FAILED');
      }
    } catch (error: any) {
      result.errors.push(`WebSocket test failed: ${error.message}`);
      console.log('WebSocket: ERROR');
    }

    const status = result.connected && result.blockHeightAvailable;
    console.log(`Connectivity test: ${status ? 'PASS' : 'FAIL'}`);

    return result;
  }

  cleanup(): void {
    console.log('Cleaning up indexer client connections...');

    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();

    for (const vprName of this.wsClients.keys()) {
      this.disconnectWebSocket(vprName);
    }

    console.log('Indexer client cleanup complete');
  }
}

