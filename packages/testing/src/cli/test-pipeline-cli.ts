#!/usr/bin/env node

import { program } from 'commander';
import { TestPipelineOrchestrator } from '../services/test-pipeline';
import {
  defaultPipelineConfig,
  ciPipelineConfig,
  quickPipelineConfig,
  createDefaultTestJobs,
  createWorkspaceTestJobs,
  createPerformanceTestJobs,
  createSecurityTestJobs,
  createDataManagementTestJobs
} from '../config/pipeline.config';
import fs from 'fs';
import path from 'path';

program
  .name('test-pipeline')
  .description('Advanced test pipeline orchestrator with parallel execution')
  .version('1.0.0');

program
  .command('run')
  .description('Run the test pipeline')
  .option('-c, --config <path>', 'Custom pipeline configuration file')
  .option('-p, --preset <preset>', 'Pipeline preset (default|ci|quick)', 'default')
  .option('-j, --jobs <path>', 'Custom jobs configuration file')
  .option('-w, --workspace', 'Run workspace-wide tests')
  .option('--performance', 'Include performance tests')
  .option('--security', 'Include security tests')
  .option('--data-management', 'Include data management tests')
  .option('--parallel <count>', 'Max parallel jobs', '4')
  .option('--fail-fast', 'Stop on first failure')
  .option('--no-retries', 'Disable retry mechanism')
  .option('--output <dir>', 'Output directory for reports', './test-results')
  .option('--timeout <ms>', 'Global timeout in milliseconds', '300000')
  .option('--verbose', 'Verbose output')
  .option('--watch', 'Watch mode for continuous testing')
  .action(async (options) => {
    try {
      const projectRoot = process.cwd();

      // Load pipeline configuration
      let config = getPipelineConfig(options.preset);

      if (options.config) {
        const customConfigPath = path.resolve(options.config);
        if (fs.existsSync(customConfigPath)) {
          const customConfig = require(customConfigPath);
          config = { ...config, ...customConfig };
        } else {
          console.error(`Configuration file not found: ${customConfigPath}`);
          process.exit(1);
        }
      }

      // Apply CLI overrides
      if (options.parallel) {
        config.maxParallelJobs = parseInt(options.parallel);
      }
      if (options.failFast) {
        config.failFast = true;
      }
      if (options.noRetries) {
        config.enableRetries = false;
      }
      if (options.output) {
        config.outputDirectory = options.output;
      }
      if (options.timeout) {
        config.timeout = parseInt(options.timeout);
      }

      // Create orchestrator
      const orchestrator = new TestPipelineOrchestrator(config);

      // Set up event listeners for verbose output
      if (options.verbose) {
        setupVerboseLogging(orchestrator);
      }

      // Load test jobs
      let jobs = [];

      if (options.jobs) {
        const jobsConfigPath = path.resolve(options.jobs);
        if (fs.existsSync(jobsConfigPath)) {
          jobs = require(jobsConfigPath);
        } else {
          console.error(`Jobs configuration file not found: ${jobsConfigPath}`);
          process.exit(1);
        }
      } else {
        // Create default job sets based on options
        if (options.workspace) {
          jobs = createWorkspaceTestJobs(projectRoot);
        } else {
          jobs = createDefaultTestJobs(projectRoot);
        }

        if (options.performance) {
          jobs.push(...createPerformanceTestJobs(projectRoot));
        }

        if (options.security) {
          jobs.push(...createSecurityTestJobs(projectRoot));
        }

        if (options.dataManagement) {
          jobs.push(...createDataManagementTestJobs(projectRoot));
        }
      }

      orchestrator.addJobs(jobs);

      if (options.verbose) {
        console.log(`🚀 Starting test pipeline with ${jobs.length} jobs`);
        console.log(`📊 Configuration: ${JSON.stringify(config, null, 2)}`);
      }

      // Run the pipeline
      if (options.watch) {
        await runWatchMode(orchestrator, options);
      } else {
        const result = await orchestrator.runPipeline();

        // Print summary
        printPipelineSummary(result, options.verbose);

        // Exit with appropriate code
        process.exit(result.success ? 0 : 1);
      }

    } catch (error) {
      console.error('Pipeline execution failed:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show pipeline status')
  .option('-f, --file <path>', 'Pipeline report file', './test-results/pipeline-report.json')
  .action((options) => {
    try {
      if (!fs.existsSync(options.file)) {
        console.error(`Report file not found: ${options.file}`);
        process.exit(1);
      }

      const report = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
      printPipelineSummary(report, true);

    } catch (error) {
      console.error('Error reading pipeline status:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize pipeline configuration')
  .option('-p, --preset <preset>', 'Pipeline preset (default|ci|quick)', 'default')
  .option('-o, --output <path>', 'Configuration output path', 'test-pipeline.config.js')
  .action((options) => {
    const config = getPipelineConfig(options.preset);
    const configFile = `module.exports = ${JSON.stringify(config, null, 2)};`;

    fs.writeFileSync(options.output, configFile);
    console.log(`Pipeline configuration created: ${options.output}`);
  });

program
  .command('jobs')
  .description('Generate default job configuration')
  .option('-w, --workspace', 'Generate workspace jobs')
  .option('--performance', 'Include performance jobs')
  .option('--security', 'Include security jobs')
  .option('--data-management', 'Include data management jobs')
  .option('-o, --output <path>', 'Jobs output path', 'test-jobs.config.js')
  .action((options) => {
    const projectRoot = process.cwd();
    let jobs = [];

    if (options.workspace) {
      jobs = createWorkspaceTestJobs(projectRoot);
    } else {
      jobs = createDefaultTestJobs(projectRoot);
    }

    if (options.performance) {
      jobs.push(...createPerformanceTestJobs(projectRoot));
    }

    if (options.security) {
      jobs.push(...createSecurityTestJobs(projectRoot));
    }

    if (options.dataManagement) {
      jobs.push(...createDataManagementTestJobs(projectRoot));
    }

    const jobsFile = `module.exports = ${JSON.stringify(jobs, null, 2)};`;
    fs.writeFileSync(options.output, jobsFile);
    console.log(`Jobs configuration created: ${options.output}`);
  });

program
  .command('validate')
  .description('Validate pipeline configuration and jobs')
  .option('-c, --config <path>', 'Pipeline configuration file')
  .option('-j, --jobs <path>', 'Jobs configuration file')
  .action((options) => {
    try {
      let config = defaultPipelineConfig;
      let jobs = [];

      if (options.config) {
        config = require(path.resolve(options.config));
      }

      if (options.jobs) {
        jobs = require(path.resolve(options.jobs));
      } else {
        jobs = createDefaultTestJobs(process.cwd());
      }

      // Validate configuration
      const configErrors = validatePipelineConfig(config);
      if (configErrors.length > 0) {
        console.error('❌ Configuration validation failed:');
        configErrors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

      // Validate jobs
      const jobErrors = validateJobs(jobs);
      if (jobErrors.length > 0) {
        console.error('❌ Jobs validation failed:');
        jobErrors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

      console.log('✅ Pipeline configuration and jobs are valid');

    } catch (error) {
      console.error('Validation failed:', error);
      process.exit(1);
    }
  });

function getPipelineConfig(preset: string) {
  switch (preset) {
    case 'ci':
      return ciPipelineConfig;
    case 'quick':
      return quickPipelineConfig;
    case 'default':
    default:
      return defaultPipelineConfig;
  }
}

function setupVerboseLogging(orchestrator: TestPipelineOrchestrator) {
  orchestrator.on('pipeline-started', () => {
    console.log('🚀 Pipeline started');
  });

  orchestrator.on('level-started', ({ level, jobs }) => {
    console.log(`📋 Level ${level} started with jobs: ${jobs.join(', ')}`);
  });

  orchestrator.on('job-started', ({ jobId }) => {
    console.log(`▶️  Job started: ${jobId}`);
  });

  orchestrator.on('job-completed', ({ jobId, result }) => {
    console.log(`✅ Job completed: ${jobId} (${Math.round(result.duration / 1000)}s)`);
  });

  orchestrator.on('job-failed', ({ jobId, result }) => {
    console.log(`❌ Job failed: ${jobId} - ${result.error}`);
  });

  orchestrator.on('job-retry', ({ jobId, retryCount, error }) => {
    console.log(`🔄 Job retry ${retryCount}: ${jobId} - ${error}`);
  });

  orchestrator.on('flaky-test-detected', ({ jobId, totalRetries }) => {
    console.log(`⚠️  Flaky test detected: ${jobId} (${totalRetries} total retries)`);
  });

  orchestrator.on('level-completed', ({ level }) => {
    console.log(`✅ Level ${level} completed`);
  });

  orchestrator.on('pipeline-completed', (result) => {
    console.log(`🎉 Pipeline completed: ${result.success ? 'SUCCESS' : 'FAILURE'}`);
  });

  orchestrator.on('reports-generated', ({ outputDirectory }) => {
    console.log(`📊 Reports generated in: ${outputDirectory}`);
  });
}

async function runWatchMode(orchestrator: TestPipelineOrchestrator, options: any) {
  console.log('👀 Starting watch mode...');
  console.log('Press Ctrl+C to exit');

  // Simple file watcher implementation
  const watchPaths = ['src', 'test', 'tests'];
  const { watch } = await import('chokidar');

  const watcher = watch(watchPaths, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
  });

  let isRunning = false;

  const runPipeline = async () => {
    if (isRunning) {
      console.log('⏳ Pipeline already running, skipping...');
      return;
    }

    isRunning = true;
    try {
      console.log('\n🔄 File changes detected, running pipeline...');
      const result = await orchestrator.runPipeline();
      printPipelineSummary(result, options.verbose);
    } catch (error) {
      console.error('Pipeline failed:', error);
    } finally {
      isRunning = false;
    }
  };

  watcher.on('change', () => {
    setTimeout(runPipeline, 1000); // Debounce changes
  });

  // Run initial pipeline
  await runPipeline();

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping watch mode...');
    watcher.close();
    process.exit(0);
  });
}

function printPipelineSummary(result: any, verbose: boolean = false) {
  console.log('\n📊 Pipeline Summary');
  console.log('==================');
  console.log(`Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Total Jobs: ${result.totalJobs}`);
  console.log(`Successful: ${result.successfulJobs}`);
  console.log(`Failed: ${result.failedJobs}`);
  console.log(`Duration: ${Math.round(result.duration / 1000)}s`);

  if (result.failedJobs > 0) {
    console.log('\n❌ Failed Jobs:');
    result.results.filter((r: any) => !r.success).forEach((r: any) => {
      console.log(`  - ${r.jobId}: ${r.error}`);
    });
  }

  if (result.notifications.length > 0) {
    console.log('\n📬 Notifications:');
    result.notifications.forEach((notification: string) => {
      console.log(`  ${notification}`);
    });
  }

  if (result.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    result.recommendations.forEach((rec: string) => {
      console.log(`  - ${rec}`);
    });
  }

  if (verbose && result.results.length > 0) {
    console.log('\n📋 Job Details:');
    result.results.forEach((r: any) => {
      const status = r.success ? '✅' : '❌';
      const duration = Math.round(r.duration / 1000);
      const retries = r.retryCount > 0 ? ` (${r.retryCount} retries)` : '';
      console.log(`  ${status} ${r.jobId}: ${duration}s${retries}`);
    });
  }
}

function validatePipelineConfig(config: any): string[] {
  const errors: string[] = [];

  if (typeof config.maxParallelJobs !== 'number' || config.maxParallelJobs < 1) {
    errors.push('maxParallelJobs must be a positive number');
  }

  if (typeof config.timeout !== 'number' || config.timeout < 1000) {
    errors.push('timeout must be at least 1000ms');
  }

  if (typeof config.outputDirectory !== 'string') {
    errors.push('outputDirectory must be a string');
  }

  return errors;
}

function validateJobs(jobs: any[]): string[] {
  const errors: string[] = [];

  if (!Array.isArray(jobs)) {
    errors.push('Jobs must be an array');
    return errors;
  }

  const jobIds = new Set<string>();

  jobs.forEach((job, index) => {
    if (!job.id) {
      errors.push(`Job at index ${index} missing id`);
    } else if (jobIds.has(job.id)) {
      errors.push(`Duplicate job id: ${job.id}`);
    } else {
      jobIds.add(job.id);
    }

    if (!job.command) {
      errors.push(`Job ${job.id || index} missing command`);
    }

    if (!job.workingDirectory) {
      errors.push(`Job ${job.id || index} missing workingDirectory`);
    }

    if (job.dependencies) {
      job.dependencies.forEach((depId: string) => {
        if (!jobs.find(j => j.id === depId)) {
          errors.push(`Job ${job.id} depends on non-existent job: ${depId}`);
        }
      });
    }
  });

  return errors;
}

if (require.main === module) {
  program.parse();
}