import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Client } from 'pg';
import { createClient } from 'redis';
import { TestDatabaseManager } from '../utils/test-database';
import { TestRedisManager } from '../utils/test-redis';

// Database and Redis instances for integration tests
let testDb: TestDatabaseManager;
let testRedis: TestRedisManager;

// Global integration test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';

  // Initialize test database
  testDb = new TestDatabaseManager({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'urnlabs_test',
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres'
  });

  await testDb.initialize();

  // Initialize test Redis
  testRedis = new TestRedisManager({
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
    db: parseInt(process.env.TEST_REDIS_DB || '1')
  });

  await testRedis.initialize();

  // Make instances available globally
  global.testDb = testDb;
  global.testRedis = testRedis;

  // Setup integration test utilities
  global.integrationUtils = {
    createTestUser: async (overrides = {}) => {
      return await testDb.createUser({
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        ...overrides
      });
    },

    createTestOrganization: async (overrides = {}) => {
      return await testDb.createOrganization({
        name: `Test Org ${Date.now()}`,
        slug: `test-org-${Date.now()}`,
        ...overrides
      });
    },

    createTestAgent: async (overrides = {}) => {
      return await testDb.createAgent({
        name: `Test Agent ${Date.now()}`,
        type: 'automation',
        status: 'active',
        ...overrides
      });
    },

    createTestWorkflow: async (overrides = {}) => {
      return await testDb.createWorkflow({
        name: `Test Workflow ${Date.now()}`,
        version: '1.0.0',
        definition: { steps: [] },
        ...overrides
      });
    }
  };
}, 30000);

// Cleanup before each test
beforeEach(async () => {
  // Clear Redis test data
  await testRedis.clear();

  // Start database transaction for test isolation
  await testDb.beginTransaction();
});

// Cleanup after each test
afterEach(async () => {
  // Rollback database transaction
  await testDb.rollbackTransaction();

  // Clear any lingering test data
  if (global.integrationCleanup) {
    for (const cleanup of global.integrationCleanup) {
      await cleanup();
    }
    global.integrationCleanup = [];
  }
});

// Global cleanup
afterAll(async () => {
  // Cleanup test database
  if (testDb) {
    await testDb.cleanup();
  }

  // Cleanup test Redis
  if (testRedis) {
    await testRedis.cleanup();
  }

  // Reset environment
  delete process.env.NODE_ENV;
  delete process.env.LOG_LEVEL;
}, 30000);

// Extend global types for integration test utilities
declare global {
  var testDb: TestDatabaseManager;
  var testRedis: TestRedisManager;

  var integrationUtils: {
    createTestUser: (overrides?: object) => Promise<any>;
    createTestOrganization: (overrides?: object) => Promise<any>;
    createTestAgent: (overrides?: object) => Promise<any>;
    createTestWorkflow: (overrides?: object) => Promise<any>;
  };

  var integrationCleanup: Array<() => Promise<void>>;
}