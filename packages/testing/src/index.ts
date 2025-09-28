// Main testing framework exports
export * from './services/quality-gates';
export * from './config/quality-gates.config';

// Fixtures
export * from './fixtures';

// Test utilities
export { TestDatabaseManager } from './utils/test-database';
export { TestRedisManager } from './utils/test-redis';

// Test setup utilities
export * from './test-setup/vitest.setup';

// Types
export interface TestEnvironment {
  database: TestDatabaseManager;
  redis: TestRedisManager;
  cleanup: () => Promise<void>;
}

// Test helper functions
export const createTestEnvironment = async (): Promise<TestEnvironment> => {
  const { TestDatabaseManager } = await import('./utils/test-database');
  const { TestRedisManager } = await import('./utils/test-redis');

  const database = new TestDatabaseManager({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'urnlabs_test',
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres'
  });

  const redis = new TestRedisManager({
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
    db: parseInt(process.env.TEST_REDIS_DB || '1')
  });

  await database.initialize();
  await redis.initialize();

  return {
    database,
    redis,
    cleanup: async () => {
      await database.cleanup();
      await redis.cleanup();
    }
  };
};

// Common test patterns
export const testPatterns = {
  // API test pattern
  apiTest: {
    async withAuth(token: string) {
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
    },

    async expectValidResponse(response: any, expectedKeys: string[]) {
      expect(response).toBeTruthy();
      expectedKeys.forEach(key => {
        expect(response).toHaveProperty(key);
      });
    }
  },

  // Database test pattern
  dbTest: {
    async withTransaction(db: any, testFn: () => Promise<void>) {
      await db.beginTransaction();
      try {
        await testFn();
      } finally {
        await db.rollbackTransaction();
      }
    }
  },

  // Performance test pattern
  performanceTest: {
    async measureExecutionTime(fn: () => Promise<void>): Promise<number> {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    },

    async expectPerformance(fn: () => Promise<void>, maxTime: number) {
      const executionTime = await this.measureExecutionTime(fn);
      expect(executionTime).toBeLessThan(maxTime);
      return executionTime;
    }
  }
};