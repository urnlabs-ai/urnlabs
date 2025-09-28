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
    await prisma.performanceMetric.deleteMany();
    await prisma.securityEvent.deleteMany();
    await prisma.complianceRule.deleteMany();
    await prisma.policy.deleteMany();
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

  const _bugFixWorkflow = await prisma.workflow.create({
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

  const _securityAuditWorkflow = await prisma.workflow.create({
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

  // Create governance policies
  console.log('🛡️ Creating governance policies...');

  const dataRetentionPolicy = await prisma.policy.create({
    data: {
      name: 'Data Retention Policy',
      description: 'Automated data retention and cleanup policies for compliance',
      type: 'data_retention',
      category: 'privacy',
      priority: 'high',
      organizationId: urnlabsOrg.id,
      rules: {
        auditLogs: { retentionDays: 2555 }, // 7 years
        metrics: { retentionDays: 365 },
        workflowRuns: { retentionDays: 90 },
        notifications: { retentionDays: 30 },
        securityEvents: { retentionDays: 2555 },
      },
      conditions: {
        triggers: ['data_age', 'storage_threshold'],
        thresholds: { storageGB: 80 },
      },
      actions: {
        archive: { enabled: true, location: 's3://urnlabs-archives' },
        delete: { enabled: true, confirmationRequired: true },
        notify: { enabled: true, recipients: ['admin@urnlabs.ai'] },
      },
      isEnforced: true,
      enforcementMode: 'strict',
    },
  });

  const accessControlPolicy = await prisma.policy.create({
    data: {
      name: 'Role-Based Access Control',
      description: 'Comprehensive access control policies for all platform resources',
      type: 'access_control',
      category: 'security',
      priority: 'critical',
      organizationId: urnlabsOrg.id,
      rules: {
        adminAccess: {
          roles: ['SUPER_ADMIN', 'ADMIN'],
          resources: ['*'],
          actions: ['*'],
        },
        userAccess: {
          roles: ['USER'],
          resources: ['workflows:read', 'agents:read', 'notifications:read'],
          actions: ['read', 'execute'],
        },
        apiAccess: {
          requiresApiKey: true,
          rateLimits: { requestsPerMinute: 100 },
        },
      },
      conditions: {
        ipWhitelist: ['10.0.0.0/8', '172.16.0.0/12'],
        timeRestrictions: { allowedHours: '06:00-22:00' },
      },
      isEnforced: true,
      enforcementMode: 'strict',
    },
  });

  const securityMonitoringPolicy = await prisma.policy.create({
    data: {
      name: 'Security Monitoring & Incident Response',
      description: 'Automated security monitoring with immediate threat response',
      type: 'security',
      category: 'security',
      priority: 'critical',
      organizationId: urnlabsOrg.id,
      rules: {
        failedLoginThreshold: 5,
        suspiciousActivityPatterns: [
          'multiple_failed_logins',
          'unusual_api_usage',
          'privilege_escalation_attempt',
        ],
        blockedCountries: ['CN', 'RU', 'KP'],
        requireMFAForRoles: ['SUPER_ADMIN', 'ADMIN'],
      },
      actions: {
        autoBlock: { enabled: true, duration: 3600 },
        alertAdmins: { enabled: true, channels: ['email', 'slack'] },
        logToSIEM: { enabled: true },
      },
      isEnforced: true,
      enforcementMode: 'strict',
    },
  });

  // Create compliance rules
  console.log('📋 Creating compliance rules...');

  await prisma.complianceRule.create({
    data: {
      name: 'GDPR Data Processing Compliance',
      description: 'Ensure all personal data processing complies with GDPR requirements',
      framework: 'GDPR',
      requirement: 'Article 6 - Lawfulness of processing',
      severity: 'critical',
      organizationId: urnlabsOrg.id,
      policyId: dataRetentionPolicy.id,
      specification: 'All personal data must have a legal basis for processing and be processed transparently',
      controls: {
        consentManagement: { required: true, documented: true },
        dataMinimization: { required: true },
        purposeLimitation: { required: true },
        retentionLimits: { required: true, maxDays: 2555 },
      },
      evidence: {
        documents: ['privacy_policy', 'consent_records', 'data_inventory'],
        procedures: ['data_subject_requests', 'breach_notification'],
      },
      testProcedure: 'Quarterly audit of data processing activities and consent records',
      complianceStatus: 'compliant',
      lastAuditDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      nextAuditDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
    },
  });

  await prisma.complianceRule.create({
    data: {
      name: 'SOC 2 Type II Security Controls',
      description: 'Maintain SOC 2 Type II compliance for security controls',
      framework: 'SOC2',
      requirement: 'CC6.1 - Logical and Physical Access Controls',
      severity: 'high',
      organizationId: urnlabsOrg.id,
      policyId: accessControlPolicy.id,
      specification: 'Implement and maintain logical and physical access controls',
      controls: {
        accessManagement: { required: true, reviewFrequency: 'quarterly' },
        privilegedAccess: { required: true, monitoring: true },
        physicalSecurity: { required: true, documented: true },
      },
      evidence: {
        documents: ['access_control_policy', 'user_access_reviews'],
        procedures: ['access_provisioning', 'access_termination'],
      },
      testProcedure: 'Annual SOC 2 audit with quarterly internal reviews',
      complianceStatus: 'compliant',
      lastAuditDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      nextAuditDate: new Date(Date.now() + 270 * 24 * 60 * 60 * 1000), // 270 days from now
    },
  });

  // Create sample security events
  console.log('🚨 Creating sample security events...');

  await prisma.securityEvent.create({
    data: {
      type: 'policy_violation',
      severity: 'medium',
      status: 'resolved',
      title: 'Unusual API Access Pattern Detected',
      description: 'API access from unusual geographic location during off-hours',
      source: 'automated',
      category: 'authentication',
      organizationId: urnlabsOrg.id,
      policyId: securityMonitoringPolicy.id,
      sourceIp: '203.0.113.42',
      userAgent: 'PostmanRuntime/7.29.0',
      endpoint: '/api/v1/workflows',
      method: 'GET',
      payload: { query: { limit: 100 } },
      metadata: {
        geolocation: { country: 'Unknown', city: 'Unknown' },
        detectionRule: 'unusual_location_access',
      },
      riskScore: 6.5,
      impact: 'medium',
      likelihood: 'medium',
      responseActions: {
        actionsToken: ['ip_monitoring_enabled', 'user_notification_sent'],
        timestamp: new Date(),
      },
      resolution: 'Confirmed legitimate access from employee traveling abroad',
      detectedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      acknowledgedAt: new Date(Date.now() - 23 * 60 * 60 * 1000), // 23 hours ago
      resolvedAt: new Date(Date.now() - 22 * 60 * 60 * 1000), // 22 hours ago
    },
  });

  await prisma.securityEvent.create({
    data: {
      type: 'suspicious_activity',
      severity: 'low',
      status: 'investigating',
      title: 'Multiple Failed Login Attempts',
      description: 'User account experiencing repeated failed login attempts',
      source: 'automated',
      category: 'authentication',
      organizationId: urnlabsOrg.id,
      userId: demoUser.id,
      policyId: securityMonitoringPolicy.id,
      sourceIp: '192.0.2.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      endpoint: '/api/auth/login',
      method: 'POST',
      metadata: {
        failedAttempts: 3,
        timePeriod: '15 minutes',
        detectionRule: 'failed_login_threshold',
      },
      riskScore: 4.2,
      impact: 'low',
      likelihood: 'medium',
      detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      acknowledgedAt: new Date(Date.now() - 90 * 60 * 1000), // 90 minutes ago
    },
  });

  // Create performance metrics
  console.log('📈 Creating performance metrics...');

  const performanceMetrics = [
    {
      name: 'API Response Time',
      category: 'api_response',
      metric: 'response_time',
      value: 142.5,
      unit: 'ms',
      agentId: null,
      workflowId: null,
      endpoint: '/api/v1/workflows',
      environment: 'production',
      threshold: 200,
      isAlert: false,
    },
    {
      name: 'Database Query Performance',
      category: 'database_query',
      metric: 'query_time',
      value: 23.8,
      unit: 'ms',
      environment: 'production',
      threshold: 100,
      isAlert: false,
    },
    {
      name: 'Agent Execution Time',
      category: 'agent_execution',
      metric: 'execution_time',
      value: 8542,
      unit: 'ms',
      agentId: codeReviewerAgent.id,
      environment: 'production',
      threshold: 30000,
      isAlert: false,
    },
    {
      name: 'Workflow Completion Rate',
      category: 'workflow_completion',
      metric: 'success_rate',
      value: 96.7,
      unit: 'percent',
      workflowId: featureDevWorkflow.id,
      environment: 'production',
      threshold: 95,
      isAlert: false,
    },
    {
      name: 'CPU Usage Alert',
      category: 'api_response',
      metric: 'cpu_usage',
      value: 85.2,
      unit: 'percent',
      environment: 'production',
      threshold: 80,
      isAlert: true,
      alertLevel: 'warning',
    },
  ];

  for (const metric of performanceMetrics) {
    await prisma.performanceMetric.create({
      data: {
        ...metric,
        organizationId: urnlabsOrg.id,
        tags: {
          service: 'api',
          instance: 'web-01',
          version: '1.0.0',
        },
      },
    });
  }

  console.log('✅ Database seed completed successfully!');
  console.log(`
📊 Seeded data summary:
• Organizations: 2 (Urnlabs, Demo Org)
• Users: 3 (admin@urnlabs.ai, developer@urnlabs.ai, demo@example.com)
• Agents: 4 (Code Reviewer, Architect, Deployment, Testing)
• Workflows: 3 (Feature Dev, Bug Fix, Security Audit)
• Integrations: 2 (GitHub, Slack)
• Policies: 3 (Data Retention, Access Control, Security Monitoring)
• Compliance Rules: 2 (GDPR, SOC 2 Type II)
• Security Events: 2 (API Access Pattern, Failed Logins)
• Performance Metrics: 5 (API, Database, Agent, Workflow, CPU)
• Legacy Metrics: 8 sample metrics
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