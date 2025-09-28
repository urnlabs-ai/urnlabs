import { EventEmitter } from 'events';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import cron from 'node-cron';
import { DependencyScanner } from '../scanners/dependency-scanner.js';
import { SecretScanner } from '../scanners/secret-scanner.js';
import { SastScanner } from '../scanners/sast-scanner.js';
import { DastScanner } from '../scanners/dast-scanner.js';
import { VulnerabilityReporter } from '../reporting/vulnerability-reporter.js';
import { ScanConfig, ScanResult, ScanType, ScanStatus } from '../types/scan-types.js';
import { logger } from '../utils/logger.js';

/**
 * Central orchestrator for coordinating vulnerability scanning activities
 * Manages scan scheduling, execution, and result aggregation
 */
export class ScanOrchestrator extends EventEmitter {
  private redis: Redis;
  private scanQueue: Queue;
  private scanWorker: Worker;
  private dependencyScanner: DependencyScanner;
  private secretScanner: SecretScanner;
  private sastScanner: SastScanner;
  private dastScanner: DastScanner;
  private reporter: VulnerabilityReporter;
  private activeScanJobs: Map<string, Job> = new Map();
  private scanHistory: Map<string, ScanResult[]> = new Map();

  constructor() {
    super();

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    // Initialize scan queue
    this.scanQueue = new Queue('vulnerability-scans', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    // Initialize scanners
    this.dependencyScanner = new DependencyScanner();
    this.secretScanner = new SecretScanner();
    this.sastScanner = new SastScanner();
    this.dastScanner = new DastScanner();
    this.reporter = new VulnerabilityReporter();

    this.setupWorker();
    this.setupScheduledScans();
    this.setupEventListeners();
  }

  /**
   * Initialize the scan worker to process queued scan jobs
   */
  private setupWorker(): void {
    this.scanWorker = new Worker('vulnerability-scans', async (job: Job) => {
      return this.executeScanJob(job);
    }, {
      connection: this.redis,
      concurrency: 3,
      removeOnComplete: 50,
      removeOnFail: 20
    });

    this.scanWorker.on('completed', (job: Job, result: ScanResult) => {
      logger.info(`Scan job completed: ${job.id}`, {
        scanType: result.scanType,
        vulnerabilities: result.vulnerabilities.length
      });
      this.activeScanJobs.delete(job.id as string);
      this.addToHistory(result);
      this.emit('scanCompleted', result);
    });

    this.scanWorker.on('failed', (job: Job, err: Error) => {
      logger.error(`Scan job failed: ${job.id}`, { error: err.message });
      this.activeScanJobs.delete(job.id as string);
      this.emit('scanFailed', { jobId: job.id, error: err.message });
    });
  }

  /**
   * Setup scheduled vulnerability scans
   */
  private setupScheduledScans(): void {
    // Daily dependency vulnerability scans
    cron.schedule('0 2 * * *', () => {
      this.scheduleFullScan({
        scanTypes: ['dependency', 'secrets'],
        repository: process.env.DEFAULT_REPO || '.',
        priority: 'normal',
        config: {
          generateReport: true,
          notifyOnCritical: true
        }
      });
    });

    // Weekly comprehensive scans
    cron.schedule('0 1 * * 0', () => {
      this.scheduleFullScan({
        scanTypes: ['dependency', 'secrets', 'sast', 'dast'],
        repository: process.env.DEFAULT_REPO || '.',
        priority: 'high',
        config: {
          generateReport: true,
          notifyOnCritical: true,
          generateTrends: true
        }
      });
    });

    logger.info('Scheduled vulnerability scans configured');
  }

  /**
   * Setup event listeners for scan orchestration
   */
  private setupEventListeners(): void {
    this.on('scanCompleted', async (result: ScanResult) => {
      // Generate reports for completed scans
      if (result.config?.generateReport) {
        await this.reporter.generateReport(result);
      }

      // Send critical vulnerability notifications
      if (result.config?.notifyOnCritical) {
        await this.notifyCriticalVulnerabilities(result);
      }

      // Update vulnerability database
      await this.updateVulnerabilityDatabase(result);
    });
  }

  /**
   * Schedule a comprehensive vulnerability scan
   */
  async scheduleFullScan(config: {
    scanTypes: ScanType[];
    repository: string;
    priority?: 'low' | 'normal' | 'high';
    config?: Partial<ScanConfig>;
  }): Promise<string> {
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const job = await this.scanQueue.add('full-scan', {
      scanId,
      scanTypes: config.scanTypes,
      repository: config.repository,
      config: {
        generateReport: false,
        notifyOnCritical: false,
        includeDevDependencies: true,
        severity: ['critical', 'high', 'medium'],
        ...config.config
      }
    }, {
      priority: config.priority === 'high' ? 10 : config.priority === 'low' ? 1 : 5,
      jobId: scanId
    });

    this.activeScanJobs.set(scanId, job);

    logger.info(`Scheduled full vulnerability scan: ${scanId}`, {
      scanTypes: config.scanTypes,
      repository: config.repository,
      priority: config.priority
    });

    return scanId;
  }

  /**
   * Schedule individual scan type
   */
  async scheduleScan(scanType: ScanType, config: ScanConfig): Promise<string> {
    const scanId = `${scanType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const job = await this.scanQueue.add('single-scan', {
      scanId,
      scanType,
      config
    }, {
      priority: 5,
      jobId: scanId
    });

    this.activeScanJobs.set(scanId, job);

    logger.info(`Scheduled ${scanType} scan: ${scanId}`, { config });

    return scanId;
  }

  /**
   * Execute a scan job from the queue
   */
  private async executeScanJob(job: Job): Promise<ScanResult> {
    const { scanId, scanType, scanTypes, repository, config } = job.data;

    logger.info(`Executing scan job: ${scanId}`, { scanType, scanTypes });

    try {
      if (scanTypes) {
        // Multi-scan execution
        return await this.executeMultiScan(scanId, scanTypes, repository, config);
      } else {
        // Single scan execution
        return await this.executeSingleScan(scanId, scanType, config);
      }
    } catch (error) {
      logger.error(`Scan execution failed: ${scanId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Execute multiple scan types in parallel
   */
  private async executeMultiScan(
    scanId: string,
    scanTypes: ScanType[],
    repository: string,
    config: ScanConfig
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const scanPromises: Promise<ScanResult>[] = [];

    // Execute scans in parallel
    for (const scanType of scanTypes) {
      const individualConfig = { ...config, repository };
      scanPromises.push(this.executeScanByType(scanType, individualConfig));
    }

    const individualResults = await Promise.allSettled(scanPromises);
    const successfulResults = individualResults
      .filter((result): result is PromiseFulfilledResult<ScanResult> =>
        result.status === 'fulfilled')
      .map(result => result.value);

    const failedScans = individualResults
      .filter((result): result is PromiseRejectedResult =>
        result.status === 'rejected')
      .map(result => result.reason);

    // Aggregate results
    const aggregatedResult: ScanResult = {
      scanId,
      scanType: 'multi' as ScanType,
      status: failedScans.length > 0 ? 'partial' : 'completed',
      startTime: new Date(startTime),
      endTime: new Date(),
      vulnerabilities: successfulResults.flatMap(r => r.vulnerabilities),
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      metadata: {
        repository,
        scanTypes: scanTypes,
        failedScans: failedScans.map(err => err.message)
      },
      config
    };

    // Calculate summary
    aggregatedResult.vulnerabilities.forEach(vuln => {
      aggregatedResult.summary.total++;
      aggregatedResult.summary[vuln.severity]++;
    });

    return aggregatedResult;
  }

  /**
   * Execute a single scan type
   */
  private async executeSingleScan(
    scanId: string,
    scanType: ScanType,
    config: ScanConfig
  ): Promise<ScanResult> {
    return this.executeScanByType(scanType, { ...config, scanId });
  }

  /**
   * Execute scan by type using appropriate scanner
   */
  private async executeScanByType(scanType: ScanType, config: ScanConfig): Promise<ScanResult> {
    switch (scanType) {
      case 'dependency':
        return this.dependencyScanner.scan(config);
      case 'secrets':
        return this.secretScanner.scan(config);
      case 'sast':
        return this.sastScanner.scan(config);
      case 'dast':
        return this.dastScanner.scan(config);
      default:
        throw new Error(`Unsupported scan type: ${scanType}`);
    }
  }

  /**
   * Get scan status
   */
  async getScanStatus(scanId: string): Promise<{ status: ScanStatus; progress?: number }> {
    const job = this.activeScanJobs.get(scanId);

    if (!job) {
      // Check if scan is in history
      const history = Array.from(this.scanHistory.values()).flat();
      const completed = history.find(scan => scan.scanId === scanId);

      if (completed) {
        return { status: completed.status as ScanStatus };
      }

      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      status: state as ScanStatus,
      progress: typeof progress === 'number' ? progress : undefined
    };
  }

  /**
   * Cancel an active scan
   */
  async cancelScan(scanId: string): Promise<boolean> {
    const job = this.activeScanJobs.get(scanId);

    if (!job) {
      return false;
    }

    try {
      await job.remove();
      this.activeScanJobs.delete(scanId);
      logger.info(`Cancelled scan: ${scanId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to cancel scan: ${scanId}`, { error: error.message });
      return false;
    }
  }

  /**
   * Get scan history for a repository
   */
  getScanHistory(repository?: string, limit: number = 50): ScanResult[] {
    const allHistory = Array.from(this.scanHistory.values()).flat();

    let filtered = allHistory;
    if (repository) {
      filtered = allHistory.filter(scan =>
        scan.metadata?.repository === repository
      );
    }

    return filtered
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  /**
   * Add scan result to history
   */
  private addToHistory(result: ScanResult): void {
    const repository = result.metadata?.repository || 'default';

    if (!this.scanHistory.has(repository)) {
      this.scanHistory.set(repository, []);
    }

    const history = this.scanHistory.get(repository)!;
    history.push(result);

    // Keep only last 100 scans per repository
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Notify about critical vulnerabilities
   */
  private async notifyCriticalVulnerabilities(result: ScanResult): Promise<void> {
    const criticalVulns = result.vulnerabilities.filter(v =>
      v.severity === 'critical'
    );

    if (criticalVulns.length > 0) {
      logger.warn(`Critical vulnerabilities found: ${criticalVulns.length}`, {
        scanId: result.scanId,
        repository: result.metadata?.repository
      });

      // Emit event for notification services
      this.emit('criticalVulnerabilities', {
        scanId: result.scanId,
        repository: result.metadata?.repository,
        vulnerabilities: criticalVulns,
        count: criticalVulns.length
      });
    }
  }

  /**
   * Update vulnerability database with scan results
   */
  private async updateVulnerabilityDatabase(result: ScanResult): Promise<void> {
    try {
      // This would integrate with your vulnerability management database
      // For now, we'll cache results in Redis
      await this.redis.setex(
        `scan-result:${result.scanId}`,
        86400 * 7, // 7 days
        JSON.stringify(result)
      );

      logger.debug(`Updated vulnerability database for scan: ${result.scanId}`);
    } catch (error) {
      logger.error(`Failed to update vulnerability database`, {
        scanId: result.scanId,
        error: error.message
      });
    }
  }

  /**
   * Get vulnerability trends and analytics
   */
  async getVulnerabilityTrends(repository: string, days: number = 30): Promise<{
    trends: { date: string; critical: number; high: number; medium: number; low: number }[];
    summary: { current: number; trend: 'up' | 'down' | 'stable'; change: number };
  }> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const history = this.getScanHistory(repository, 1000)
      .filter(scan => scan.startTime >= cutoffDate);

    const trends: { [date: string]: { critical: number; high: number; medium: number; low: number } } = {};

    history.forEach(scan => {
      const dateKey = scan.startTime.toISOString().split('T')[0];
      if (!trends[dateKey]) {
        trends[dateKey] = { critical: 0, high: 0, medium: 0, low: 0 };
      }

      scan.vulnerabilities.forEach(vuln => {
        if (vuln.severity in trends[dateKey]) {
          trends[dateKey][vuln.severity as keyof typeof trends[string]]++;
        }
      });
    });

    const trendArray = Object.entries(trends)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate trend summary
    const recent = trendArray.slice(-7); // Last 7 days
    const previous = trendArray.slice(-14, -7); // Previous 7 days

    const recentTotal = recent.reduce((sum, day) =>
      sum + day.critical + day.high + day.medium + day.low, 0);
    const previousTotal = previous.reduce((sum, day) =>
      sum + day.critical + day.high + day.medium + day.low, 0);

    const change = recentTotal - previousTotal;
    const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'stable';

    return {
      trends: trendArray,
      summary: {
        current: recentTotal,
        trend,
        change: Math.abs(change)
      }
    };
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down scan orchestrator');

    await this.scanWorker.close();
    await this.scanQueue.close();
    await this.redis.quit();
  }
}

export default ScanOrchestrator;