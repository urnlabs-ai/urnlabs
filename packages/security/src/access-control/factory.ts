/**
 * Access Control System Factory
 * Creates and configures the complete access control system
 */

import Redis from 'ioredis';
import { AccessControlMatrix, AccessControlMatrixConfig } from './AccessControlMatrix';
import { RBACManager } from './RBACManager';
import { PermissionEngine } from './PermissionEngine';
import { UserManager } from './UserManager';

export interface AccessControlSystemConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  cache: {
    matrixTTL: number;
    decisionTTL: number;
    maxSize: number;
  };
  security: {
    enableAuditLogging: boolean;
    enableRiskAssessment: boolean;
    maxRiskScore: number;
    emergencyAccessEnabled: boolean;
  };
  performance: {
    maxConcurrentRequests: number;
    requestTimeout: number;
    enableMetrics: boolean;
  };
  rbac?: {
    maxRoleDepth: number;
    enableTemporalAccess: boolean;
    enableRoleInheritance: boolean;
    enableConflictDetection: boolean;
    roleReviewFrequency: number;
  };
}

export interface AccessControlSystem {
  matrix: AccessControlMatrix;
  rbac: RBACManager;
  permissions: PermissionEngine;
  users: UserManager;
  redis: Redis;
  dispose(): Promise<void>;
}

/**
 * Create a complete access control system with all components
 */
export function createAccessControlSystem(config: AccessControlSystemConfig): AccessControlSystem {
  // Create Redis connection
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db || 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  // Create components
  const rbac = new RBACManager(redis, config.rbac);
  const permissions = new PermissionEngine(redis, config as AccessControlMatrixConfig);
  const users = new UserManager(redis);
  const matrix = new AccessControlMatrix(config as AccessControlMatrixConfig);

  return {
    matrix,
    rbac,
    permissions,
    users,
    redis,
    async dispose() {
      await matrix.dispose();
      await redis.quit();
    },
  };
}

/**
 * Create default configuration for development
 */
export function createDefaultConfig(): AccessControlSystemConfig {
  return {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    cache: {
      matrixTTL: 1800, // 30 minutes
      decisionTTL: 300, // 5 minutes
      maxSize: 10000,
    },
    security: {
      enableAuditLogging: true,
      enableRiskAssessment: true,
      maxRiskScore: 100,
      emergencyAccessEnabled: true,
    },
    performance: {
      maxConcurrentRequests: 100,
      requestTimeout: 5000,
      enableMetrics: true,
    },
    rbac: {
      maxRoleDepth: 10,
      enableTemporalAccess: true,
      enableRoleInheritance: true,
      enableConflictDetection: true,
      roleReviewFrequency: 90, // days
    },
  };
}

/**
 * Create production configuration
 */
export function createProductionConfig(): AccessControlSystemConfig {
  return {
    ...createDefaultConfig(),
    cache: {
      matrixTTL: 3600, // 1 hour
      decisionTTL: 600, // 10 minutes
      maxSize: 50000,
    },
    performance: {
      maxConcurrentRequests: 1000,
      requestTimeout: 3000,
      enableMetrics: true,
    },
    rbac: {
      maxRoleDepth: 15,
      enableTemporalAccess: true,
      enableRoleInheritance: true,
      enableConflictDetection: true,
      roleReviewFrequency: 60, // days for production
    },
  };
}