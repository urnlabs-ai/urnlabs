import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { AuditLogger } from '../core/AuditLogger';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
  process.env.AUDIT_LOG_LEVEL = 'info';
  
  // Initialize test database/storage if needed
  console.log('🧪 Setting up test environment...');
  
  // Suppress console output during tests except for errors
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  
  console.log = () => {}; // Suppress log output
  console.info = () => {}; // Suppress info output
  console.warn = () => {}; // Suppress warn output
  
  // Restore console.log for this setup message
  originalConsoleLog('🧪 Test environment configured');
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Clean up any test data or connections
  // Reset environment variables if needed
  delete process.env.AUDIT_LOG_LEVEL;
  
  console.log('✨ Test environment cleaned up');
});

beforeEach(async () => {
  // Reset any global state before each test
  // Clear any in-memory caches or registries
});

afterEach(async () => {
  // Clean up after each test
  // Reset any modified global state
});

// Global test utilities
declare global {
  var testUtils: {
    createMockAuditLogger(): AuditLogger;
    createTestTimeout(ms: number): Promise<void>;
    expectEventually<T>(
      check: () => T | Promise<T>,
      timeout?: number,
      interval?: number
    ): Promise<T>;
  };
}

globalThis.testUtils = {
  createMockAuditLogger(): AuditLogger {
    return new AuditLogger();
  },

  createTestTimeout(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async expectEventually<T>(
    check: () => T | Promise<T>,
    timeout = 5000,
    interval = 100
  ): Promise<T> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const result = await check();
        if (result) {
          return result;
        }
      } catch (error) {
        // Continue trying
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Expectation not met within ${timeout}ms timeout`);
  }
};

// Mock external dependencies for testing
if (process.env.NODE_ENV === 'test') {
  // Mock any external APIs or services here
  // For example, mock Anthropic API, OpenAI API, etc.
}