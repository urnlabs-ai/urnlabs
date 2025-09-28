import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test environment cleanup...');

  try {
    // Clean up authentication files
    const authDir = path.join(__dirname, '../../test-results/auth');
    if (fs.existsSync(authDir)) {
      const authFiles = fs.readdirSync(authDir);
      for (const file of authFiles) {
        fs.unlinkSync(path.join(authDir, file));
      }
      console.log('✅ Authentication files cleaned up');
    }

    // Clean up test data if needed
    // This could include API calls to clean up test data created during tests
    // For now, we'll just log the cleanup process

    console.log('✅ Test data cleanup completed');

    // Archive test artifacts if in CI
    if (process.env.CI) {
      const resultsDir = path.join(__dirname, '../../test-results');
      console.log(`📦 Test artifacts available at: ${resultsDir}`);
    }

  } catch (error) {
    console.error('❌ Global teardown encountered an error:', error);
    // Don't throw here as it would mask test failures
  }

  console.log('🎉 E2E test environment cleanup completed');
}

export default globalTeardown;