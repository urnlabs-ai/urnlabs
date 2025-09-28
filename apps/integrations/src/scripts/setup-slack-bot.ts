#!/usr/bin/env tsx

import { slackConfig, validateSlackConfig } from '../lib/config.js';
import { SlackService } from '../slack/slack-service.js';
import { logger } from '../lib/logger.js';

async function setupSlackBot() {
  console.log('🤖 Setting up Slack Bot...');

  try {
    // Validate configuration
    validateSlackConfig();
    console.log('✅ Slack configuration validated');

    // Create service instance
    const slackService = new SlackService();

    // Perform health check
    const health = await slackService.healthCheck();
    
    if (health.status === 'ok') {
      console.log('✅ Slack Bot connection successful');
      console.log(`🔗 Event Request URL: https://your-domain.com/api/v1/slack/events`);
      console.log(`📱 Client ID: ${slackConfig.clientId}`);
      
      console.log('\n📋 Next steps:');
      console.log('1. Configure Event Request URL in your Slack App settings');
      console.log('2. Subscribe to bot events (app_mention, message.im)');
      console.log('3. Add slash commands (/urnlabs)');
      console.log('4. Enable interactive components');
      console.log('5. Install the app to your workspace');
      console.log('6. Test with @your-bot-name in a channel');
      
      console.log('\n🔧 Required OAuth Scopes:');
      console.log('- app_mentions:read');
      console.log('- channels:read');
      console.log('- chat:write');
      console.log('- commands');
      console.log('- im:read');
      console.log('- im:write');
      console.log('- users:read');
    } else {
      console.error('❌ Slack Bot connection failed:', health.details);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Slack Bot setup failed:', (error as Error).message);
    console.log('\n🔍 Troubleshooting:');
    console.log('- Check your SLACK_BOT_TOKEN starts with xoxb-');
    console.log('- Verify SLACK_SIGNING_SECRET is correctly set');
    console.log('- Ensure the bot has proper scopes and permissions');
    console.log('- Check if the app is installed in your workspace');
    process.exit(1);
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupSlackBot();
}

export { setupSlackBot };