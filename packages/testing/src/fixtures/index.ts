export * from './user';
export * from './agent';
export * from './workflow';

// Organization fixtures
import { faker } from '@faker-js/faker';

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  settings: Record<string, any>;
  subscription: {
    plan: 'free' | 'pro' | 'enterprise';
    status: 'active' | 'cancelled' | 'expired';
    expiresAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const organizationFixtures = {
  defaultOrganization(): TestOrganization {
    return {
      id: faker.string.uuid(),
      name: 'Test Organization',
      slug: 'test-org',
      description: 'A test organization',
      settings: {
        allowPublicWorkflows: false,
        maxAgents: 10,
        maxWorkflows: 50
      },
      subscription: {
        plan: 'pro',
        status: 'active',
        expiresAt: faker.date.future().toISOString()
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };
  },

  randomOrganization(overrides: Partial<TestOrganization> = {}): TestOrganization {
    const name = faker.company.name();
    return {
      id: faker.string.uuid(),
      name,
      slug: faker.helpers.slugify(name).toLowerCase(),
      description: faker.company.catchPhrase(),
      settings: {
        allowPublicWorkflows: faker.datatype.boolean(),
        maxAgents: faker.number.int({ min: 5, max: 100 }),
        maxWorkflows: faker.number.int({ min: 10, max: 500 })
      },
      subscription: {
        plan: faker.helpers.arrayElement(['free', 'pro', 'enterprise']),
        status: faker.helpers.arrayElement(['active', 'cancelled', 'expired']),
        expiresAt: faker.date.future().toISOString()
      },
      createdAt: faker.date.past().toISOString(),
      updatedAt: faker.date.recent().toISOString(),
      ...overrides
    };
  },

  create(orgData: Partial<TestOrganization>): TestOrganization {
    return {
      ...this.defaultOrganization(),
      id: faker.string.uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...orgData
    };
  }
};

// Execution fixtures
export interface TestExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  steps: Array<{
    stepId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: string;
    completedAt?: string;
    output?: any;
    error?: string;
  }>;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: {
    message: string;
    code: string;
    stack?: string;
  };
  metadata: {
    triggeredBy: 'manual' | 'scheduled' | 'webhook' | 'event';
    retryCount: number;
    priority: 'low' | 'normal' | 'high';
  };
}

export const executionFixtures = {
  defaultExecution(): TestExecution {
    const startedAt = faker.date.recent().toISOString();
    const completedAt = faker.date.between({ from: startedAt, to: new Date() }).toISOString();

    return {
      id: faker.string.uuid(),
      workflowId: faker.string.uuid(),
      status: 'completed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      steps: [
        {
          stepId: 'step-1',
          status: 'completed',
          startedAt,
          completedAt,
          output: { result: 'success' }
        }
      ],
      input: { source: 'test' },
      output: { processed: true, count: 100 },
      metadata: {
        triggeredBy: 'manual',
        retryCount: 0,
        priority: 'normal'
      }
    };
  },

  randomExecution(overrides: Partial<TestExecution> = {}): TestExecution {
    const status = faker.helpers.arrayElement(['pending', 'running', 'completed', 'failed', 'cancelled']);
    const startedAt = faker.date.recent().toISOString();
    const completedAt = ['completed', 'failed', 'cancelled'].includes(status)
      ? faker.date.between({ from: startedAt, to: new Date() }).toISOString()
      : undefined;

    return {
      id: faker.string.uuid(),
      workflowId: faker.string.uuid(),
      status,
      startedAt,
      completedAt,
      duration: completedAt ? new Date(completedAt).getTime() - new Date(startedAt).getTime() : undefined,
      steps: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, (_, i) => ({
        stepId: `step-${i + 1}`,
        status: faker.helpers.arrayElement(['pending', 'running', 'completed', 'failed', 'skipped']),
        startedAt: faker.date.recent().toISOString(),
        completedAt: faker.datatype.boolean() ? faker.date.recent().toISOString() : undefined,
        output: faker.datatype.boolean() ? { result: faker.lorem.word() } : undefined
      })),
      input: { [faker.word.noun()]: faker.lorem.word() },
      output: status === 'completed' ? { result: 'success', data: faker.lorem.words() } : undefined,
      error: status === 'failed' ? {
        message: faker.lorem.sentence(),
        code: `ERR_${faker.string.alphanumeric(4).toUpperCase()}`
      } : undefined,
      metadata: {
        triggeredBy: faker.helpers.arrayElement(['manual', 'scheduled', 'webhook', 'event']),
        retryCount: faker.number.int({ min: 0, max: 3 }),
        priority: faker.helpers.arrayElement(['low', 'normal', 'high'])
      },
      ...overrides
    };
  }
};