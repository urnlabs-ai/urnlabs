/**
 * Real-time Communication Example
 * Demonstrates WebSocket usage for live updates
 */

import {
  createWebSocketClient,
  createLogger,
  createErrorHandler,
  RealtimeMessage
} from '@urnlabs/mobile-sdk-core';

const logger = createLogger({
  component: 'RealtimeExample',
  level: 'info'
});

const errorHandler = createErrorHandler({
  logger,
  enableReporting: false
});

async function demonstrateRealtimeCommunication() {
  try {
    logger.info('Starting real-time communication demonstration');

    // 1. Create WebSocket client
    const wsClient = createWebSocketClient({
      url: 'wss://ws.urnlabs.com',
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      enableLogging: true
    });

    // 2. Set up event handlers
    setupEventHandlers(wsClient);

    // 3. Connect to WebSocket
    logger.info('Connecting to WebSocket...');
    await wsClient.connect();
    logger.info('WebSocket connected successfully');

    // 4. Subscribe to different channels
    logger.info('Setting up subscriptions...');

    // Subscribe to workflow updates
    const workflowSubId = wsClient.subscribe('workflow_updates', (message: RealtimeMessage) => {
      logger.info('Workflow update received', {
        type: message.type,
        payload: message.payload,
        timestamp: message.timestamp
      });

      handleWorkflowUpdate(message.payload);
    });

    // Subscribe to agent status updates
    const agentSubId = wsClient.subscribe('agent_status', (message: RealtimeMessage) => {
      logger.info('Agent status update received', {
        agentId: message.payload.agentId,
        status: message.payload.status,
        timestamp: message.timestamp
      });

      handleAgentStatusUpdate(message.payload);
    });

    // Subscribe to notifications
    const notificationSubId = wsClient.subscribe('notifications', (message: RealtimeMessage) => {
      logger.info('Notification received', {
        type: message.payload.type,
        title: message.payload.title,
        message: message.payload.message
      });

      handleNotification(message.payload);
    });

    // Subscribe to all messages (for debugging)
    const allMessagesSubId = wsClient.subscribe('*', (message: RealtimeMessage) => {
      logger.debug('All messages subscription', {
        type: message.type,
        id: message.id,
        timestamp: message.timestamp
      });
    });

    // 5. Send messages to server
    logger.info('Sending subscription messages...');

    // Subscribe to specific workflow
    await wsClient.send({
      type: 'subscribe_workflow',
      payload: {
        workflowId: 'workflow-123',
        includeSteps: true
      }
    });

    // Subscribe to agent updates
    await wsClient.send({
      type: 'subscribe_agent',
      payload: {
        agentId: 'agent-456'
      }
    });

    // Request current status
    await wsClient.send({
      type: 'get_status',
      payload: {
        entities: ['workflows', 'agents', 'notifications']
      }
    });

    // 6. Simulate keeping connection alive for some time
    logger.info('Maintaining connection for demo period...');
    
    // In a real app, this would run indefinitely
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

    // 7. Demonstrate unsubscribing
    logger.info('Unsubscribing from channels...');
    wsClient.unsubscribe(workflowSubId);
    wsClient.unsubscribe(agentSubId);
    wsClient.unsubscribe(notificationSubId);
    wsClient.unsubscribe(allMessagesSubId);

    // 8. Disconnect
    logger.info('Disconnecting WebSocket...');
    await wsClient.disconnect();
    logger.info('WebSocket disconnected');

  } catch (error) {
    const sdkError = errorHandler.handleError(error as Error, {
      component: 'RealtimeExample',
      operation: 'demonstrateRealtimeCommunication'
    });

    logger.error('Real-time communication demonstration failed', sdkError);
  }
}

function setupEventHandlers(wsClient: any) {
  // Note: In the actual implementation, these would be proper event listeners
  // This is a simplified example showing the concept

  logger.info('Setting up WebSocket event handlers...');

  // Connection events would be handled internally by the WebSocket client
  // But you could listen for SDK events if the client emitted them

  // Handle connection state changes
  // wsClient.on('connected', () => {
  //   logger.info('WebSocket connected');
  // });

  // wsClient.on('disconnected', (reason) => {
  //   logger.warn('WebSocket disconnected', { reason });
  // });

  // wsClient.on('reconnecting', (attempt) => {
  //   logger.info('WebSocket reconnecting', { attempt });
  // });

  // wsClient.on('error', (error) => {
  //   logger.error('WebSocket error', error);
  // });
}

function handleWorkflowUpdate(payload: any) {
  console.log('📋 Workflow Update:');
  console.log(`  Workflow: ${payload.workflowId}`);
  console.log(`  Status: ${payload.status}`);
  console.log(`  Progress: ${payload.progress}%`);
  
  if (payload.currentStep) {
    console.log(`  Current Step: ${payload.currentStep}`);
  }

  if (payload.error) {
    console.log(`  ❌ Error: ${payload.error}`);
  }

  // Update UI with workflow status
  updateWorkflowUI(payload);
}

function handleAgentStatusUpdate(payload: any) {
  console.log('🤖 Agent Status Update:');
  console.log(`  Agent: ${payload.agentId}`);
  console.log(`  Status: ${payload.status}`);
  console.log(`  Load: ${payload.currentLoad || 0}%`);

  if (payload.activeJobs) {
    console.log(`  Active Jobs: ${payload.activeJobs.length}`);
  }

  // Update UI with agent status
  updateAgentStatusUI(payload);
}

function handleNotification(payload: any) {
  console.log('🔔 Notification:');
  console.log(`  Type: ${payload.type}`);
  console.log(`  Title: ${payload.title}`);
  console.log(`  Message: ${payload.message}`);
  console.log(`  Priority: ${payload.priority || 'normal'}`);

  // Show notification to user
  showNotificationToUser(payload);
}

function updateWorkflowUI(workflowData: any) {
  // In a real app, this would update the UI components
  logger.debug('Updating workflow UI', { workflowId: workflowData.workflowId });
  
  // Example UI updates:
  // - Update progress bars
  // - Change status indicators
  // - Show/hide error messages
  // - Update step highlights
}

function updateAgentStatusUI(agentData: any) {
  // In a real app, this would update the agent status display
  logger.debug('Updating agent status UI', { agentId: agentData.agentId });
  
  // Example UI updates:
  // - Update agent status badges
  // - Show/hide busy indicators
  // - Update load meters
  // - Display active job counts
}

function showNotificationToUser(notification: any) {
  // In a real app, this would show notifications to the user
  logger.debug('Showing notification to user', { 
    type: notification.type,
    title: notification.title 
  });
  
  // Example notification display:
  // - Toast notifications
  // - Push notifications
  // - In-app notification center
  // - Badge updates
}

async function demonstrateReconnectionScenario() {
  logger.info('Demonstrating reconnection scenario...');

  const wsClient = createWebSocketClient({
    url: 'wss://ws.urnlabs.com',
    reconnectAttempts: 3,
    reconnectDelay: 2000,
    enableLogging: true
  });

  try {
    // Connect
    await wsClient.connect();
    logger.info('Initial connection established');

    // Set up subscription
    const subId = wsClient.subscribe('test_channel', (message) => {
      logger.info('Message received after reconnection', message);
    });

    // Simulate network interruption by disconnecting
    logger.info('Simulating network interruption...');
    await wsClient.disconnect();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reconnect (in real scenarios, this would be automatic)
    logger.info('Reconnecting...');
    await wsClient.connect();

    // Subscriptions should be automatically restored
    logger.info('Connection restored, subscriptions should be active');

    // Test that messages are received
    await wsClient.send({
      type: 'test_message',
      payload: { test: true }
    });

    // Cleanup
    wsClient.unsubscribe(subId);
    await wsClient.disconnect();

  } catch (error) {
    logger.error('Reconnection demonstration failed', error as Error);
  }
}

// Export functions for use in other examples
export {
  demonstrateRealtimeCommunication,
  demonstrateReconnectionScenario
};

// Run demonstration
if (require.main === module) {
  (async () => {
    await demonstrateRealtimeCommunication();
    await demonstrateReconnectionScenario();
  })().catch(console.error);
}