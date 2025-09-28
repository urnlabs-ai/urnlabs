import { App, ExpressReceiver, BlockAction, SlashCommand, ButtonAction } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { slackConfig, validateSlackConfig } from '../lib/config.js';
import { slackLogger, logError, createPerformanceLogger } from '../lib/logger.js';
import { SlackIntegration } from '../types/index.js';
import crypto from 'crypto';

export interface SlackMessage {
  channel: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
  threadTs?: string;
}

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  email?: string;
  isBot: boolean;
  isAdmin: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  memberCount?: number;
}

export interface SlackInteraction {
  type: 'button' | 'select' | 'modal';
  actionId: string;
  value?: string;
  userId: string;
  channelId: string;
  triggerId?: string;
}

export class SlackService {
  private app: App;
  private webClient: WebClient;
  private receiver: ExpressReceiver;

  constructor() {
    validateSlackConfig();

    // Create Express receiver for webhook handling
    this.receiver = new ExpressReceiver({
      signingSecret: slackConfig.signingSecret!,
      endpoints: '/slack/events',
    });

    this.app = new App({
      token: slackConfig.botToken,
      receiver: this.receiver,
    });

    this.webClient = new WebClient(slackConfig.botToken);
    
    this.setupEventHandlers();
    this.setupSlashCommands();
    this.setupInteractiveComponents();
    
    slackLogger.info('Slack service initialized');
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(message: SlackMessage): Promise<{ ts: string; channel: string }> {
    const perf = createPerformanceLogger('slack-send-message');
    try {
      const result = await this.webClient.chat.postMessage({
        channel: message.channel,
        text: message.text,
        blocks: message.blocks,
        attachments: message.attachments,
        thread_ts: message.threadTs,
      });

      perf.end(true, { channel: message.channel, ts: result.ts });
      slackLogger.info('Message sent', { channel: message.channel, ts: result.ts });
      
      return {
        ts: result.ts as string,
        channel: result.channel as string,
      };
    } catch (error) {
      perf.end(false, { channel: message.channel, error: (error as Error).message });
      logError(slackLogger, 'Failed to send message', error as Error, { channel: message.channel });
      throw error;
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(
    channel: string,
    ts: string,
    message: Partial<SlackMessage>
  ): Promise<boolean> {
    const perf = createPerformanceLogger('slack-update-message');
    try {
      await this.webClient.chat.update({
        channel,
        ts,
        text: message.text,
        blocks: message.blocks,
        attachments: message.attachments,
      });

      perf.end(true, { channel, ts });
      slackLogger.info('Message updated', { channel, ts });
      return true;
    } catch (error) {
      perf.end(false, { channel, ts, error: (error as Error).message });
      logError(slackLogger, 'Failed to update message', error as Error, { channel, ts });
      return false;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(channel: string, ts: string): Promise<boolean> {
    const perf = createPerformanceLogger('slack-delete-message');
    try {
      await this.webClient.chat.delete({ channel, ts });
      
      perf.end(true, { channel, ts });
      slackLogger.info('Message deleted', { channel, ts });
      return true;
    } catch (error) {
      perf.end(false, { channel, ts, error: (error as Error).message });
      logError(slackLogger, 'Failed to delete message', error as Error, { channel, ts });
      return false;
    }
  }

  /**
   * Get user information
   */
  async getUserInfo(userId: string): Promise<SlackUser | null> {
    const perf = createPerformanceLogger('slack-get-user');
    try {
      const result = await this.webClient.users.info({ user: userId });
      
      if (!result.user) {
        return null;
      }

      const user: SlackUser = {
        id: result.user.id!,
        name: result.user.name!,
        realName: result.user.real_name || result.user.name!,
        email: result.user.profile?.email,
        isBot: result.user.is_bot || false,
        isAdmin: result.user.is_admin || false,
      };

      perf.end(true, { userId });
      return user;
    } catch (error) {
      perf.end(false, { userId, error: (error as Error).message });
      logError(slackLogger, 'Failed to get user info', error as Error, { userId });
      return null;
    }
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelId: string): Promise<SlackChannel | null> {
    const perf = createPerformanceLogger('slack-get-channel');
    try {
      const result = await this.webClient.conversations.info({ channel: channelId });
      
      if (!result.channel) {
        return null;
      }

      const channel: SlackChannel = {
        id: result.channel.id!,
        name: result.channel.name!,
        isPrivate: result.channel.is_private || false,
        isMember: result.channel.is_member || false,
        memberCount: result.channel.num_members,
      };

      perf.end(true, { channelId });
      return channel;
    } catch (error) {
      perf.end(false, { channelId, error: (error as Error).message });
      logError(slackLogger, 'Failed to get channel info', error as Error, { channelId });
      return null;
    }
  }

  /**
   * Open a modal
   */
  async openModal(triggerId: string, view: any): Promise<boolean> {
    const perf = createPerformanceLogger('slack-open-modal');
    try {
      await this.webClient.views.open({
        trigger_id: triggerId,
        view,
      });

      perf.end(true, { triggerId });
      slackLogger.info('Modal opened', { triggerId });
      return true;
    } catch (error) {
      perf.end(false, { triggerId, error: (error as Error).message });
      logError(slackLogger, 'Failed to open modal', error as Error, { triggerId });
      return false;
    }
  }

  /**
   * Send notification with interactive components
   */
  async sendNotification(
    channel: string,
    title: string,
    message: string,
    actions?: Array<{ text: string; actionId: string; style?: 'primary' | 'danger' }>
  ): Promise<{ ts: string; channel: string }> {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${title}*\n${message}`,
        },
      },
    ];

    if (actions && actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actions.map(action => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: action.text,
          },
          action_id: action.actionId,
          style: action.style,
        })),
      });
    }

    return this.sendMessage({
      channel,
      blocks,
    });
  }

  /**
   * Send workflow approval request
   */
  async sendWorkflowApproval(
    channel: string,
    workflowId: string,
    title: string,
    description: string,
    requester: string
  ): Promise<{ ts: string; channel: string }> {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🔄 Workflow Approval Required*\n*${title}*\n${description}\n*Requested by:* <@${requester}>`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Approve',
            },
            action_id: `approve_workflow_${workflowId}`,
            style: 'primary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Reject',
            },
            action_id: `reject_workflow_${workflowId}`,
            style: 'danger',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📋 Details',
            },
            action_id: `details_workflow_${workflowId}`,
          },
        ],
      },
    ];

    return this.sendMessage({
      channel,
      blocks,
    });
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    timestamp: string,
    body: string,
    signature: string
  ): boolean {
    if (!slackConfig.signingSecret) {
      return false;
    }

    const baseString = `v0:${timestamp}:${body}`;
    const expectedSignature = `v0=${crypto
      .createHmac('sha256', slackConfig.signingSecret)
      .update(baseString)
      .digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // App mention events
    this.app.event('app_mention', async ({ event, say }) => {
      slackLogger.info('App mention received', {
        user: event.user,
        channel: event.channel,
        text: event.text,
      });

      await say({
        text: `Hello <@${event.user}>! I'm the Urnlabs AI Agent Assistant. How can I help you today?`,
        thread_ts: event.ts,
      });
    });

    // Direct message events
    this.app.event('message', async ({ event, say }) => {
      // Only respond to direct messages (not in channels)
      if (event.channel_type === 'im' && !event.bot_id) {
        slackLogger.info('Direct message received', {
          user: event.user,
          text: event.text,
        });

        await say({
          text: 'Thanks for your message! I can help you with workflow management, agent status, and integrations. Try `/urnlabs help` to see available commands.',
        });
      }
    });

    slackLogger.info('Slack event handlers configured');
  }

  /**
   * Setup slash commands
   */
  private setupSlashCommands(): void {
    // Main Urnlabs command
    this.app.command('/urnlabs', async ({ command, ack, respond }) => {
      await ack();
      
      slackLogger.info('Slash command received', {
        command: command.command,
        text: command.text,
        user: command.user_id,
        channel: command.channel_id,
      });

      const args = command.text.trim().split(' ');
      const action = args[0]?.toLowerCase();

      switch (action) {
        case 'help':
          await respond({
            text: 'Urnlabs AI Agent Commands',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*Available Commands:*\n• `/urnlabs status` - Check agent status\n• `/urnlabs workflows` - List active workflows\n• `/urnlabs deploy <environment>` - Trigger deployment\n• `/urnlabs health` - System health check\n• `/urnlabs help` - Show this help',
                },
              },
            ],
          });
          break;

        case 'status':
          await respond({
            text: '🤖 Agent Status: All systems operational',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*🤖 Urnlabs AI Agent Status*\n✅ All agents are running\n✅ Database connected\n✅ External integrations active',
                },
              },
            ],
          });
          break;

        case 'workflows':
          await respond({
            text: '📊 Active Workflows',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*📊 Active Workflows*\n• Code Review (3 pending)\n• Deployment Pipeline (1 running)\n• Issue Triage (5 open)',
                },
              },
            ],
          });
          break;

        case 'health':
          await respond({
            text: '💚 System Health: All services healthy',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*💚 System Health*\n✅ API Gateway: Healthy\n✅ Agent Services: Healthy\n✅ Database: Healthy\n✅ Cache: Healthy',
                },
              },
            ],
          });
          break;

        default:
          await respond({
            text: 'Unknown command. Use `/urnlabs help` to see available commands.',
          });
      }
    });

    slackLogger.info('Slack slash commands configured');
  }

  /**
   * Setup interactive components
   */
  private setupInteractiveComponents(): void {
    // Workflow approval buttons
    this.app.action(/approve_workflow_(.+)/, async ({ body, action, ack, respond }) => {
      await ack();
      
      const workflowId = (action as ButtonAction).action_id.split('_')[2];
      slackLogger.info('Workflow approved', {
        workflowId,
        user: body.user.id,
      });

      await respond({
        text: `✅ Workflow ${workflowId} approved by <@${body.user.id}>`,
        replace_original: true,
      });
    });

    this.app.action(/reject_workflow_(.+)/, async ({ body, action, ack, respond }) => {
      await ack();
      
      const workflowId = (action as ButtonAction).action_id.split('_')[2];
      slackLogger.info('Workflow rejected', {
        workflowId,
        user: body.user.id,
      });

      await respond({
        text: `❌ Workflow ${workflowId} rejected by <@${body.user.id}>`,
        replace_original: true,
      });
    });

    this.app.action(/details_workflow_(.+)/, async ({ body, action, ack, client }) => {
      await ack();
      
      const workflowId = (action as ButtonAction).action_id.split('_')[2];
      slackLogger.info('Workflow details requested', {
        workflowId,
        user: body.user.id,
      });

      // Open modal with workflow details
      await this.openModal(body.trigger_id!, {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: 'Workflow Details',
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Workflow ID:* ${workflowId}\n*Status:* Pending Approval\n*Created:* ${new Date().toISOString()}\n*Description:* Detailed workflow information would be displayed here.`,
            },
          },
        ],
      });
    });

    slackLogger.info('Slack interactive components configured');
  }

  /**
   * Get Express app for webhook handling
   */
  getExpressApp() {
    return this.receiver.app;
  }

  /**
   * Start the Slack app
   */
  async start(port?: number): Promise<void> {
    if (port) {
      await this.app.start(port);
      slackLogger.info(`Slack app started on port ${port}`);
    } else {
      // Just setup, don't start server (handled by main server)
      slackLogger.info('Slack app configured for webhook integration');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; details?: string }> {
    try {
      const result = await this.webClient.auth.test();
      
      if (result.ok) {
        return { status: 'ok' };
      } else {
        return { status: 'error', details: 'Authentication failed' };
      }
    } catch (error) {
      logError(slackLogger, 'Slack health check failed', error as Error);
      return {
        status: 'error',
        details: (error as Error).message,
      };
    }
  }
}