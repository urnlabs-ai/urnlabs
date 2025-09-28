import Redis from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

// ============================================================================
// REDIS CLIENT CONFIGURATION
// ============================================================================

/**
 * Redis client configuration for secure session and token management
 */

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix?: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
  enableAutoPipelining: boolean;
}

const redisConfig: RedisConfig = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  db: config.REDIS_DB,
  keyPrefix: config.REDIS_KEY_PREFIX,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableAutoPipelining: true,
};

// Create Redis client instance
export const redis = new Redis(redisConfig);

// Event handlers for connection monitoring
redis.on('connect', () => {
  logger.info('Redis client connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis client ready for operations');
});

redis.on('error', (error) => {
  logger.error('Redis client error:', { error: error.message, stack: error.stack });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (ms: number) => {
  logger.info(`Redis client reconnecting in ${ms}ms`);
});

// ============================================================================
// REDIS UTILITIES FOR JWT AND SESSION MANAGEMENT
// ============================================================================

/**
 * Refresh Token Management utilities
 */
export class RefreshTokenManager {
  private static readonly TOKEN_PREFIX = 'refresh_token:';
  private static readonly USER_TOKENS_PREFIX = 'user_tokens:';
  private static readonly TOKEN_ROTATION_PREFIX = 'token_rotation:';

  /**
   * Store a refresh token with expiration
   * @param userId - User ID
   * @param tokenId - Unique token identifier
   * @param tokenHash - Hashed token value
   * @param expiresInSeconds - Token expiration time in seconds
   */
  static async storeRefreshToken(
    userId: string,
    tokenId: string,
    tokenHash: string,
    expiresInSeconds: number
  ): Promise<void> {
    const pipeline = redis.pipeline();

    // Store token details
    const tokenKey = `${this.TOKEN_PREFIX}${tokenId}`;
    const tokenData = {
      userId,
      tokenHash,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    pipeline.hset(tokenKey, tokenData);
    pipeline.expire(tokenKey, expiresInSeconds);

    // Add to user's token set
    const userTokensKey = `${this.USER_TOKENS_PREFIX}${userId}`;
    pipeline.sadd(userTokensKey, tokenId);
    pipeline.expire(userTokensKey, expiresInSeconds);

    await pipeline.exec();

    logger.debug('Refresh token stored', { userId, tokenId, expiresInSeconds });
  }

  /**
   * Validate and retrieve refresh token
   * @param tokenId - Token identifier
   * @param tokenHash - Token hash to validate
   */
  static async validateRefreshToken(
    tokenId: string,
    tokenHash: string
  ): Promise<{ valid: boolean; userId?: string; shouldRotate?: boolean }> {
    const tokenKey = `${this.TOKEN_PREFIX}${tokenId}`;
    const tokenData = await redis.hgetall(tokenKey);

    if (!tokenData.userId || !tokenData.tokenHash) {
      return { valid: false };
    }

    // Validate token hash
    if (tokenData.tokenHash !== tokenHash) {
      logger.warn('Invalid refresh token hash attempted', { tokenId });
      return { valid: false };
    }

    // Update last used timestamp
    await redis.hset(tokenKey, 'lastUsed', Date.now());

    // Check if token should be rotated (older than 24 hours)
    const createdAt = parseInt(tokenData.createdAt);
    const shouldRotate = Date.now() - createdAt > 24 * 60 * 60 * 1000;

    return {
      valid: true,
      userId: tokenData.userId,
      shouldRotate,
    };
  }

  /**
   * Rotate refresh token (invalidate old, create new)
   * @param oldTokenId - Current token ID
   * @param newTokenId - New token ID
   * @param newTokenHash - New token hash
   * @param userId - User ID
   * @param expiresInSeconds - New token expiration
   */
  static async rotateRefreshToken(
    oldTokenId: string,
    newTokenId: string,
    newTokenHash: string,
    userId: string,
    expiresInSeconds: number
  ): Promise<void> {
    const pipeline = redis.pipeline();

    // Remove old token
    const oldTokenKey = `${this.TOKEN_PREFIX}${oldTokenId}`;
    pipeline.del(oldTokenKey);

    // Store new token
    const newTokenKey = `${this.TOKEN_PREFIX}${newTokenId}`;
    const tokenData = {
      userId,
      tokenHash: newTokenHash,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    pipeline.hset(newTokenKey, tokenData);
    pipeline.expire(newTokenKey, expiresInSeconds);

    // Update user's token set
    const userTokensKey = `${this.USER_TOKENS_PREFIX}${userId}`;
    pipeline.srem(userTokensKey, oldTokenId);
    pipeline.sadd(userTokensKey, newTokenId);
    pipeline.expire(userTokensKey, expiresInSeconds);

    // Track rotation for security monitoring
    const rotationKey = `${this.TOKEN_ROTATION_PREFIX}${userId}`;
    pipeline.lpush(rotationKey, JSON.stringify({
      oldTokenId,
      newTokenId,
      timestamp: Date.now(),
    }));
    pipeline.ltrim(rotationKey, 0, 10); // Keep last 10 rotations
    pipeline.expire(rotationKey, 30 * 24 * 60 * 60); // 30 days

    await pipeline.exec();

    logger.info('Refresh token rotated', { userId, oldTokenId, newTokenId });
  }

  /**
   * Revoke all refresh tokens for a user
   * @param userId - User ID
   */
  static async revokeAllUserTokens(userId: string): Promise<void> {
    const userTokensKey = `${this.USER_TOKENS_PREFIX}${userId}`;
    const tokenIds = await redis.smembers(userTokensKey);

    if (tokenIds.length === 0) {
      return;
    }

    const pipeline = redis.pipeline();

    // Delete all user's tokens
    for (const tokenId of tokenIds) {
      pipeline.del(`${this.TOKEN_PREFIX}${tokenId}`);
    }

    // Clear user's token set
    pipeline.del(userTokensKey);

    await pipeline.exec();

    logger.info('All refresh tokens revoked', { userId, count: tokenIds.length });
  }

  /**
   * Cleanup expired tokens (maintenance function)
   */
  static async cleanupExpiredTokens(): Promise<number> {
    // This is handled automatically by Redis TTL, but we can scan for orphaned entries
    const pattern = `${config.REDIS_KEY_PREFIX || 'urnlabs:'}${this.TOKEN_PREFIX}*`;
    const keys = await redis.keys(pattern);

    let cleanedCount = 0;
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      if (ttl === -1) { // No expiration set
        await redis.del(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up orphaned refresh tokens', { count: cleanedCount });
    }

    return cleanedCount;
  }
}

/**
 * JWT Key Management utilities
 */
export class JWTKeyManager {
  private static readonly CURRENT_KEY = 'jwt:current_key';
  private static readonly KEY_PREFIX = 'jwt:key:';
  private static readonly KEY_ROTATION_LOG = 'jwt:rotation_log';

  /**
   * Store JWT signing key
   * @param keyId - Key identifier
   * @param privateKey - Private key for signing
   * @param publicKey - Public key for verification
   * @param expiresInSeconds - Key expiration time
   */
  static async storeJWTKey(
    keyId: string,
    privateKey: string,
    publicKey: string,
    expiresInSeconds: number = 30 * 24 * 60 * 60 // 30 days default
  ): Promise<void> {
    const keyData = {
      keyId,
      privateKey,
      publicKey,
      createdAt: Date.now(),
      expiresAt: Date.now() + (expiresInSeconds * 1000),
    };

    const pipeline = redis.pipeline();

    // Store key data
    const keyKey = `${this.KEY_PREFIX}${keyId}`;
    pipeline.hset(keyKey, keyData);
    pipeline.expire(keyKey, expiresInSeconds);

    // Set as current key if none exists
    const currentKeyExists = await redis.exists(this.CURRENT_KEY);
    if (!currentKeyExists) {
      pipeline.set(this.CURRENT_KEY, keyId);
    }

    await pipeline.exec();

    logger.info('JWT key stored', { keyId, expiresInSeconds });
  }

  /**
   * Get current signing key
   */
  static async getCurrentSigningKey(): Promise<{ keyId: string; privateKey: string } | null> {
    const currentKeyId = await redis.get(this.CURRENT_KEY);
    if (!currentKeyId) {
      return null;
    }

    const keyKey = `${this.KEY_PREFIX}${currentKeyId}`;
    const keyData = await redis.hgetall(keyKey);

    if (!keyData.privateKey) {
      return null;
    }

    return {
      keyId: currentKeyId,
      privateKey: keyData.privateKey,
    };
  }

  /**
   * Get public key for verification
   * @param keyId - Key identifier
   */
  static async getVerificationKey(keyId: string): Promise<string | null> {
    const keyKey = `${this.KEY_PREFIX}${keyId}`;
    const publicKey = await redis.hget(keyKey, 'publicKey');
    return publicKey;
  }

  /**
   * Rotate JWT signing key
   * @param newKeyId - New key identifier
   * @param newPrivateKey - New private key
   * @param newPublicKey - New public key
   */
  static async rotateSigningKey(
    newKeyId: string,
    newPrivateKey: string,
    newPublicKey: string
  ): Promise<void> {
    const oldKeyId = await redis.get(this.CURRENT_KEY);

    // Store new key
    await this.storeJWTKey(newKeyId, newPrivateKey, newPublicKey);

    // Update current key pointer
    await redis.set(this.CURRENT_KEY, newKeyId);

    // Log rotation
    const rotationEntry = {
      oldKeyId,
      newKeyId,
      timestamp: Date.now(),
    };

    await redis.lpush(this.KEY_ROTATION_LOG, JSON.stringify(rotationEntry));
    await redis.ltrim(this.KEY_ROTATION_LOG, 0, 50); // Keep last 50 rotations

    logger.info('JWT signing key rotated', { oldKeyId, newKeyId });
  }

  /**
   * List all available verification keys
   */
  static async getAllVerificationKeys(): Promise<Array<{ keyId: string; publicKey: string }>> {
    const pattern = `${config.REDIS_KEY_PREFIX || 'urnlabs:'}${this.KEY_PREFIX}*`;
    const keys = await redis.keys(pattern);

    const verificationKeys = [];
    for (const key of keys) {
      const keyData = await redis.hgetall(key);
      if (keyData.keyId && keyData.publicKey) {
        verificationKeys.push({
          keyId: keyData.keyId,
          publicKey: keyData.publicKey,
        });
      }
    }

    return verificationKeys;
  }
}

/**
 * Session Management utilities
 */
export class SessionManager {
  private static readonly SESSION_PREFIX = 'session:';
  private static readonly USER_SESSIONS_PREFIX = 'user_sessions:';

  /**
   * Store user session data
   * @param sessionId - Session identifier
   * @param userId - User ID
   * @param sessionData - Session data object
   * @param expiresInSeconds - Session expiration time
   */
  static async storeSession(
    sessionId: string,
    userId: string,
    sessionData: Record<string, any>,
    expiresInSeconds: number = 24 * 60 * 60 // 24 hours default
  ): Promise<void> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;

    const pipeline = redis.pipeline();

    // Store session data
    pipeline.hset(sessionKey, {
      userId,
      ...sessionData,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    });
    pipeline.expire(sessionKey, expiresInSeconds);

    // Add to user's session set
    pipeline.sadd(userSessionsKey, sessionId);
    pipeline.expire(userSessionsKey, expiresInSeconds);

    await pipeline.exec();
  }

  /**
   * Get session data
   * @param sessionId - Session identifier
   */
  static async getSession(sessionId: string): Promise<Record<string, any> | null> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const sessionData = await redis.hgetall(sessionKey);

    if (!sessionData.userId) {
      return null;
    }

    // Update last access time
    await redis.hset(sessionKey, 'lastAccess', Date.now());

    return sessionData;
  }

  /**
   * Delete session
   * @param sessionId - Session identifier
   */
  static async deleteSession(sessionId: string): Promise<void> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const sessionData = await redis.hgetall(sessionKey);

    if (sessionData.userId) {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${sessionData.userId}`;
      await redis.srem(userSessionsKey, sessionId);
    }

    await redis.del(sessionKey);
  }

  /**
   * Delete all sessions for a user
   * @param userId - User ID
   */
  static async deleteAllUserSessions(userId: string): Promise<void> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    const sessionIds = await redis.smembers(userSessionsKey);

    if (sessionIds.length === 0) {
      return;
    }

    const pipeline = redis.pipeline();

    for (const sessionId of sessionIds) {
      pipeline.del(`${this.SESSION_PREFIX}${sessionId}`);
    }

    pipeline.del(userSessionsKey);

    await pipeline.exec();

    logger.info('All user sessions deleted', { userId, count: sessionIds.length });
  }
}

/**
 * Graceful Redis connection management
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    logger.info('Redis connection established successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis:', { error: error instanceof Error ? error.message : error });
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.disconnect();
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.error('Error closing Redis connection:', { error: error instanceof Error ? error.message : error });
  }
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    return { healthy: true, latency };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}

/**
 * Build cache key with prefix
 */
function getKey(prefix: string, key: string): string {
  return `auth:${prefix}:${key}`;
}

/**
 * Redis-based permission cache manager for RBAC system
 */
export class PermissionCacheManager {
  private static readonly PERMISSION_TTL = 5 * 60; // 5 minutes
  private static readonly USER_PERMISSIONS_TTL = 10 * 60; // 10 minutes
  private static readonly ROLE_PERMISSIONS_TTL = 30 * 60; // 30 minutes

  /**
   * Cache a permission check result
   */
  static async cachePermissionCheck(
    userId: string,
    permission: string,
    resourceType: string | undefined,
    resourceId: string | undefined,
    organizationId: string | undefined,
    result: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    const cacheKey = this.buildPermissionCacheKey(userId, permission, resourceType, resourceId, organizationId);

    const cacheData = {
      result,
      cachedAt: new Date().toISOString(),
      metadata,
    };

    await redis.setex(cacheKey, this.PERMISSION_TTL, JSON.stringify(cacheData));
  }

  /**
   * Get cached permission check result
   */
  static async getCachedPermissionCheck(
    userId: string,
    permission: string,
    resourceType: string | undefined,
    resourceId: string | undefined,
    organizationId: string | undefined
  ): Promise<{ result: boolean; metadata?: Record<string, any> } | null> {
    const cacheKey = this.buildPermissionCacheKey(userId, permission, resourceType, resourceId, organizationId);
    const cached = await redis.get(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        result: parsed.result,
        metadata: { ...parsed.metadata, cacheHit: true, cachedAt: parsed.cachedAt },
      };
    }

    return null;
  }

  /**
   * Cache user's effective permissions
   */
  static async cacheUserPermissions(
    userId: string,
    organizationId: string | undefined,
    permissions: Array<{
      permission: string;
      resourceType?: string;
      resourceId?: string;
      source: 'direct' | 'role' | 'delegated';
      expiresAt?: Date;
    }>
  ): Promise<void> {
    const cacheKey = getKey('user_permissions', `${userId}:${organizationId || 'global'}`);

    const cacheData = {
      permissions,
      cachedAt: new Date().toISOString(),
      userId,
      organizationId,
    };

    await redis.setex(cacheKey, this.USER_PERMISSIONS_TTL, JSON.stringify(cacheData));
  }

  /**
   * Get cached user permissions
   */
  static async getCachedUserPermissions(
    userId: string,
    organizationId: string | undefined
  ): Promise<Array<{
    permission: string;
    resourceType?: string;
    resourceId?: string;
    source: 'direct' | 'role' | 'delegated';
    expiresAt?: Date;
  }> | null> {
    const cacheKey = getKey('user_permissions', `${userId}:${organizationId || 'global'}`);
    const cached = await redis.get(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.permissions;
    }

    return null;
  }

  /**
   * Cache role permissions
   */
  static async cacheRolePermissions(
    roleId: string,
    permissions: Array<{
      permission: string;
      resourceType: string;
      conditions?: Record<string, any>;
    }>
  ): Promise<void> {
    const cacheKey = getKey('role_permissions', roleId);

    const cacheData = {
      permissions,
      cachedAt: new Date().toISOString(),
      roleId,
    };

    await redis.setex(cacheKey, this.ROLE_PERMISSIONS_TTL, JSON.stringify(cacheData));
  }

  /**
   * Get cached role permissions
   */
  static async getCachedRolePermissions(
    roleId: string
  ): Promise<Array<{
    permission: string;
    resourceType: string;
    conditions?: Record<string, any>;
  }> | null> {
    const cacheKey = getKey('role_permissions', roleId);
    const cached = await redis.get(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.permissions;
    }

    return null;
  }

  /**
   * Invalidate user's permission cache
   */
  static async invalidateUserPermissions(userId: string, organizationId?: string): Promise<void> {
    if (organizationId) {
      const cacheKey = getKey('user_permissions', `${userId}:${organizationId}`);
      await redis.del(cacheKey);
    } else {
      // Invalidate all organization contexts for this user
      const pattern = getKey('user_permissions', `${userId}:*`);
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }

    // Also invalidate specific permission checks for this user
    const permissionPattern = getKey('permission_check', `${userId}:*`);
    const permissionKeys = await redis.keys(permissionPattern);
    if (permissionKeys.length > 0) {
      await redis.del(...permissionKeys);
    }
  }

  /**
   * Invalidate role permission cache
   */
  static async invalidateRolePermissions(roleId: string): Promise<void> {
    const cacheKey = getKey('role_permissions', roleId);
    await redis.del(cacheKey);

    // Also invalidate permission checks that might use this role
    // This is a bit aggressive but ensures consistency
    const pattern = getKey('permission_check', '*');
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Invalidate all permission-related caches for an organization
   */
  static async invalidateOrganizationPermissions(organizationId: string): Promise<void> {
    // Invalidate user permissions for this organization
    const userPattern = getKey('user_permissions', `*:${organizationId}`);
    const userKeys = await redis.keys(userPattern);
    if (userKeys.length > 0) {
      await redis.del(...userKeys);
    }

    // Invalidate all permission checks (since they might be organization-scoped)
    const permissionPattern = getKey('permission_check', '*');
    const permissionKeys = await redis.keys(permissionPattern);
    if (permissionKeys.length > 0) {
      await redis.del(...permissionKeys);
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<{
    totalPermissionChecks: number;
    totalUserPermissions: number;
    totalRolePermissions: number;
    memoryUsage: string | undefined;
  }> {
    const permissionChecks = await redis.keys(getKey('permission_check', '*'));
    const userPermissions = await redis.keys(getKey('user_permissions', '*'));
    const rolePermissions = await redis.keys(getKey('role_permissions', '*'));

    let memoryUsage: string | undefined;
    try {
      const info = await redis.info('memory');
      const usedMemoryMatch = info.match(/used_memory_human:(.+)\r?\n/);
      memoryUsage = usedMemoryMatch ? usedMemoryMatch[1].trim() : undefined;
    } catch {
      // Ignore memory info errors
    }

    return {
      totalPermissionChecks: permissionChecks.length,
      totalUserPermissions: userPermissions.length,
      totalRolePermissions: rolePermissions.length,
      memoryUsage,
    };
  }

  /**
   * Build permission cache key
   */
  private static buildPermissionCacheKey(
    userId: string,
    permission: string,
    resourceType: string | undefined,
    resourceId: string | undefined,
    organizationId: string | undefined
  ): string {
    const parts = [
      userId,
      permission,
      resourceType || 'global',
      resourceId || 'any',
      organizationId || 'global',
    ];
    return getKey('permission_check', parts.join(':'));
  }
}

export default redis;