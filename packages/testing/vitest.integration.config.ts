import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Environment setup for integration tests
    environment: 'node',

    // Global test setup
    setupFiles: ['./src/test-setup/integration.setup.ts'],

    // Test file patterns for integration tests
    include: [
      'src/**/*.integration.{test,spec}.ts'
    ],

    // Performance settings for integration tests
    testTimeout: 30000,
    hookTimeout: 30000,

    // Reporter configuration
    reporter: ['default', 'json'],
    outputFile: {
      json: './test-results/integration-tests.json'
    },

    // Sequential execution for database tests
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },

    // Globals
    globals: true,

    // Coverage for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      reportsDirectory: './coverage/integration',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test-setup/**',
        'src/fixtures/**',
        'src/mocks/**',
        'src/**/*.d.ts'
      ]
    }
  },

  // TypeScript support
  esbuild: {
    target: 'es2022'
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@fixtures': path.resolve(__dirname, './src/fixtures'),
      '@mocks': path.resolve(__dirname, './src/mocks'),
      '@utils': path.resolve(__dirname, './src/utils')
    }
  }
});