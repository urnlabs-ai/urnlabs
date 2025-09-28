import { faker } from '@faker-js/faker';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'condition' | 'parallel' | 'sequential';
  agentId?: string;
  configuration: Record<string, any>;
  dependencies?: string[];
}

export interface TestWorkflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  status: 'draft' | 'active' | 'inactive' | 'archived';
  definition: {
    steps: WorkflowStep[];
    triggers?: Array<{
      type: 'manual' | 'scheduled' | 'webhook' | 'event';
      configuration: Record<string, any>;
    }>;
    variables?: Record<string, any>;
  };
  metadata: {
    tags: string[];
    category: string;
    estimatedDuration?: number;
  };
  execution: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
    lastRun?: string;
  };
  organizationId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const workflowFixtures = {
  defaultWorkflow(): TestWorkflow {
    return {
      id: faker.string.uuid(),
      name: 'Test Workflow',
      description: 'A test workflow for automation',
      version: '1.0.0',
      status: 'active',
      definition: {
        steps: [
          {
            id: 'step-1',
            name: 'Initialize',
            type: 'action',
            configuration: {
              action: 'initialize-data',
              parameters: { source: 'database' }
            }
          },
          {
            id: 'step-2',
            name: 'Process Data',
            type: 'action',
            agentId: faker.string.uuid(),
            configuration: {
              action: 'process-data',
              parameters: { format: 'json' }
            },
            dependencies: ['step-1']
          },
          {
            id: 'step-3',
            name: 'Send Notification',
            type: 'action',
            configuration: {
              action: 'send-notification',
              parameters: { channel: 'email' }
            },
            dependencies: ['step-2']
          }
        ],
        triggers: [
          {
            type: 'scheduled',
            configuration: { cron: '0 9 * * *' }
          }
        ],
        variables: {
          environment: 'test',
          maxRetries: 3
        }
      },
      metadata: {
        tags: ['automation', 'test'],
        category: 'data-processing',
        estimatedDuration: 300000
      },
      execution: {
        totalRuns: 25,
        successfulRuns: 23,
        failedRuns: 2,
        averageDuration: 280000,
        lastRun: faker.date.recent().toISOString()
      },
      createdBy: faker.string.uuid(),
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };
  },

  workflowWithId(id: string): TestWorkflow {
    return {
      ...this.defaultWorkflow(),
      id,
      name: `Workflow ${id}`,
      description: `Test workflow with ID ${id}`
    };
  },

  randomWorkflow(overrides: Partial<TestWorkflow> = {}): TestWorkflow {
    const stepCount = faker.number.int({ min: 2, max: 8 });
    const steps: WorkflowStep[] = [];

    for (let i = 0; i < stepCount; i++) {
      steps.push({
        id: `step-${i + 1}`,
        name: faker.word.words(2),
        type: faker.helpers.arrayElement(['action', 'condition', 'parallel', 'sequential']),
        agentId: i > 0 ? faker.string.uuid() : undefined,
        configuration: {
          action: faker.word.verb(),
          parameters: {
            [faker.word.noun()]: faker.lorem.word(),
            timeout: faker.number.int({ min: 5000, max: 30000 })
          }
        },
        dependencies: i > 0 ? [`step-${i}`] : undefined
      });
    }

    return {
      id: faker.string.uuid(),
      name: `${faker.word.adjective()} ${faker.word.noun()} Workflow`,
      description: faker.lorem.sentence(),
      version: faker.system.semver(),
      status: faker.helpers.arrayElement(['draft', 'active', 'inactive', 'archived']),
      definition: {
        steps,
        triggers: [
          {
            type: faker.helpers.arrayElement(['manual', 'scheduled', 'webhook', 'event']),
            configuration: {
              interval: faker.number.int({ min: 3600, max: 86400 })
            }
          }
        ],
        variables: {
          environment: faker.helpers.arrayElement(['test', 'staging', 'production']),
          maxRetries: faker.number.int({ min: 1, max: 5 }),
          timeout: faker.number.int({ min: 30000, max: 300000 })
        }
      },
      metadata: {
        tags: faker.helpers.arrayElements([
          'automation', 'integration', 'data-processing',
          'monitoring', 'notification', 'reporting'
        ], { min: 1, max: 3 }),
        category: faker.helpers.arrayElement([
          'data-processing', 'integration', 'monitoring',
          'notification', 'reporting', 'maintenance'
        ]),
        estimatedDuration: faker.number.int({ min: 60000, max: 1800000 })
      },
      execution: {
        totalRuns: faker.number.int({ min: 0, max: 100 }),
        successfulRuns: faker.number.int({ min: 0, max: 90 }),
        failedRuns: faker.number.int({ min: 0, max: 10 }),
        averageDuration: faker.number.int({ min: 30000, max: 600000 }),
        lastRun: faker.date.recent().toISOString()
      },
      createdBy: faker.string.uuid(),
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      ...overrides
    };
  },

  list(count: number = 5): TestWorkflow[] {
    return Array.from({ length: count }, () => this.randomWorkflow());
  },

  simpleWorkflow(): TestWorkflow {
    return {
      ...this.defaultWorkflow(),
      definition: {
        steps: [
          {
            id: 'step-1',
            name: 'Simple Action',
            type: 'action',
            configuration: {
              action: 'log-message',
              parameters: { message: 'Hello World' }
            }
          }
        ]
      },
      metadata: {
        tags: ['simple', 'test'],
        category: 'basic'
      }
    };
  },

  complexWorkflow(): TestWorkflow {
    return {
      ...this.defaultWorkflow(),
      definition: {
        steps: [
          {
            id: 'init',
            name: 'Initialize',
            type: 'action',
            configuration: { action: 'init' }
          },
          {
            id: 'parallel-1',
            name: 'Parallel Processing',
            type: 'parallel',
            configuration: { parallelSteps: ['process-a', 'process-b'] },
            dependencies: ['init']
          },
          {
            id: 'process-a',
            name: 'Process A',
            type: 'action',
            agentId: faker.string.uuid(),
            configuration: { action: 'process-data-a' }
          },
          {
            id: 'process-b',
            name: 'Process B',
            type: 'action',
            agentId: faker.string.uuid(),
            configuration: { action: 'process-data-b' }
          },
          {
            id: 'condition',
            name: 'Check Results',
            type: 'condition',
            configuration: {
              condition: 'success',
              onTrue: 'finalize',
              onFalse: 'retry'
            },
            dependencies: ['parallel-1']
          },
          {
            id: 'finalize',
            name: 'Finalize',
            type: 'action',
            configuration: { action: 'finalize' }
          }
        ],
        triggers: [
          {
            type: 'webhook',
            configuration: { endpoint: '/trigger/complex' }
          },
          {
            type: 'scheduled',
            configuration: { cron: '0 */6 * * *' }
          }
        ]
      },
      metadata: {
        tags: ['complex', 'parallel', 'conditional'],
        category: 'advanced',
        estimatedDuration: 900000
      }
    };
  },

  withOrganization(organizationId: string): TestWorkflow {
    return {
      ...this.defaultWorkflow(),
      organizationId
    };
  },

  byStatus(status: TestWorkflow['status']): TestWorkflow {
    return {
      ...this.defaultWorkflow(),
      status
    };
  },

  create(workflowData: Partial<TestWorkflow>): TestWorkflow {
    return {
      ...this.defaultWorkflow(),
      id: faker.string.uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...workflowData
    };
  }
};