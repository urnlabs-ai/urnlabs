import { Request, Response, NextFunction } from 'express';
import { SecretsManager } from './secrets-manager';
import { createLogger } from './logger';

const logger = createLogger('VaultMiddleware');

export interface VaultMiddlewareConfig {
  secretsManager: SecretsManager;
  injectSecrets?: boolean;
  healthCheckPath?: string;
  retryAttempts?: number;
}

/**
 * Middleware to inject secrets from Vault into request context
 */
export function createVaultMiddleware(config: VaultMiddlewareConfig) {
  const {
    secretsManager,
    injectSecrets = true,
    healthCheckPath = '/vault/health',
    retryAttempts = 3
  } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Handle health check endpoint
      if (req.path === healthCheckPath) {
        const isHealthy = await secretsManager.healthCheck();
        return res.status(isHealthy ? 200 : 503).json({
          healthy: isHealthy,
          timestamp: new Date().toISOString(),
          service: 'vault'
        });
      }

      // Inject secrets into request context if enabled
      if (injectSecrets && !req.secrets) {
        req.secrets = {
          getDatabaseConfig: () => secretsManager.getDatabaseConfig(),
          getRedisConfig: () => secretsManager.getRedisConfig(),
          getJWTConfig: () => secretsManager.getJWTConfig(),
          getAPIKey: (provider: string, key?: string) => secretsManager.getAPIKey(provider, key),
          getEncryptionKey: () => secretsManager.getEncryptionKey(),
          getSecrets: (paths: string[]) => secretsManager.getSecrets(paths),
        };

        logger.debug('Injected secrets interface into request context');
      }

      next();
    } catch (error) {
      logger.error('Vault middleware error', error);

      // In production, you might want to fail gracefully or use fallback values
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({
          error: 'Secrets service unavailable',
          timestamp: new Date().toISOString()
        });
      }

      next(error);
    }
  };
}

/**
 * Middleware to ensure JWT secret is available
 */
export function ensureJWTSecret(secretsManager: SecretsManager) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.jwtConfig) {
        const jwtConfig = await secretsManager.getJWTConfig();
        req.jwtConfig = jwtConfig;
        logger.debug('Injected JWT config into request context');
      }
      next();
    } catch (error) {
      logger.error('Failed to get JWT config', error);
      return res.status(503).json({
        error: 'JWT configuration unavailable',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Middleware to ensure database config is available
 */
export function ensureDatabaseConfig(secretsManager: SecretsManager) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.dbConfig) {
        const dbConfig = await secretsManager.getDatabaseConfig();
        req.dbConfig = dbConfig;
        logger.debug('Injected database config into request context');
      }
      next();
    } catch (error) {
      logger.error('Failed to get database config', error);
      return res.status(503).json({
        error: 'Database configuration unavailable',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Express request type augmentation
 */
declare global {
  namespace Express {
    interface Request {
      secrets?: {
        getDatabaseConfig(): Promise<{
          username: string;
          password: string;
          host: string;
          port: number;
          database: string;
          url: string;
        }>;
        getRedisConfig(): Promise<{
          host: string;
          port: number;
          url: string;
        }>;
        getJWTConfig(): Promise<{
          secret: string;
          algorithm: string;
          expiration: string;
        }>;
        getAPIKey(provider: string, key?: string): Promise<string>;
        getEncryptionKey(): Promise<string>;
        getSecrets(paths: string[]): Promise<Record<string, any>>;
      };
      jwtConfig?: {
        secret: string;
        algorithm: string;
        expiration: string;
      };
      dbConfig?: {
        username: string;
        password: string;
        host: string;
        port: number;
        database: string;
        url: string;
      };
    }
  }
}