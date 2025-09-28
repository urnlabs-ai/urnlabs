import { VaultClient, VaultConfig } from './vault-client';
import { createLogger } from './logger';

const logger = createLogger('SecretsManager');

export interface SecretsManagerConfig {
  vault: VaultConfig;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface CachedSecret {
  value: any;
  expiresAt: Date;
}

export class SecretsManager {
  private vault: VaultClient;
  private cache: Map<string, CachedSecret> = new Map();
  private config: SecretsManagerConfig;
  private cacheCleanupInterval?: NodeJS.Timeout;

  constructor(config: SecretsManagerConfig) {
    this.config = {
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.vault = new VaultClient(config.vault);

    if (this.config.cacheEnabled) {
      this.startCacheCleanup();
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupCache();
    }, 60000); // Clean every minute
  }

  /**
   * Clean expired cache entries
   */
  private cleanupCache(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now >= cached.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Get from cache or fetch from Vault
   */
  private async getFromCacheOrVault<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(key);
      if (cached && new Date() < cached.expiresAt) {
        logger.debug(`Cache hit for key: ${key}`);
        return cached.value;
      }
    }

    // Fetch from Vault with retry logic
    const value = await this.withRetry(fetcher);

    // Cache the result
    if (this.config.cacheEnabled) {
      const expiresAt = new Date(Date.now() + this.config.cacheTTL!);
      this.cache.set(key, { value, expiresAt });
      logger.debug(`Cached value for key: ${key}, expires: ${expiresAt.toISOString()}`);
    }

    return value;
  }

  /**
   * Retry logic wrapper
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt} failed, retrying...`, { error: error.message });

        if (attempt < this.config.retryAttempts!) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay! * attempt));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get database configuration
   */
  async getDatabaseConfig(): Promise<{
    username: string;
    password: string;
    host: string;
    port: number;
    database: string;
    url: string;
  }> {
    return this.getFromCacheOrVault('database-config', () => this.vault.getDatabaseConfig());
  }

  /**
   * Get Redis configuration
   */
  async getRedisConfig(): Promise<{
    host: string;
    port: number;
    url: string;
  }> {
    return this.getFromCacheOrVault('redis-config', () => this.vault.getRedisConfig());
  }

  /**
   * Get JWT configuration
   */
  async getJWTConfig(): Promise<{
    secret: string;
    algorithm: string;
    expiration: string;
  }> {
    return this.getFromCacheOrVault('jwt-config', () => this.vault.getJWTConfig());
  }

  /**
   * Get API key
   */
  async getAPIKey(provider: string, key?: string): Promise<string> {
    const cacheKey = `api-key-${provider}-${key || 'default'}`;
    return this.getFromCacheOrVault(cacheKey, () => this.vault.getAPIKey(provider, key));
  }

  /**
   * Get encryption key
   */
  async getEncryptionKey(): Promise<string> {
    const config = await this.getFromCacheOrVault('encryption-key', () =>
      this.vault.readSecret('app/encryption')
    );
    return config.key as string;
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(paths: string[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    await Promise.all(
      paths.map(async (path) => {
        try {
          results[path] = await this.getFromCacheOrVault(path, () => this.vault.readSecret(path));
        } catch (error) {
          logger.error(`Failed to get secret at path: ${path}`, error);
          results[path] = null;
        }
      })
    );

    return results;
  }

  /**
   * Invalidate cache for a specific key or all keys
   */
  invalidateCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
      logger.debug(`Invalidated cache for key: ${key}`);
    } else {
      this.cache.clear();
      logger.debug('Invalidated entire cache');
    }
  }

  /**
   * Check if secrets manager is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.vault.healthCheck();
    } catch (error) {
      logger.error('Health check failed', error);
      return false;
    }
  }

  /**
   * Rotate multiple secrets
   */
  async rotateSecrets(rotations: Array<{ path: string; data: any }>): Promise<void> {
    logger.info(`Starting rotation of ${rotations.length} secrets`);

    const results = await Promise.allSettled(
      rotations.map(async ({ path, data }) => {
        await this.vault.rotateSecret(path, data);
        this.invalidateCache(path);
        return path;
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info(`Secret rotation completed`, { successful, failed });

    if (failed > 0) {
      const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason.message);

      throw new Error(`Failed to rotate ${failed} secrets: ${errors.join(', ')}`);
    }
  }

  /**
   * Generate strong password
   */
  static generatePassword(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  /**
   * Generate JWT secret
   */
  static generateJWTSecret(): string {
    return require('crypto').randomBytes(64).toString('base64');
  }

  /**
   * Generate encryption key
   */
  static generateEncryptionKey(): string {
    return require('crypto').randomBytes(32).toString('base64');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    this.cache.clear();
  }
}