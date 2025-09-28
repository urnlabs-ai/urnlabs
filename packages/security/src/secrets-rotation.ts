import { CronJob } from 'cron';
import { SecretsManager } from './secrets-manager';
import { createLogger } from './logger';
import { EventEmitter } from 'events';

const logger = createLogger('SecretsRotation');

export interface RotationRule {
  path: string;
  type: 'password' | 'jwt' | 'encryption' | 'api-key';
  schedule: string; // Cron expression
  enabled: boolean;
  maxAge?: number; // Maximum age in milliseconds
  generator?: () => Promise<any>;
  validator?: (secret: any) => Promise<boolean>;
  onRotate?: (path: string, oldSecret: any, newSecret: any) => Promise<void>;
}

export interface RotationConfig {
  secretsManager: SecretsManager;
  rules: RotationRule[];
  timezone?: string;
  dryRun?: boolean;
}

export class SecretsRotationManager extends EventEmitter {
  private secretsManager: SecretsManager;
  private rules: Map<string, RotationRule> = new Map();
  private jobs: Map<string, CronJob> = new Map();
  private config: RotationConfig;

  constructor(config: RotationConfig) {
    super();
    this.config = config;
    this.secretsManager = config.secretsManager;

    // Register rotation rules
    config.rules.forEach(rule => {
      this.addRotationRule(rule);
    });
  }

  /**
   * Add a rotation rule
   */
  addRotationRule(rule: RotationRule): void {
    logger.info(`Adding rotation rule for path: ${rule.path}`, {
      type: rule.type,
      schedule: rule.schedule,
      enabled: rule.enabled
    });

    this.rules.set(rule.path, rule);

    if (rule.enabled) {
      this.scheduleRotation(rule);
    }
  }

  /**
   * Remove a rotation rule
   */
  removeRotationRule(path: string): void {
    logger.info(`Removing rotation rule for path: ${path}`);

    const job = this.jobs.get(path);
    if (job) {
      job.stop();
      job.destroy();
      this.jobs.delete(path);
    }

    this.rules.delete(path);
  }

  /**
   * Schedule rotation for a rule
   */
  private scheduleRotation(rule: RotationRule): void {
    const job = new CronJob({
      cronTime: rule.schedule,
      onTick: () => this.executeRotation(rule.path),
      start: false,
      timeZone: this.config.timezone || 'UTC'
    });

    this.jobs.set(rule.path, job);
    job.start();

    logger.info(`Scheduled rotation for path: ${rule.path}`, {
      schedule: rule.schedule,
      nextRun: job.nextDate()?.toISOString()
    });
  }

  /**
   * Execute rotation for a specific path
   */
  async executeRotation(path: string): Promise<void> {
    const rule = this.rules.get(path);
    if (!rule || !rule.enabled) {
      logger.warn(`Rotation rule not found or disabled for path: ${path}`);
      return;
    }

    try {
      logger.info(`Starting rotation for path: ${path}`);

      // Get current secret
      const currentSecret = await this.secretsManager.vault.readSecret(path);

      // Check if rotation is needed based on age
      if (rule.maxAge && this.isSecretTooOld(currentSecret, rule.maxAge)) {
        logger.info(`Secret at ${path} is within age limit, skipping rotation`);
        return;
      }

      // Generate new secret
      const newSecret = await this.generateSecret(rule);

      // Validate new secret if validator provided
      if (rule.validator) {
        const isValid = await rule.validator(newSecret);
        if (!isValid) {
          throw new Error(`Generated secret failed validation for path: ${path}`);
        }
      }

      if (this.config.dryRun) {
        logger.info(`[DRY RUN] Would rotate secret at path: ${path}`, { newSecret });
        this.emit('rotation:dry-run', { path, currentSecret, newSecret });
        return;
      }

      // Perform rotation
      await this.secretsManager.vault.rotateSecret(path, newSecret);

      // Invalidate cache
      this.secretsManager.invalidateCache(path);

      // Execute post-rotation callback
      if (rule.onRotate) {
        await rule.onRotate(path, currentSecret, newSecret);
      }

      logger.info(`Successfully rotated secret at path: ${path}`);
      this.emit('rotation:success', { path, timestamp: new Date() });

    } catch (error) {
      logger.error(`Failed to rotate secret at path: ${path}`, error);
      this.emit('rotation:error', { path, error, timestamp: new Date() });
      throw error;
    }
  }

  /**
   * Generate a new secret based on type
   */
  private async generateSecret(rule: RotationRule): Promise<any> {
    if (rule.generator) {
      return await rule.generator();
    }

    switch (rule.type) {
      case 'password':
        return { password: SecretsManager.generatePassword(32) };

      case 'jwt':
        return {
          secret: SecretsManager.generateJWTSecret(),
          algorithm: 'HS256',
          expiration: '1h'
        };

      case 'encryption':
        return {
          key: SecretsManager.generateEncryptionKey(),
          algorithm: 'AES-256-GCM'
        };

      case 'api-key':
        // For API keys, we typically need manual intervention
        // This is just a placeholder
        return { api_key: `generated-${Date.now()}` };

      default:
        throw new Error(`Unknown secret type: ${rule.type}`);
    }
  }

  /**
   * Check if secret is too old based on metadata
   */
  private isSecretTooOld(secret: any, maxAge: number): boolean {
    // This would need to be implemented based on how Vault stores metadata
    // For now, we'll assume rotation is needed
    return true;
  }

  /**
   * Manually trigger rotation for a path
   */
  async triggerRotation(path: string): Promise<void> {
    logger.info(`Manually triggering rotation for path: ${path}`);
    await this.executeRotation(path);
  }

  /**
   * Get rotation status for all rules
   */
  getRotationStatus(): Array<{
    path: string;
    enabled: boolean;
    nextRun?: string;
    lastRun?: string;
  }> {
    return Array.from(this.rules.entries()).map(([path, rule]) => {
      const job = this.jobs.get(path);
      return {
        path,
        enabled: rule.enabled,
        nextRun: job?.nextDate()?.toISOString(),
        lastRun: job?.lastDate()?.toISOString()
      };
    });
  }

  /**
   * Start all enabled rotation jobs
   */
  start(): void {
    logger.info('Starting secrets rotation manager');

    for (const [path, job] of this.jobs.entries()) {
      if (!job.running) {
        job.start();
        logger.debug(`Started rotation job for path: ${path}`);
      }
    }

    this.emit('manager:started');
  }

  /**
   * Stop all rotation jobs
   */
  stop(): void {
    logger.info('Stopping secrets rotation manager');

    for (const [path, job] of this.jobs.entries()) {
      if (job.running) {
        job.stop();
        logger.debug(`Stopped rotation job for path: ${path}`);
      }
    }

    this.emit('manager:stopped');
  }

  /**
   * Destroy all jobs and cleanup
   */
  destroy(): void {
    logger.info('Destroying secrets rotation manager');

    for (const [path, job] of this.jobs.entries()) {
      job.stop();
      job.destroy();
      logger.debug(`Destroyed rotation job for path: ${path}`);
    }

    this.jobs.clear();
    this.rules.clear();
    this.removeAllListeners();

    this.emit('manager:destroyed');
  }
}

/**
 * Default rotation rules for common secrets
 */
export const defaultRotationRules: RotationRule[] = [
  {
    path: 'jwt/main',
    type: 'jwt',
    schedule: '0 0 1 * *', // Monthly
    enabled: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
  {
    path: 'app/encryption',
    type: 'encryption',
    schedule: '0 0 1 */3 *', // Quarterly
    enabled: true,
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
  },
  {
    path: 'database/postgres',
    type: 'password',
    schedule: '0 2 1 * *', // Monthly at 2 AM
    enabled: false, // Disabled by default - requires coordination with database
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    generator: async () => ({
      username: 'postgres',
      password: SecretsManager.generatePassword(32),
      host: 'postgres',
      port: 5432,
      database: 'urnlabs_dev'
    })
  }
];