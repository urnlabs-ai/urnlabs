import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
// import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data (in development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Clearing existing data...');
    
    await prisma.taskExecution.deleteMany();
    await prisma.workflowRun.deleteMany();
    await prisma.workflowStep.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.integration.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.metric.deleteMany();
    await prisma.alert.deleteMany();
    await prisma.document.deleteMany();
  }

  // Create organizations
  console.log('🏢 Creating organizations...');
  
  const urnlabsOrg = await prisma.organization.create({
    data: {
      name: 'Urnlabs',
      slug: 'urnlabs',
      description: 'AI Agent Platform Company',
      website: 'https://urnlabs.ai',
      planType: 'enterprise',
      planLimits: {
        maxUsers: 100,
        maxAgents: 50,
        maxWorkflows: 100,
        storageGB: 1000,
      },
      billingEmail: 'billing@urnlabs.ai',
      settings: {
        features: {
          githubIntegration: true,
          slackNotifications: true,
          advancedAnalytics: true,
          customAgents: true,
        },
        security: {
          requireMFA: false,
          sessionTimeoutMinutes: 480,
          allowApiAccess: true,
        },
      },
    },
  });

  const demoOrg = await prisma.organization.create({
    data: {
      name: 'Demo Organization',
      slug: 'demo-org',
      description: 'Demonstration organization for testing',
      planType: 'pro',
      planLimits: {
        maxUsers: 10,
        maxAgents: 10,
        maxWorkflows: 25,
        storageGB: 100,
      },
    },
  });

  // Create users
  console.log('👥 Creating users...');
  
  // Temporary plain password - replace with bcrypt in production
  const hashedPassword = '$2b$12$placeholder.hash.for.development.only';
  
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@urnlabs.ai',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'SUPER_ADMIN',
      organizationId: urnlabsOrg.id,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@example.com',
      passwordHash: hashedPassword,
      firstName: 'Demo',
      lastName: 'User',
      role: 'USER',
      organizationId: demoOrg.id,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  const developerUser = await prisma.user.create({
    data: {
      email: 'developer@urnlabs.ai',
      passwordHash: hashedPassword,
      firstName: 'Developer',
      lastName: 'User',
      role: 'ADMIN',
      organizationId: urnlabsOrg.id,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  // Create user permissions
  console.log('🔐 Creating user permissions...');
  
  const adminPermissions = [
    'agents:read', 'agents:write', 'agents:delete',
    'workflows:read', 'workflows:write', 'workflows:delete', 'workflows:execute',
    'users:read', 'users:write', 'users:delete',
    'organizations:read', 'organizations:write',
    'integrations:read', 'integrations:write', 'integrations:delete',
    'analytics:read', 'analytics:write',
    'audit:read',
  ];

  const userPermissions = [
    'agents:read',
    'workflows:read', 'workflows:execute',
    'analytics:read',
  ];

  for (const permission of adminPermissions) {
    await prisma.userPermission.create({
      data: {
        userId: adminUser.id,
        permission,
      },
    });
    
    await prisma.userPermission.create({
      data: {
        userId: developerUser.id,
        permission,
      },
    });
  }

  for (const permission of userPermissions) {
    await prisma.userPermission.create({
      data: {
        userId: demoUser.id,
        permission,
      },
    });
  }

  // Create agents
  console.log('🤖 Creating AI agents...');
  
  const codeReviewerAgent = await prisma.agent.create({
    data: {
      name: 'Senior Code Reviewer',
      type: 'code-reviewer',
      description: 'Specialized agent for comprehensive code reviews, security analysis, and quality assurance',
      systemPrompt: 'You are a senior software engineer with expertise in security, performance, and code quality. Focus on identifying potential vulnerabilities, performance bottlenecks, and maintainability issues.',
      capabilities: [
        'Security vulnerability detection',
        'Performance optimization analysis',
        'Code quality assessment',
        'Best practices validation',
        'Automated fix suggestions',
      ],
      specializations: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Security'],
      tools: ['filesystem', 'github', 'database'],
      organizationId: urnlabsOrg.id,
      config: {
        maxReviewSize: 1000, // lines of code
        securityLevel: 'high',
        performanceThresholds: {
          responseTime: 200,
          memoryUsage: 512,
        },
      },
    },
  });

  const architectureAgent = await prisma.agent.create({
    data: {
      name: 'Principal System Architect',
      type: 'architecture-agent',
      description: 'Focused on system design, scalability, and technical architecture decisions',
      systemPrompt: 'You are a principal architect with deep expertise in distributed systems, microservices, and scalable architecture patterns.',
      capabilities: [
        'System architecture design',
        'Scalability planning',
        'Technology stack recommendations',
        'Performance optimization',
        'Infrastructure planning',
      ],
      specializations: ['Distributed Systems', 'Microservices', 'Database Design', 'Cloud Architecture'],
      tools: ['filesystem', 'database', 'monitoring'],
      organizationId: urnlabsOrg.id,
      config: {
        maxComplexity: 'high',
        architecturePatterns: ['microservices', 'event-driven', 'layered'],
      },
    },
  });

  const deploymentAgent = await prisma.agent.create({
    data: {
      name: 'DevOps Engineering Agent',
      type: 'deployment-agent',
      description: 'Manages deployments, infrastructure, CI/CD pipelines, and operational workflows',
      systemPrompt: 'You are a DevOps engineer specialized in automated deployments, infrastructure as code, and operational excellence.',
      capabilities: [
        'Automated deployment management',
        'Infrastructure provisioning',
        'CI/CD pipeline optimization',
        'Monitoring and alerting',
        'Incident response',
      ],
      specializations: ['Kubernetes', 'Docker', 'GitHub Actions', 'AWS/Azure', 'Monitoring'],
      tools: ['filesystem', 'github', 'slack'],
      organizationId: urnlabsOrg.id,
      config: {
        environments: ['development', 'staging', 'production'],
        rollbackEnabled: true,
        healthCheckTimeout: 300,
      },
    },
  });

  const testingAgent = await prisma.agent.create({
    data: {
      name: 'Quality Assurance Specialist',
      type: 'testing-agent',
      description: 'Comprehensive testing strategy including unit, integration, and e2e tests',
      systemPrompt: 'You are a QA engineer with strong development skills. Create comprehensive test suites and ensure robust test coverage.',
      capabilities: [
        'Test strategy development',
        'Automated test creation',
        'Test coverage analysis',
        'Performance testing',
        'Security testing',
      ],
      specializations: ['Jest', 'Cypress', 'Playwright', 'Load Testing'],
      tools: ['filesystem', 'database'],
      organizationId: urnlabsOrg.id,
      config: {
        minCoverage: 80,
        testTypes: ['unit', 'integration', 'e2e'],
      },
    },
  });

  // Create workflows
  console.log('🔄 Creating workflows...');
  
  const featureDevWorkflow = await prisma.workflow.create({
    data: {
      name: 'Feature Development',
      type: 'feature-development',
      description: 'Complete feature development from requirements to deployment',
      organizationId: urnlabsOrg.id,
      config: {
        requiresApproval: true,
        timeoutMinutes: 120,
        retryAttempts: 3,
      },
      triggerEvents: ['github:pull_request:opened', 'manual'],
    },
  });

  const bugFixWorkflow = await prisma.workflow.create({
    data: {
      name: 'Bug Investigation and Resolution',
      type: 'bug-fix',
      description: 'Systematic approach to bug identification, fixing, and prevention',
      organizationId: urnlabsOrg.id,
      config: {
        priority: 'high',
        timeoutMinutes: 60,
      },
      triggerEvents: ['github:issue:labeled:bug', 'manual'],
    },
  });

  const securityAuditWorkflow = await prisma.workflow.create({
    data: {
      name: 'Security Review and Hardening',
      type: 'security-audit',
      description: 'Comprehensive security assessment and improvement',
      organizationId: urnlabsOrg.id,
      config: {
        severity: 'critical',
        requiresReview: true,
      },
      triggerEvents: ['scheduled:weekly', 'manual'],
    },
  });

  // Create workflow steps
  console.log('📋 Creating workflow steps...');
  
  // Feature Development Workflow Steps
  await prisma.workflowStep.create({
    data: {
      workflowId: featureDevWorkflow.id,
      agentId: architectureAgent.id,
      name: 'Requirements Analysis',
      description: 'Analyze requirements and create technical specifications',
      order: 1,
      config: {
        outputFormat: 'technical-spec',
        includeArchitectureDiagram: true,
      },
    },
  });

  await prisma.workflowStep.create({
    data: {
      workflowId: featureDevWorkflow.id,
      agentId: codeReviewerAgent.id,
      name: 'Code Review',
      description: 'Review implementation for quality and security',
      order: 2,
      config: {
        securityScan: true,
        performanceCheck: true,
      },
    },
  });

  await prisma.workflowStep.create({
    data: {
      workflowId: featureDevWorkflow.id,
      agentId: testingAgent.id,
      name: 'Testing Suite',
      description: 'Create comprehensive test coverage',
      order: 3,
      config: {
        minCoverage: 80,
        includeE2E: true,
      },
    },
  });

  await prisma.workflowStep.create({
    data: {
      workflowId: featureDevWorkflow.id,
      agentId: deploymentAgent.id,
      name: 'Deployment',
      description: 'Deploy to staging and production environments',
      order: 4,
      config: {
        stagingFirst: true,
        healthChecks: true,
        rollbackOnFailure: true,
      },
    },
  });

  // Create integrations
  console.log('🔌 Creating integrations...');
  
  await prisma.integration.create({
    data: {
      name: 'GitHub Integration',
      type: 'github',
      organizationId: urnlabsOrg.id,
      config: {
        repositories: ['urnlabs/urnlabs', 'urnlabs/platform'],
        webhookUrl: 'https://api.urnlabs.ai/webhooks/github',
        events: ['push', 'pull_request', 'issues'],
      },
      credentials: {
        token: 'encrypted_github_token',
      },
      isActive: true,
      healthStatus: 'healthy',
    },
  });

  await prisma.integration.create({
    data: {
      name: 'Slack Integration',
      type: 'slack',
      organizationId: urnlabsOrg.id,
      config: {
        channels: ['#engineering', '#alerts', '#deployments'],
        notificationTypes: ['workflow_completion', 'errors', 'security_alerts'],
      },
      credentials: {
        botToken: 'encrypted_slack_bot_token',
        webhookUrl: 'encrypted_slack_webhook_url',
      },
      isActive: true,
      healthStatus: 'healthy',
    },
  });

  // Create API keys
  console.log('🔑 Creating API keys...');
  
  await prisma.apiKey.create({
    data: {
      name: 'Development API Key',
      key: 'urn_dev_' + Buffer.from(randomUUID()).toString('base64').slice(0, 32),
      organizationId: urnlabsOrg.id,
      permissions: ['agents:read', 'workflows:read', 'workflows:execute'],
      isActive: true,
    },
  });

  // Create sample metrics
  console.log('📊 Creating sample metrics...');
  
  const now = new Date();
  const metricsData = [
    { name: 'api.requests.total', type: 'counter', value: 1247, unit: 'count' },
    { name: 'api.response_time.avg', type: 'gauge', value: 142, unit: 'ms' },
    { name: 'workflows.executed.total', type: 'counter', value: 23, unit: 'count' },
    { name: 'workflows.success_rate', type: 'gauge', value: 95.6, unit: 'percent' },
    { name: 'agents.active.count', type: 'gauge', value: 4, unit: 'count' },
    { name: 'database.connections.active', type: 'gauge', value: 8, unit: 'count' },
    { name: 'memory.usage', type: 'gauge', value: 67.2, unit: 'percent' },
    { name: 'cpu.usage', type: 'gauge', value: 23.1, unit: 'percent' },
  ];

  for (const metric of metricsData) {
    await prisma.metric.create({
      data: {
        ...metric,
        timestamp: now,
        tags: {
          environment: 'development',
          service: 'api',
        },
      },
    });
  }

  // Create sample notifications
  console.log('🔔 Creating sample notifications...');
  
  await prisma.notification.create({
    data: {
      userId: adminUser.id,
      title: 'Welcome to Urnlabs AI Platform',
      message: 'Your AI agent platform is now ready! Start by creating your first workflow.',
      type: 'info',
      priority: 'normal',
      metadata: {
        actionUrl: '/workflows/new',
        actionText: 'Create Workflow',
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: demoUser.id,
      title: 'Demo Account Created',
      message: 'Your demo account has been created successfully. Explore the platform features!',
      type: 'success',
      priority: 'low',
      metadata: {
        actionUrl: '/dashboard',
        actionText: 'View Dashboard',
      },
    },
  });

  console.log('✅ Database seed completed successfully!');
  console.log(`
📊 Seeded data summary:
• Organizations: 2 (Urnlabs, Demo Org)
• Users: 3 (admin@urnlabs.ai, developer@urnlabs.ai, demo@example.com)  
• Agents: 4 (Code Reviewer, Architect, Deployment, Testing)
• Workflows: 3 (Feature Dev, Bug Fix, Security Audit)
• Integrations: 2 (GitHub, Slack)
• Metrics: 8 sample metrics
• Notifications: 2 welcome messages

🔑 Login credentials (all users):
• Password: password123

🌐 API Documentation:
• http://localhost:3000/docs
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });