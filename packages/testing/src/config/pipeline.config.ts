import { PipelineConfig, TestJob } from '../services/test-pipeline';
import path from 'path';

export const defaultPipelineConfig: PipelineConfig = {
  maxParallelJobs: 4,
  enableRetries: true,
  maxRetries: 2,
  enableFlakyDetection: true,
  outputDirectory: './test-results',
  enableNotifications: true,
  failFast: false,
  timeout: 300000 // 5 minutes
};

export const ciPipelineConfig: PipelineConfig = {
  maxParallelJobs: 8,
  enableRetries: true,
  maxRetries: 3,
  enableFlakyDetection: true,
  outputDirectory: './test-results',
  enableNotifications: true,
  failFast: true,
  timeout: 600000 // 10 minutes
};

export const quickPipelineConfig: PipelineConfig = {
  maxParallelJobs: 6,
  enableRetries: false,
  maxRetries: 0,
  enableFlakyDetection: false,
  outputDirectory: './test-results',
  enableNotifications: false,
  failFast: true,
  timeout: 120000 // 2 minutes
};

export function createDefaultTestJobs(projectRoot: string): TestJob[] {
  return [
    {
      id: 'unit-tests',
      type: 'unit',
      command: 'pnpm run test:run',
      workingDirectory: projectRoot,
      timeout: 120000,
      retries: 2,
      parallel: true,
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      id: 'unit-tests-coverage',
      type: 'unit',
      command: 'pnpm run test:coverage',
      workingDirectory: projectRoot,
      timeout: 180000,
      retries: 1,
      dependencies: ['unit-tests'],
      parallel: false,
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      id: 'integration-tests',
      type: 'integration',
      command: 'pnpm run test:integration',
      workingDirectory: projectRoot,
      timeout: 300000,
      retries: 3,
      dependencies: ['unit-tests'],
      parallel: true,
      env: {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/urnlabs_test'
      }
    },
    {
      id: 'contract-tests',
      type: 'contract',
      command: 'pnpm run test:contract',
      workingDirectory: projectRoot,
      timeout: 180000,
      retries: 2,
      dependencies: ['unit-tests'],
      parallel: true,
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      id: 'e2e-tests',
      type: 'e2e',
      command: 'pnpm run test:e2e',
      workingDirectory: projectRoot,
      timeout: 600000,
      retries: 3,
      dependencies: ['integration-tests'],
      parallel: false,
      env: {
        NODE_ENV: 'test',
        E2E_BASE_URL: 'http://localhost:7000'
      }
    },
    {
      id: 'quality-gates',
      type: 'unit',
      command: 'pnpm run quality:check',
      workingDirectory: projectRoot,
      timeout: 240000,
      retries: 1,
      dependencies: ['unit-tests-coverage', 'integration-tests'],
      parallel: false,
      env: {
        NODE_ENV: 'test'
      }
    }
  ];
}

export function createWorkspaceTestJobs(workspaceRoot: string): TestJob[] {
  const jobs: TestJob[] = [];

  // Define workspace packages that need testing
  const packages = [
    'packages/testing',
    'packages/ai-agents',
    'packages/monitoring',
    'packages/security',
    'apps/api',
    'apps/agents',
    'apps/gateway'
  ];

  packages.forEach((pkg, index) => {
    const packagePath = path.join(workspaceRoot, pkg);
    const packageName = pkg.replace('/', '-');

    // Unit tests for each package
    jobs.push({
      id: `${packageName}-unit`,
      type: 'unit',
      command: 'pnpm run test:run',
      workingDirectory: packagePath,
      timeout: 120000,
      retries: 2,
      parallel: true,
      env: {
        NODE_ENV: 'test'
      }
    });

    // Integration tests for apps only
    if (pkg.startsWith('apps/')) {
      jobs.push({
        id: `${packageName}-integration`,
        type: 'integration',
        command: 'pnpm run test:integration',
        workingDirectory: packagePath,
        timeout: 300000,
        retries: 3,
        dependencies: [`${packageName}-unit`],
        parallel: true,
        env: {
          NODE_ENV: 'test',
          TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/urnlabs_test'
        }
      });
    }
  });

  // E2E tests run after all integration tests
  const integrationJobs = jobs.filter(j => j.type === 'integration').map(j => j.id);

  jobs.push({
    id: 'e2e-full-stack',
    type: 'e2e',
    command: 'pnpm run test:e2e',
    workingDirectory: path.join(workspaceRoot, 'packages/testing'),
    timeout: 900000, // 15 minutes
    retries: 3,
    dependencies: integrationJobs.length > 0 ? integrationJobs : ['packages-testing-unit'],
    parallel: false,
    env: {
      NODE_ENV: 'test',
      E2E_BASE_URL: 'http://localhost:7000'
    }
  });

  // Quality gates run after coverage collection
  jobs.push({
    id: 'workspace-quality-gates',
    type: 'unit',
    command: 'pnpm run quality:check',
    workingDirectory: workspaceRoot,
    timeout: 300000,
    retries: 1,
    dependencies: jobs.filter(j => j.type === 'unit' || j.type === 'integration').map(j => j.id),
    parallel: false,
    env: {
      NODE_ENV: 'test'
    }
  });

  return jobs;
}

export function createPerformanceTestJobs(projectRoot: string): TestJob[] {
  return [
    {
      id: 'performance-api',
      type: 'integration',
      command: 'pnpm run test:performance:api',
      workingDirectory: projectRoot,
      timeout: 600000,
      retries: 1,
      parallel: true,
      env: {
        NODE_ENV: 'test',
        PERFORMANCE_TEST: 'true'
      }
    },
    {
      id: 'performance-load',
      type: 'e2e',
      command: 'pnpm run test:performance:load',
      workingDirectory: projectRoot,
      timeout: 900000,
      retries: 0,
      dependencies: ['performance-api'],
      parallel: false,
      env: {
        NODE_ENV: 'test',
        LOAD_TEST: 'true'
      }
    }
  ];
}

export function createSecurityTestJobs(projectRoot: string): TestJob[] {
  return [
    {
      id: 'security-scan',
      type: 'unit',
      command: 'pnpm run security:scan',
      workingDirectory: projectRoot,
      timeout: 300000,
      retries: 1,
      parallel: true,
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      id: 'dependency-audit',
      type: 'unit',
      command: 'pnpm audit --audit-level moderate',
      workingDirectory: projectRoot,
      timeout: 120000,
      retries: 1,
      parallel: true,
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      id: 'security-tests',
      type: 'integration',
      command: 'pnpm run test:security',
      workingDirectory: projectRoot,
      timeout: 600000,
      retries: 2,
      dependencies: ['security-scan'],
      parallel: false,
      env: {
        NODE_ENV: 'test',
        SECURITY_TEST: 'true'
      }
    }
  ];
}

export function createDataManagementTestJobs(projectRoot: string): TestJob[] {
  return [
    {
      id: 'data-preparation',
      type: 'unit',
      command: 'tsx src/cli/test-data-cli.ts generate --schema users --count 1000 --output ./test-results/test-users.json',
      workingDirectory: path.join(projectRoot, 'packages/testing'),
      timeout: 180000,
      retries: 2,
      parallel: true,
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      id: 'data-masking-validation',
      type: 'unit',
      command: 'tsx src/cli/test-data-cli.ts mask --input ./test-results/test-users.json --output ./test-results/masked-users.json --fields email,phone,ssn',
      workingDirectory: path.join(projectRoot, 'packages/testing'),
      timeout: 120000,
      retries: 1,
      dependencies: ['data-preparation'],
      parallel: false,
      env: {
        NODE_ENV: 'test'
      }
    },
    {
      id: 'performance-data-generation',
      type: 'integration',
      command: 'tsx src/cli/test-data-cli.ts performance --type load --size large --output ./test-results/performance-data',
      workingDirectory: path.join(projectRoot, 'packages/testing'),
      timeout: 600000,
      retries: 1,
      dependencies: ['data-preparation'],
      parallel: true,
      env: {
        NODE_ENV: 'test',
        PERFORMANCE_DATA: 'true'
      }
    },
    {
      id: 'data-validation',
      type: 'unit',
      command: 'tsx src/cli/test-data-cli.ts validate --input ./test-results/test-users.json --schema users',
      workingDirectory: path.join(projectRoot, 'packages/testing'),
      timeout: 60000,
      retries: 1,
      dependencies: ['data-preparation'],
      parallel: true,
      env: {
        NODE_ENV: 'test'
      }
    }
  ];
}