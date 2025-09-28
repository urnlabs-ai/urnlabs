import { execSync, spawn } from 'child_process';
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface TestJob {
  id: string;
  type: 'unit' | 'integration' | 'e2e' | 'contract';
  command: string;
  workingDirectory: string;
  timeout: number;
  retries: number;
  dependencies?: string[];
  env?: Record<string, string>;
  parallel?: boolean;
}

export interface TestResult {
  jobId: string;
  success: boolean;
  duration: number;
  output: string;
  error?: string;
  coverage?: any;
  retryCount: number;
  timestamp: string;
}

export interface PipelineConfig {
  maxParallelJobs: number;
  enableRetries: boolean;
  maxRetries: number;
  enableFlakyDetection: boolean;
  outputDirectory: string;
  enableNotifications: boolean;
  failFast: boolean;
  timeout: number;
}

export interface PipelineResult {
  success: boolean;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  skippedJobs: number;
  duration: number;
  results: TestResult[];
  coverage: any;
  notifications: string[];
  recommendations: string[];
}

export class TestPipelineOrchestrator extends EventEmitter {
  private config: PipelineConfig;
  private jobs: Map<string, TestJob>;
  private results: Map<string, TestResult>;
  private runningJobs: Set<string>;
  private completedJobs: Set<string>;
  private failedJobs: Set<string>;
  private flakyTests: Map<string, number>;
  private jobQueue: string[];
  private workers: Worker[];

  constructor(config: PipelineConfig) {
    super();
    this.config = config;
    this.jobs = new Map();
    this.results = new Map();
    this.runningJobs = new Set();
    this.completedJobs = new Set();
    this.failedJobs = new Set();
    this.flakyTests = new Map();
    this.jobQueue = [];
    this.workers = [];

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDirectory)) {
      fs.mkdirSync(this.config.outputDirectory, { recursive: true });
    }
  }

  addJob(job: TestJob): void {
    this.jobs.set(job.id, job);
    this.emit('job-added', job);
  }

  addJobs(jobs: TestJob[]): void {
    jobs.forEach(job => this.addJob(job));
  }

  async runPipeline(): Promise<PipelineResult> {
    const startTime = Date.now();
    this.emit('pipeline-started', { timestamp: new Date().toISOString() });

    try {
      // Build dependency graph and execution order
      const executionPlan = this.buildExecutionPlan();
      this.emit('execution-plan-created', { plan: executionPlan });

      // Execute jobs according to plan
      await this.executeJobs(executionPlan);

      // Aggregate results
      const result = this.aggregateResults(startTime);
      this.emit('pipeline-completed', result);

      // Generate reports
      await this.generateReports(result);

      // Send notifications
      if (this.config.enableNotifications) {
        await this.sendNotifications(result);
      }

      return result;

    } catch (error) {
      this.emit('pipeline-failed', { error: error.message });
      throw error;
    }
  }

  private buildExecutionPlan(): string[][] {
    const plan: string[][] = [];
    const visited = new Set<string>();
    const resolved = new Set<string>();

    // Topological sort with parallel execution grouping
    const visit = (jobId: string, currentLevel: string[] = []): void => {
      if (resolved.has(jobId)) return;
      if (visited.has(jobId)) {
        throw new Error(`Circular dependency detected for job: ${jobId}`);
      }

      visited.add(jobId);
      const job = this.jobs.get(jobId);

      if (job && job.dependencies) {
        // Resolve dependencies first
        for (const depId of job.dependencies) {
          if (!resolved.has(depId)) {
            visit(depId);
          }
        }
      }

      // Find the appropriate level for this job
      let level = 0;
      if (job && job.dependencies) {
        for (const depId of job.dependencies) {
          const depLevel = this.findJobLevel(depId, plan);
          level = Math.max(level, depLevel + 1);
        }
      }

      // Add to execution plan
      while (plan.length <= level) {
        plan.push([]);
      }

      if (job && job.parallel !== false) {
        plan[level].push(jobId);
      } else {
        // Sequential job gets its own level
        plan.push([jobId]);
      }

      resolved.add(jobId);
      visited.delete(jobId);
    };

    // Visit all jobs
    for (const jobId of this.jobs.keys()) {
      if (!resolved.has(jobId)) {
        visit(jobId);
      }
    }

    return plan.filter(level => level.length > 0);
  }

  private findJobLevel(jobId: string, plan: string[][]): number {
    for (let i = 0; i < plan.length; i++) {
      if (plan[i].includes(jobId)) {
        return i;
      }
    }
    return -1;
  }

  private async executeJobs(executionPlan: string[][]): Promise<void> {
    for (let level = 0; level < executionPlan.length; level++) {
      const jobsInLevel = executionPlan[level];
      this.emit('level-started', { level, jobs: jobsInLevel });

      if (jobsInLevel.length === 1) {
        // Sequential execution
        await this.executeJob(jobsInLevel[0]);
      } else {
        // Parallel execution
        await this.executeJobsInParallel(jobsInLevel);
      }

      // Check for fail-fast condition
      if (this.config.failFast && this.failedJobs.size > 0) {
        this.emit('pipeline-failed-fast', { failedJobs: Array.from(this.failedJobs) });
        throw new Error('Pipeline failed fast due to job failures');
      }

      this.emit('level-completed', { level, jobs: jobsInLevel });
    }
  }

  private async executeJobsInParallel(jobIds: string[]): Promise<void> {
    const maxConcurrent = Math.min(this.config.maxParallelJobs, jobIds.length);
    const promises: Promise<void>[] = [];
    const semaphore = new Array(maxConcurrent).fill(null);

    let jobIndex = 0;

    const executeNext = async (slotIndex: number): Promise<void> => {
      while (jobIndex < jobIds.length) {
        const currentJobIndex = jobIndex++;
        const jobId = jobIds[currentJobIndex];

        try {
          await this.executeJob(jobId);
        } catch (error) {
          // Job execution error is already handled in executeJob
        }

        // Continue with next job
      }
    };

    // Start parallel execution
    for (let i = 0; i < maxConcurrent; i++) {
      promises.push(executeNext(i));
    }

    await Promise.all(promises);
  }

  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    this.runningJobs.add(jobId);
    this.emit('job-started', { jobId, job });

    const startTime = Date.now();
    let retryCount = 0;
    let lastError: string | undefined;

    while (retryCount <= (this.config.enableRetries ? this.config.maxRetries : 0)) {
      try {
        const result = await this.runJobCommand(job, retryCount);
        const duration = Date.now() - startTime;

        const testResult: TestResult = {
          jobId,
          success: true,
          duration,
          output: result.output,
          retryCount,
          timestamp: new Date().toISOString()
        };

        this.results.set(jobId, testResult);
        this.completedJobs.add(jobId);
        this.runningJobs.delete(jobId);

        // Check for flaky test if this succeeded after retries
        if (retryCount > 0) {
          this.markFlakyTest(jobId, retryCount);
        }

        this.emit('job-completed', { jobId, result: testResult });
        return;

      } catch (error) {
        lastError = error.message;
        retryCount++;

        if (retryCount <= this.config.maxRetries) {
          this.emit('job-retry', { jobId, retryCount, error: lastError });
          await this.delay(1000 * retryCount); // Exponential backoff
        }
      }
    }

    // Job failed after all retries
    const duration = Date.now() - startTime;
    const testResult: TestResult = {
      jobId,
      success: false,
      duration,
      output: '',
      error: lastError,
      retryCount: retryCount - 1,
      timestamp: new Date().toISOString()
    };

    this.results.set(jobId, testResult);
    this.failedJobs.add(jobId);
    this.runningJobs.delete(jobId);

    this.emit('job-failed', { jobId, result: testResult });

    if (this.config.failFast) {
      throw new Error(`Job failed: ${jobId}`);
    }
  }

  private async runJobCommand(job: TestJob, retryCount: number): Promise<{ output: string }> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...job.env };

      // Add retry information to environment
      env.TEST_RETRY_COUNT = retryCount.toString();
      env.TEST_JOB_ID = job.id;

      const childProcess = spawn('sh', ['-c', job.command], {
        cwd: job.workingDirectory,
        env,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new Error(`Job timeout after ${job.timeout}ms`));
      }, job.timeout);

      childProcess.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve({ output: output + errorOutput });
        } else {
          reject(new Error(`Job failed with exit code ${code}: ${errorOutput}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private markFlakyTest(jobId: string, retryCount: number): void {
    if (this.config.enableFlakyDetection) {
      const currentCount = this.flakyTests.get(jobId) || 0;
      this.flakyTests.set(jobId, currentCount + retryCount);
      this.emit('flaky-test-detected', { jobId, totalRetries: currentCount + retryCount });
    }
  }

  private aggregateResults(startTime: number): PipelineResult {
    const duration = Date.now() - startTime;
    const results = Array.from(this.results.values());

    const successfulJobs = results.filter(r => r.success).length;
    const failedJobs = results.filter(r => !r.success).length;
    const skippedJobs = this.jobs.size - this.completedJobs.size - this.failedJobs.size;

    // Aggregate coverage data
    const coverage = this.aggregateCoverage(results);

    // Generate recommendations
    const recommendations = this.generateRecommendations(results);

    // Generate notifications
    const notifications = this.generateNotifications(results);

    return {
      success: failedJobs === 0,
      totalJobs: this.jobs.size,
      successfulJobs,
      failedJobs,
      skippedJobs,
      duration,
      results,
      coverage,
      notifications,
      recommendations
    };
  }

  private aggregateCoverage(results: TestResult[]): any {
    const coverageData = results
      .filter(r => r.coverage)
      .map(r => r.coverage);

    if (coverageData.length === 0) {
      return null;
    }

    // Simple coverage aggregation (in real implementation, use proper coverage merger)
    return {
      statements: this.averageCoverage(coverageData, 'statements'),
      branches: this.averageCoverage(coverageData, 'branches'),
      functions: this.averageCoverage(coverageData, 'functions'),
      lines: this.averageCoverage(coverageData, 'lines')
    };
  }

  private averageCoverage(coverageData: any[], metric: string): number {
    const values = coverageData
      .map(c => c[metric])
      .filter(v => typeof v === 'number');

    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  private generateRecommendations(results: TestResult[]): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    const slowJobs = results.filter(r => r.duration > 30000); // > 30 seconds
    if (slowJobs.length > 0) {
      recommendations.push(`Consider optimizing ${slowJobs.length} slow test jobs that take more than 30 seconds`);
    }

    // Flaky test recommendations
    if (this.flakyTests.size > 0) {
      recommendations.push(`Review ${this.flakyTests.size} flaky tests that required retries`);
    }

    // Parallel execution recommendations
    const serialJobs = Array.from(this.jobs.values()).filter(j => j.parallel === false);
    if (serialJobs.length > 0) {
      recommendations.push(`Consider parallelizing ${serialJobs.length} sequential jobs to improve performance`);
    }

    // Failure pattern recommendations
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      const errorPatterns = this.analyzeErrorPatterns(failedResults);
      recommendations.push(...errorPatterns);
    }

    return recommendations;
  }

  private analyzeErrorPatterns(failedResults: TestResult[]): string[] {
    const patterns: string[] = [];

    // Check for infrastructure failures
    const infraFailures = failedResults.filter(r =>
      r.error?.includes('ECONNREFUSED') ||
      r.error?.includes('timeout') ||
      r.error?.includes('ENOTFOUND')
    );

    if (infraFailures.length > 0) {
      patterns.push(`${infraFailures.length} jobs failed due to infrastructure issues`);
    }

    // Check for environment failures
    const envFailures = failedResults.filter(r =>
      r.error?.includes('environment') ||
      r.error?.includes('ENV') ||
      r.error?.includes('configuration')
    );

    if (envFailures.length > 0) {
      patterns.push(`${envFailures.length} jobs failed due to environment configuration issues`);
    }

    return patterns;
  }

  private generateNotifications(results: TestResult[]): string[] {
    const notifications: string[] = [];

    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      notifications.push(`🚨 ${failedResults.length} test jobs failed`);
    }

    const flakyCount = this.flakyTests.size;
    if (flakyCount > 0) {
      notifications.push(`⚠️  ${flakyCount} flaky tests detected`);
    }

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    if (totalDuration > 300000) { // > 5 minutes
      notifications.push(`⏱️  Pipeline took ${Math.round(totalDuration / 1000)}s to complete`);
    }

    return notifications;
  }

  private async generateReports(result: PipelineResult): Promise<void> {
    // Generate JSON report
    const jsonReport = {
      timestamp: new Date().toISOString(),
      ...result
    };

    await fs.promises.writeFile(
      path.join(this.config.outputDirectory, 'pipeline-report.json'),
      JSON.stringify(jsonReport, null, 2)
    );

    // Generate JUnit XML report
    const junitXml = this.generateJUnitReport(result);
    await fs.promises.writeFile(
      path.join(this.config.outputDirectory, 'pipeline-report.xml'),
      junitXml
    );

    // Generate HTML report
    const htmlReport = this.generateHTMLReport(result);
    await fs.promises.writeFile(
      path.join(this.config.outputDirectory, 'pipeline-report.html'),
      htmlReport
    );

    this.emit('reports-generated', {
      outputDirectory: this.config.outputDirectory
    });
  }

  private generateJUnitReport(result: PipelineResult): string {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Test Pipeline" tests="${result.totalJobs}" failures="${result.failedJobs}" time="${result.duration / 1000}">
  <testsuite name="Test Pipeline" tests="${result.totalJobs}" failures="${result.failedJobs}" time="${result.duration / 1000}">`;

    for (const testResult of result.results) {
      xml += `
    <testcase name="${testResult.jobId}" classname="TestPipeline" time="${testResult.duration / 1000}">`;

      if (!testResult.success && testResult.error) {
        xml += `
      <failure message="${this.escapeXml(testResult.error)}">
        ${this.escapeXml(testResult.output)}
      </failure>`;
      }

      xml += `
    </testcase>`;
    }

    xml += `
  </testsuite>
</testsuites>`;

    return xml;
  }

  private generateHTMLReport(result: PipelineResult): string {
    const statusClass = result.success ? 'success' : 'failure';
    const statusText = result.success ? 'PASSED' : 'FAILED';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Pipeline Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .status { font-size: 24px; font-weight: bold; padding: 10px 20px; border-radius: 5px; }
        .success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .failure { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; }
        .job-list { margin: 20px 0; }
        .job-item { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        .job-success { border-left: 4px solid #28a745; }
        .job-failure { border-left: 4px solid #dc3545; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Test Pipeline Report</h1>
            <div class="status ${statusClass}">${statusText}</div>
        </div>

        <div class="stats">
            <div class="stat-card">
                <h3>Total Jobs</h3>
                <div style="font-size: 24px; font-weight: bold;">${result.totalJobs}</div>
            </div>
            <div class="stat-card">
                <h3>Successful</h3>
                <div style="font-size: 24px; font-weight: bold; color: #28a745;">${result.successfulJobs}</div>
            </div>
            <div class="stat-card">
                <h3>Failed</h3>
                <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${result.failedJobs}</div>
            </div>
            <div class="stat-card">
                <h3>Duration</h3>
                <div style="font-size: 24px; font-weight: bold;">${Math.round(result.duration / 1000)}s</div>
            </div>
        </div>

        <div class="job-list">
            <h3>Job Results</h3>
            ${result.results.map(job => `
                <div class="job-item ${job.success ? 'job-success' : 'job-failure'}">
                    <strong>${job.jobId}</strong> - ${job.success ? 'PASSED' : 'FAILED'} (${Math.round(job.duration / 1000)}s)
                    ${job.retryCount > 0 ? `<span style="color: orange;"> - ${job.retryCount} retries</span>` : ''}
                    ${job.error ? `<div style="color: #dc3545; margin-top: 5px;">Error: ${job.error}</div>` : ''}
                </div>
            `).join('')}
        </div>

        ${result.recommendations.length > 0 ? `
        <div class="recommendations">
            <h3>Recommendations</h3>
            <ul>
                ${result.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        <div style="text-align: center; color: #666; margin-top: 20px;">
            Generated on: ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>`;
  }

  private async sendNotifications(result: PipelineResult): Promise<void> {
    // This would integrate with actual notification services
    // For now, just log notifications
    if (result.notifications.length > 0) {
      console.log('📬 Notifications:');
      result.notifications.forEach(notification => {
        console.log(`  ${notification}`);
      });
    }

    this.emit('notifications-sent', { notifications: result.notifications });
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&#39;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for pipeline management
  getJobStatus(jobId: string): 'pending' | 'running' | 'completed' | 'failed' {
    if (this.runningJobs.has(jobId)) return 'running';
    if (this.completedJobs.has(jobId)) return 'completed';
    if (this.failedJobs.has(jobId)) return 'failed';
    return 'pending';
  }

  getResult(jobId: string): TestResult | undefined {
    return this.results.get(jobId);
  }

  getFlakyTests(): Map<string, number> {
    return new Map(this.flakyTests);
  }

  async cancelPipeline(): Promise<void> {
    this.emit('pipeline-cancelled');
    // Implementation would cancel running jobs
  }
}