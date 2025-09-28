import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SecretsManager, VaultClient } from '../index';
import { SecretsRotationManager, defaultRotationRules } from '../secrets-rotation';
import { SecretsScanner } from '../secrets-scanner';
import { createLogger } from '../logger';

const logger = createLogger('SecretsManagementService');

export interface SecretsManagementConfig {
  vaultAddr: string;
  roleId: string;
  secretId: string;
  enableRotation?: boolean;
  enableScanning?: boolean;
}

export class SecretsManagementService {
  private secretsManager: SecretsManager;
  private rotationManager?: SecretsRotationManager;
  private config: SecretsManagementConfig;

  constructor(config: SecretsManagementConfig) {
    this.config = config;

    // Initialize secrets manager
    this.secretsManager = new SecretsManager({
      vault: {
        address: config.vaultAddr,
        roleId: config.roleId,
        secretId: config.secretId,
      },
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
    });

    // Initialize rotation manager if enabled
    if (config.enableRotation) {
      this.rotationManager = new SecretsRotationManager({
        secretsManager: this.secretsManager,
        rules: defaultRotationRules,
        dryRun: false,
      });

      this.rotationManager.on('rotation:success', ({ path, timestamp }) => {
        logger.info(`Secret rotated successfully`, { path, timestamp });
      });

      this.rotationManager.on('rotation:error', ({ path, error, timestamp }) => {
        logger.error(`Secret rotation failed`, { path, error: error.message, timestamp });
      });

      this.rotationManager.start();
    }
  }

  /**
   * Register routes with Fastify
   */
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Health check
    fastify.get('/secrets/health', async (request, reply) => {
      try {
        const isHealthy = await this.secretsManager.healthCheck();
        reply.status(isHealthy ? 200 : 503).send({
          healthy: isHealthy,
          timestamp: new Date().toISOString(),
          service: 'secrets-manager'
        });
      } catch (error) {
        reply.status(503).send({
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get database configuration
    fastify.get('/secrets/database', async (request, reply) => {
      try {
        const config = await this.secretsManager.getDatabaseConfig();
        reply.send({
          success: true,
          data: {
            host: config.host,
            port: config.port,
            database: config.database,
            // Don't expose credentials in response
          }
        });
      } catch (error) {
        logger.error('Failed to get database config', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to retrieve database configuration'
        });
      }
    });

    // Get JWT configuration
    fastify.get('/secrets/jwt', async (request, reply) => {
      try {
        const config = await this.secretsManager.getJWTConfig();
        reply.send({
          success: true,
          data: {
            algorithm: config.algorithm,
            expiration: config.expiration,
            // Don't expose secret in response
          }
        });
      } catch (error) {
        logger.error('Failed to get JWT config', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to retrieve JWT configuration'
        });
      }
    });

    // Get API key (protected route)
    fastify.get('/secrets/api-key/:provider', {
      preHandler: this.authenticateRequest,
    }, async (request: FastifyRequest<{
      Params: { provider: string };
      Querystring: { key?: string };
    }>, reply) => {
      try {
        const { provider } = request.params;
        const { key } = request.query;

        const apiKey = await this.secretsManager.getAPIKey(provider, key);
        reply.send({
          success: true,
          data: {
            provider,
            key: key || 'default',
            // Return masked key for security
            maskedKey: this.maskSecret(apiKey)
          }
        });
      } catch (error) {
        logger.error('Failed to get API key', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to retrieve API key'
        });
      }
    });

    // Rotation status
    fastify.get('/secrets/rotation/status', async (request, reply) => {
      if (!this.rotationManager) {
        return reply.status(404).send({
          success: false,
          error: 'Rotation manager not enabled'
        });
      }

      try {
        const status = this.rotationManager.getRotationStatus();
        reply.send({
          success: true,
          data: status
        });
      } catch (error) {
        logger.error('Failed to get rotation status', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to retrieve rotation status'
        });
      }
    });

    // Trigger rotation
    fastify.post('/secrets/rotation/trigger', {
      preHandler: this.authenticateRequest,
    }, async (request: FastifyRequest<{
      Body: { path: string };
    }>, reply) => {
      if (!this.rotationManager) {
        return reply.status(404).send({
          success: false,
          error: 'Rotation manager not enabled'
        });
      }

      try {
        const { path } = request.body;
        await this.rotationManager.triggerRotation(path);
        reply.send({
          success: true,
          message: `Rotation triggered for path: ${path}`
        });
      } catch (error) {
        logger.error('Failed to trigger rotation', error);
        reply.status(500).send({
          success: false,
          error: `Failed to trigger rotation: ${error.message}`
        });
      }
    });

    // Scan for secrets
    fastify.post('/secrets/scan', {
      preHandler: this.authenticateRequest,
    }, async (request: FastifyRequest<{
      Body: {
        path: string;
        excludePatterns?: string[];
        includePatterns?: string[];
        maxFileSize?: number;
      };
    }>, reply) => {
      if (!this.config.enableScanning) {
        return reply.status(404).send({
          success: false,
          error: 'Secrets scanning not enabled'
        });
      }

      try {
        const { path, excludePatterns, includePatterns, maxFileSize } = request.body;

        const scanner = new SecretsScanner({
          rootPath: path,
          excludePatterns,
          includePatterns,
          maxFileSize,
        });

        const results = await scanner.scan();
        const report = scanner.generateReport(results);

        reply.send({
          success: true,
          data: report
        });
      } catch (error) {
        logger.error('Failed to scan for secrets', error);
        reply.status(500).send({
          success: false,
          error: `Failed to scan for secrets: ${error.message}`
        });
      }
    });

    // Cache management
    fastify.delete('/secrets/cache', {
      preHandler: this.authenticateRequest,
    }, async (request: FastifyRequest<{
      Querystring: { key?: string };
    }>, reply) => {
      try {
        const { key } = request.query;
        this.secretsManager.invalidateCache(key);

        reply.send({
          success: true,
          message: key ? `Cache invalidated for key: ${key}` : 'All cache invalidated'
        });
      } catch (error) {
        logger.error('Failed to invalidate cache', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to invalidate cache'
        });
      }
    });

    logger.info('Secrets management routes registered');
  }

  /**
   * Authenticate requests (placeholder - integrate with your auth system)
   */
  private async authenticateRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        success: false,
        error: 'Missing or invalid authorization header'
      });
      return;
    }

    const token = authHeader.substring(7);

    // TODO: Validate token with your auth system
    // For now, accept any token for development
    if (!token || token === 'invalid') {
      reply.status(401).send({
        success: false,
        error: 'Invalid authentication token'
      });
      return;
    }
  }

  /**
   * Mask secret for safe display
   */
  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }

    const start = secret.substring(0, 4);
    const end = secret.substring(secret.length - 4);
    const middle = '*'.repeat(secret.length - 8);

    return `${start}${middle}${end}`;
  }

  /**
   * Get secrets manager instance (for internal use)
   */
  getSecretsManager(): SecretsManager {
    return this.secretsManager;
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.rotationManager) {
      this.rotationManager.stop();
      this.rotationManager.destroy();
    }

    this.secretsManager.destroy();
    logger.info('Secrets management service destroyed');
  }
}