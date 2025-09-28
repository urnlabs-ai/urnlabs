import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { testHandlers } from '../mocks/handlers';

// Setup MSW (Mock Service Worker) for API mocking
export const server = setupServer(...testHandlers);

// Global test setup
beforeAll(() => {
  // Start MSW server
  server.listen({ onUnhandledRequest: 'error' });

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';

  // Setup global test utilities
  global.testUtils = {
    delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    generateId: () => Math.random().toString(36).substr(2, 9)
  };
});

// Cleanup after each test
afterEach(() => {
  // Reset MSW handlers
  server.resetHandlers();

  // Clear any test data
  if (global.testCleanup) {
    global.testCleanup.forEach(cleanup => cleanup());
    global.testCleanup = [];
  }
});

// Global cleanup
afterAll(() => {
  // Stop MSW server
  server.close();

  // Reset environment
  delete process.env.NODE_ENV;
  delete process.env.LOG_LEVEL;
});

// Extend global types for test utilities
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    generateId: () => string;
  };

  var testCleanup: Array<() => void>;
}

// Custom matchers for Vitest
import { expect } from 'vitest';

interface CustomMatchers<R = unknown> {
  toBeValidUUID: () => R;
  toBeValidEmail: () => R;
  toBeValidDate: () => R;
  toMatchApiResponse: (schema: object) => R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

// Custom matcher implementations
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return {
      pass: uuidRegex.test(received),
      message: () => `expected ${received} to be a valid UUID`
    };
  },

  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      pass: emailRegex.test(received),
      message: () => `expected ${received} to be a valid email`
    };
  },

  toBeValidDate(received: string) {
    const date = new Date(received);
    return {
      pass: !isNaN(date.getTime()),
      message: () => `expected ${received} to be a valid date`
    };
  },

  toMatchApiResponse(received: object, schema: object) {
    // Basic schema validation - in real implementation would use Zod or Joi
    const keys = Object.keys(schema);
    const receivedKeys = Object.keys(received);
    const hasAllKeys = keys.every(key => receivedKeys.includes(key));

    return {
      pass: hasAllKeys,
      message: () => `expected response to match schema structure`
    };
  }
});