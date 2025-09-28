#!/usr/bin/env tsx

import { githubConfig, validateGitHubConfig } from '../lib/config.js';
import { GitHubService } from '../github/github-service.js';
import { logger } from '../lib/logger.js';

async function setupGitHubApp() {
  console.log('🔧 Setting up GitHub App...');

  try {
    // Validate configuration
    validateGitHubConfig();
    console.log('✅ GitHub configuration validated');

    // Create service instance
    const githubService = new GitHubService();

    // Perform health check
    const health = await githubService.healthCheck();
    
    if (health.status === 'ok') {
      console.log('✅ GitHub App connection successful');
      console.log(`📱 App ID: ${githubConfig.appId}`);
      console.log('🔗 Webhook URL should be: https://your-domain.com/api/v1/webhooks/github');
      console.log('🔑 Make sure webhook secret is configured');
      
      console.log('\n📋 Next steps:');
      console.log('1. Configure webhook URL in your GitHub App settings');
      console.log('2. Subscribe to required events (push, pull_request, issues, installation)');
      console.log('3. Install the app on repositories you want to monitor');
      console.log('4. Test webhooks using the /webhooks/manual endpoint');
    } else {
      console.error('❌ GitHub App connection failed:', health.details);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ GitHub App setup failed:', (error as Error).message);
    console.log('\n🔍 Troubleshooting:');
    console.log('- Check your GITHUB_APP_ID is correct');
    console.log('- Verify GITHUB_APP_PRIVATE_KEY is properly formatted');
    console.log('- Ensure the GitHub App has proper permissions');
    process.exit(1);
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupGitHubApp();
}

export { setupGitHubApp };