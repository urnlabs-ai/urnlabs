import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Environment setup
    environment: 'happy-dom',

    // Global test setup
    setupFiles: ['./src/test-setup/vitest.setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test-setup/**',
        'src/fixtures/**',
        'src/mocks/**',
        'src/**/*.d.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },

    // Test file patterns
    include: [
      'src/**/*.{test,spec}.ts'
    ],
    exclude: [
      'src/**/*.integration.{test,spec}.ts',
      'src/**/*.e2e.{test,spec}.ts'
    ],

    // Performance settings
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter configuration
    reporter: ['default', 'json', 'html'],
    outputFile: {
      json: './test-results/unit-tests.json',
      html: './test-results/unit-tests.html'
    },

    // Globals
    globals: true,

    // Watch mode settings
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**'
    ]
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