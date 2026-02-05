import { IndexerClient } from './client';

jest.mock('../config', () => ({
  config: {
    verifiablePublicRegistries: [
      {
        name: 'test-vpr',
        baseurls: ['http://test-indexer.com'],
        version: '1',
        production: false,
      },
    ],
  },
}));

const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

jest.mock('axios', () => {
  const actualAxios = jest.requireActual('axios');
  return {
    ...actualAxios,
    default: {
      ...actualAxios.default,
      create: jest.fn(() => mockAxiosInstance),
    },
    create: jest.fn(() => mockAxiosInstance),
  };
});

// Mock WebSocket
jest.mock('ws', () => ({
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
    send: jest.fn(),
    readyState: 1,
  })),
}));

describe('IndexerClient', () => {
  let client: IndexerClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new IndexerClient();
  });

  describe('instantiation', () => {
    it('should create a new IndexerClient instance', () => {
      expect(client).toBeInstanceOf(IndexerClient);
    });

    it('should have required public methods', () => {
      expect(typeof client.getBlockHeight).toBe('function');
      expect(typeof client.listChanges).toBe('function');
      expect(typeof client.getAvailableVprs).toBe('function');
      expect(typeof client.connectWebSocket).toBe('function');
      expect(typeof client.disconnectWebSocket).toBe('function');
      expect(typeof client.testConnectivity).toBe('function');
      expect(typeof client.cleanup).toBe('function');
    });
  });

  describe('getAvailableVprs', () => {
    it('should return list of VPR names', () => {
      const vprs = client.getAvailableVprs();
      expect(Array.isArray(vprs)).toBe(true);
      expect(vprs).toContain('test-vpr');
    });
  });
});

