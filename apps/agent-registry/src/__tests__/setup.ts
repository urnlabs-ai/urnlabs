import { vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.LOG_LEVEL = 'error';

// Global mocks
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
    agent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    }
  }))
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ping: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    hget: vi.fn(),
    hset: vi.fn(),
    hgetall: vi.fn(),
    incrby: vi.fn(),
    sadd: vi.fn(),
    expire: vi.fn()
  }))
}));

vi.mock('dockerode', () => ({
  default: vi.fn(() => ({
    ping: vi.fn(),
    listContainers: vi.fn(),
    createContainer: vi.fn(),
    getContainer: vi.fn(),
    getImage: vi.fn(),
    pull: vi.fn()
  }))
}));

vi.mock('ws', () => ({
  default: {
    Server: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn()
    })),
    OPEN: 1,
    CLOSED: 3
  }
}));

// Console suppression for tests
const originalConsole = { ...console };
console.log = vi.fn();
console.info = vi.fn();
console.warn = vi.fn();
console.error = vi.fn();

// Cleanup after tests
afterEach(() => {
  vi.clearAllMocks();
});

// Restore console for debugging when needed
(global as any).restoreConsole = () => {
  Object.assign(console, originalConsole);
};