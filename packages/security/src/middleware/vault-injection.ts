import { FastifyRequest, FastifyReply } from 'fastify';
import { SecretsManager } from '../services/secrets-management-service.js';
import { VaultClient } from '../vault-client.js';
import { logger } from '../utils/logger.js';

/**
 * Vault Secret Injection Middleware
 * Automatically injects secrets from Vault into request context
 */
export class VaultInjectionMiddleware {
  private secretsManager: SecretsManager;
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 300000; // 5 minutes

  constructor(secretsManager: SecretsManager) {
    this.secretsManager = secretsManager;
    this.setupCacheCleanup();
  }

  /**
   * Create middleware function for Fastify
   */
  public middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Inject secrets into request context
        await this.injectSecrets(request);

        // Add helper methods to request
        this.addHelperMethods(request);

      } catch (error) {
        logger.error('Vault injection middleware error', {
          error: error.message,
          requestId: request.id,
          url: request.url
        });

        // Fail gracefully - don't block requests
        // In production, you might want to fail closed for critical secrets
        logger.warn('Continuing request without Vault secrets due to error');
      }
    };
  }

  /**
   * Inject commonly needed secrets into request context
   */
  private async injectSecrets(request: FastifyRequest): Promise<void> {
    const secrets = {
      database: {},
      api: {},
      auth: {},
      external: {}
    };

    // Database secrets
    try {
      secrets.database = {
        password: await this.getSecret('urnlabs/database/password'),
        connectionString: await this.getSecret('urnlabs/database/connection_string'),
        encryptionKey: await this.getSecret('urnlabs/database/encryption_key')
      };
    } catch (error) {
      logger.warn('Could not load database secrets', { error: error.message });
    }

    // API secrets
    try {
      secrets.api = {
        jwtSecret: await this.getSecret('urnlabs/api/jwt_secret'),
        apiKey: await this.getSecret('urnlabs/api/api_key'),
        webhookSecret: await this.getSecret('urnlabs/api/webhook_secret')
      };
    } catch (error) {
      logger.warn('Could not load API secrets', { error: error.message });
    }

    // Authentication secrets
    try {
      secrets.auth = {
        oauthClientSecret: await this.getSecret('urnlabs/auth/oauth_client_secret'),
        sessionSecret: await this.getSecret('urnlabs/auth/session_secret'),
        encryptionKey: await this.getSecret('urnlabs/auth/encryption_key')
      };
    } catch (error) {
      logger.warn('Could not load auth secrets', { error: error.message });
    }

    // External service secrets
    try {
      secrets.external = {
        slackToken: await this.getSecret('urnlabs/external/slack_token'),
        githubToken: await this.getSecret('urnlabs/external/github_token'),
        monitoringKey: await this.getSecret('urnlabs/external/monitoring_key')
      };
    } catch (error) {
      logger.warn('Could not load external service secrets', { error: error.message });
    }

    // Add secrets to request context
    (request as any).secrets = secrets;
  }

  /**
   * Add helper methods to request object
   */
  private addHelperMethods(request: FastifyRequest): void {
    (request as any).getSecret = async (path: string) => {
      return this.getSecret(path);
    };

    (request as any).requireSecret = async (path: string) => {
      const secret = await this.getSecret(path);
      if (!secret) {
        throw new Error(`Required secret not found: ${path}`);
      }
      return secret;
    };

    (request as any).getSecrets = () => {
      return (request as any).secrets;
    };
  }

  /**
   * Get secret with caching
   */
  private async getSecret(path: string): Promise<string | null> {
    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = this.cache.get(path);
        if (cached && cached.expiry > Date.now()) {
          return cached.value;
        }
      }

      // Fetch from Vault
      const secret = await this.secretsManager.getSecret(path);

      // Cache the result
      if (this.cacheEnabled && secret) {
        this.cache.set(path, {
          value: secret,
          expiry: Date.now() + this.cacheTTL
        });
      }

      return secret;

    } catch (error) {
      logger.error('Failed to get secret from Vault', {
        path,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Preload commonly used secrets
   */
  public async preloadSecrets(): Promise<void> {
    const commonSecrets = [
      'urnlabs/database/password',
      'urnlabs/api/jwt_secret',
      'urnlabs/auth/session_secret',
      'urnlabs/external/monitoring_key'
    ];

    const preloadPromises = commonSecrets.map(path =>
      this.getSecret(path).catch(error => {
        logger.warn(`Failed to preload secret: ${path}`, { error: error.message });
      })
    );

    await Promise.allSettled(preloadPromises);
    logger.info('Preloaded common secrets', { count: commonSecrets.length });
  }

  /**
   * Invalidate cache for specific secret or all secrets
   */
  public invalidateCache(path?: string): void {
    if (path) {
      this.cache.delete(path);
      logger.debug('Invalidated cache for secret', { path });
    } else {
      this.cache.clear();
      logger.debug('Invalidated all secret cache');
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): object {
    return {
      size: this.cache.size,
      enabled: this.cacheEnabled,
      ttl: this.cacheTTL,
      items: Array.from(this.cache.keys())
    };
  }

  /**
   * Setup periodic cache cleanup
   */
  private setupCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, value] of this.cache.entries()) {
        if (value.expiry <= now) {
          this.cache.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Cleaned expired secrets from cache', { count: cleanedCount });
      }
    }, 60000); // Clean every minute
  }
}

/**
 * Vault-aware configuration loader
 * Replaces environment variables with Vault secrets
 */
export class VaultConfigLoader {
  private secretsManager: SecretsManager;
  private configCache: Map<string, any> = new Map();

  constructor(secretsManager: SecretsManager) {
    this.secretsManager = secretsManager;
  }

  /**
   * Load configuration with Vault secret resolution
   */
  public async loadConfig(configTemplate: object): Promise<object> {
    const cacheKey = JSON.stringify(configTemplate);

    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const resolvedConfig = await this.resolveSecrets(configTemplate);
    this.configCache.set(cacheKey, resolvedConfig);

    return resolvedConfig;
  }

  /**
   * Recursively resolve secrets in configuration object
   */
  private async resolveSecrets(obj: any): Promise<any> {
    if (typeof obj === 'string') {
      return this.resolveSecretString(obj);
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => this.resolveSecrets(item)));
    }

    if (obj && typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = await this.resolveSecrets(value);
      }
      return resolved;
    }

    return obj;
  }

  /**
   * Resolve secret references in string values
   */
  private async resolveSecretString(str: string): Promise<string> {
    // Pattern: ${vault:path/to/secret}
    const vaultPattern = /\$\{vault:([^}]+)\}/g;
    let resolved = str;
    let match;

    while ((match = vaultPattern.exec(str)) !== null) {
      const secretPath = match[1];
      try {
        const secret = await this.secretsManager.getSecret(secretPath);
        if (secret) {
          resolved = resolved.replace(match[0], secret);
        } else {
          logger.warn('Vault secret not found, keeping original value', { path: secretPath });
        }
      } catch (error) {
        logger.error('Failed to resolve vault secret', {
          path: secretPath,
          error: error.message
        });
      }
    }

    return resolved;
  }

  /**
   * Clear configuration cache
   */
  public clearCache(): void {
    this.configCache.clear();
  }
}

/**
 * Vault health check middleware
 */
export class VaultHealthCheck {
  private vaultClient: VaultClient;

  constructor(vaultClient: VaultClient) {
    this.vaultClient = vaultClient;
  }

  /**
   * Check Vault connectivity and authentication
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: object;
  }> {
    try {
      const status = await this.vaultClient.checkHealth();
      const auth = await this.vaultClient.checkAuth();

      return {
        status: status && auth ? 'healthy' : 'unhealthy',
        details: {
          vault_status: status,
          authentication: auth,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

/**
 * Factory function to create Vault injection middleware
 */
export function createVaultInjectionMiddleware(config: {
  vaultAddr: string;
  roleId: string;
  secretId: string;
}): VaultInjectionMiddleware {
  const secretsManager = new SecretsManager({
    vault: {
      address: config.vaultAddr,
      roleId: config.roleId,
      secretId: config.secretId,
    },
    cacheEnabled: true,
    cacheTTL: 300000
  });

  return new VaultInjectionMiddleware(secretsManager);
}