import { faker } from '@faker-js/faker';

export interface TestAgent {
  id: string;
  name: string;
  type: 'automation' | 'analysis' | 'integration' | 'monitoring';
  status: 'active' | 'inactive' | 'error' | 'pending';
  version: string;
  description?: string;
  capabilities: string[];
  configuration: Record<string, any>;
  healthCheck: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck: string;
    responseTime?: number;
  };
  metrics: {
    tasksExecuted: number;
    averageExecutionTime: number;
    successRate: number;
    errorCount: number;
  };
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export const agentFixtures = {
  defaultAgent(): TestAgent {
    return {
      id: faker.string.uuid(),
      name: 'Test Agent',
      type: 'automation',
      status: 'active',
      version: '1.0.0',
      description: 'A test automation agent',
      capabilities: ['file-processing', 'data-validation', 'notification'],
      configuration: {
        maxConcurrentTasks: 5,
        timeout: 30000,
        retryAttempts: 3
      },
      healthCheck: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        responseTime: 150
      },
      metrics: {
        tasksExecuted: 100,
        averageExecutionTime: 2500,
        successRate: 0.95,
        errorCount: 5
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };
  },

  agentWithId(id: string): TestAgent {
    return {
      ...this.defaultAgent(),
      id,
      name: `Agent ${id}`,
      description: `Test agent with ID ${id}`
    };
  },

  randomAgent(overrides: Partial<TestAgent> = {}): TestAgent {
    const type = faker.helpers.arrayElement(['automation', 'analysis', 'integration', 'monitoring']);
    const status = faker.helpers.arrayElement(['active', 'inactive', 'error', 'pending']);

    return {
      id: faker.string.uuid(),
      name: `${faker.word.adjective()} ${faker.word.noun()} Agent`,
      type,
      status,
      version: faker.system.semver(),
      description: faker.lorem.sentence(),
      capabilities: faker.helpers.arrayElements([
        'file-processing', 'data-validation', 'notification',
        'api-integration', 'database-operations', 'monitoring',
        'analytics', 'reporting', 'workflow-automation'
      ], { min: 2, max: 5 }),
      configuration: {
        maxConcurrentTasks: faker.number.int({ min: 1, max: 10 }),
        timeout: faker.number.int({ min: 5000, max: 60000 }),
        retryAttempts: faker.number.int({ min: 1, max: 5 })
      },
      healthCheck: {
        status: faker.helpers.arrayElement(['healthy', 'unhealthy', 'unknown']),
        lastCheck: faker.date.recent().toISOString(),
        responseTime: faker.number.int({ min: 50, max: 1000 })
      },
      metrics: {
        tasksExecuted: faker.number.int({ min: 0, max: 1000 }),
        averageExecutionTime: faker.number.int({ min: 1000, max: 10000 }),
        successRate: faker.number.float({ min: 0.7, max: 1.0, fractionDigits: 2 }),
        errorCount: faker.number.int({ min: 0, max: 50 })
      },
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      ...overrides
    };
  },

  list(count: number = 5): TestAgent[] {
    return Array.from({ length: count }, () => this.randomAgent());
  },

  activeAgent(): TestAgent {
    return {
      ...this.defaultAgent(),
      status: 'active',
      healthCheck: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        responseTime: 120
      }
    };
  },

  inactiveAgent(): TestAgent {
    return {
      ...this.defaultAgent(),
      status: 'inactive',
      healthCheck: {
        status: 'unhealthy',
        lastCheck: faker.date.past().toISOString()
      }
    };
  },

  errorAgent(): TestAgent {
    return {
      ...this.defaultAgent(),
      status: 'error',
      healthCheck: {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        responseTime: 5000
      },
      metrics: {
        tasksExecuted: 50,
        averageExecutionTime: 8000,
        successRate: 0.6,
        errorCount: 20
      }
    };
  },

  withOrganization(organizationId: string): TestAgent {
    return {
      ...this.defaultAgent(),
      organizationId
    };
  },

  byType(type: TestAgent['type']): TestAgent {
    const typeConfigs = {
      automation: {
        capabilities: ['workflow-automation', 'task-scheduling', 'file-processing'],
        description: 'Automated task execution agent'
      },
      analysis: {
        capabilities: ['data-analysis', 'reporting', 'analytics'],
        description: 'Data analysis and reporting agent'
      },
      integration: {
        capabilities: ['api-integration', 'data-sync', 'webhook-processing'],
        description: 'System integration agent'
      },
      monitoring: {
        capabilities: ['health-monitoring', 'alerting', 'performance-tracking'],
        description: 'System monitoring agent'
      }
    };

    return {
      ...this.defaultAgent(),
      type,
      ...typeConfigs[type]
    };
  },

  create(agentData: Partial<TestAgent>): TestAgent {
    return {
      ...this.defaultAgent(),
      id: faker.string.uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...agentData
    };
  }
};