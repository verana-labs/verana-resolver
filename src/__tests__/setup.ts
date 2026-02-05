export {};

const originalConsole = { ...console };

beforeAll(() => {
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

declare global {
  var testUtils: {
    wait: (ms: number) => Promise<void>;
    mockResponse: (data: any, status?: number) => any;
    createMockAxios: () => any;
  };
}

(global as any).testUtils = {
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  mockResponse: (data: any, status = 200) => ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {},
  }),

  createMockAxios: () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    create: jest.fn().mockReturnThis(),
  }),
};
