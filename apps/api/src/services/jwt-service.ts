import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { FastifyInstance } from 'fastify';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import { JWTKeyManager, RefreshTokenManager } from '@/lib/redis.js';

// ============================================================================
// JWT SERVICE WITH RS256 AND KEY ROTATION
// ============================================================================

/**
 * Production-ready JWT service with RS256 algorithm, key rotation, and secure refresh tokens
 */

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
  permissions: string[];
  iat?: number;
  exp?: number;
  kid?: string; // Key ID for rotation
}

export interface RefreshTokenData {
  userId: string;
  type: 'refresh';
  tokenId: string; // Unique identifier for this token
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenId: string;
}

export interface KeyPair {
  keyId: string;
  privateKey: string;
  publicKey: string;
}

export class JWTService {
  private fastify: FastifyInstance;
  private static readonly SALT_ROUNDS = 12;
  private static readonly ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
  private static readonly REFRESH_TOKEN_EXPIRY = '7d'; // 7 days
  private static readonly KEY_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Initialize JWT service with key generation and rotation setup
   */
  async initialize(): Promise<void> {
    try {
      // Check if we have a current signing key (Redis-dependent)
      let currentKey = null;

      try {
        currentKey = await JWTKeyManager.getCurrentSigningKey();
      } catch (redisError) {
        logger.warn('Redis unavailable for JWT key management, using fallback mode', {
          error: redisError instanceof Error ? redisError.message : redisError
        });
        // In fallback mode, we'll generate keys on-demand without Redis storage
        currentKey = null;
      }

      if (!currentKey) {
        logger.info('No current JWT signing key found, will generate keys on-demand in fallback mode');
      } else {
        logger.info('JWT service initialized with existing key', { keyId: currentKey.keyId });
      }

      // Set up periodic key rotation only if Redis is available
      if (currentKey !== null) {
        this.setupKeyRotationSchedule();
      } else {
        logger.info('JWT key rotation disabled (Redis unavailable)');
      }

    } catch (error) {
      logger.error('Failed to initialize JWT service', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  /**
   * Generate RS256 key pair
   */
  private generateKeyPair(): KeyPair {
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    const keyId = crypto.randomUUID();

    return {
      keyId,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    };
  }

  /**
   * Generate and store new key pair
   */
  private async generateAndStoreKeyPair(): Promise<KeyPair> {
    const keyPair = this.generateKeyPair();

    await JWTKeyManager.storeJWTKey(
      keyPair.keyId,
      keyPair.privateKey,
      keyPair.publicKey,
      30 * 24 * 60 * 60 // 30 days
    );

    logger.info('Generated and stored new JWT key pair', { keyId: keyPair.keyId });
    return keyPair;
  }

  /**
   * Set up periodic key rotation
   */
  private setupKeyRotationSchedule(): void {
    setInterval(async () => {
      try {
        await this.rotateSigningKey();
      } catch (error) {
        logger.error('Scheduled key rotation failed', { error: error instanceof Error ? error.message : error });
      }
    }, this.KEY_ROTATION_INTERVAL);

    logger.info('JWT key rotation schedule configured', {
      intervalMs: this.KEY_ROTATION_INTERVAL,
      intervalDays: this.KEY_ROTATION_INTERVAL / (24 * 60 * 60 * 1000)
    });
  }

  /**
   * Rotate JWT signing key
   */
  async rotateSigningKey(): Promise<void> {
    try {
      const newKeyPair = this.generateKeyPair();

      await JWTKeyManager.rotateSigningKey(
        newKeyPair.keyId,
        newKeyPair.privateKey,
        newKeyPair.publicKey
      );

      logger.info('JWT signing key rotated successfully', { newKeyId: newKeyPair.keyId });
    } catch (error) {
      logger.error('Failed to rotate JWT signing key', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  /**
   * Hash password with bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    try {
      const hash = await bcrypt.hash(password, this.SALT_ROUNDS);
      return hash;
    } catch (error) {
      logger.error('Password hashing failed', { error: error instanceof Error ? error.message : error });
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const isValid = await bcrypt.compare(password, hash);
      return isValid;
    } catch (error) {
      logger.error('Password verification failed', { error: error instanceof Error ? error.message : error });
      return false;
    }
  }

  /**
   * Generate access token with current signing key
   */
  async generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'kid'>): Promise<string> {
    try {
      let currentKey = null;

      // Try to get current key from Redis
      try {
        currentKey = await JWTKeyManager.getCurrentSigningKey();
      } catch (redisError) {
        logger.debug('Redis unavailable for key retrieval, using fallback mode');
        currentKey = null;
      }

      if (!currentKey) {
        // In fallback mode, use HS256 with the JWT secret
        logger.debug('Using HS256 fallback for token generation');
        const tokenPayload: JWTPayload = {
          ...payload,
          kid: 'fallback-hs256',
        };

        const token = this.fastify.jwt.sign(tokenPayload, {
          expiresIn: this.ACCESS_TOKEN_EXPIRY,
          algorithm: 'HS256',
          key: config.JWT_SECRET,
        });

        return token;
      }

      // Add key ID to payload for rotation support
      const tokenPayload: JWTPayload = {
        ...payload,
        kid: currentKey.keyId,
      };

      // Sign with RS256 algorithm using the private key
      const token = this.fastify.jwt.sign(tokenPayload, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
        algorithm: 'RS256',
        key: currentKey.privateKey,
      });

      return token;
    } catch (error) {
      logger.error('Access token generation failed', { error: error instanceof Error ? error.message : error });
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate secure refresh token
   */
  async generateRefreshToken(userId: string): Promise<{ token: string; tokenId: string }> {
    try {
      // Generate cryptographically secure token ID
      const tokenId = crypto.randomUUID();

      // Create refresh token payload
      const refreshPayload: RefreshTokenData = {
        userId,
        type: 'refresh',
        tokenId,
      };

      // Sign refresh token (can use HS256 for internal tokens)
      const refreshToken = this.fastify.jwt.sign(refreshPayload, {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        algorithm: 'HS256',
        key: config.JWT_SECRET,
      });

      // Try to store in Redis, but don't fail if Redis is unavailable
      try {
        // Generate secure hash for storage
        const tokenHash = crypto
          .createHash('sha256')
          .update(refreshToken)
          .digest('hex');

        // Store in Redis with expiration
        const expiresInSeconds = 7 * 24 * 60 * 60; // 7 days
        await RefreshTokenManager.storeRefreshToken(userId, tokenId, tokenHash, expiresInSeconds);
        logger.debug('Refresh token stored in Redis', { tokenId });
      } catch (redisError) {
        logger.warn('Redis unavailable for refresh token storage, tokens will be stateless', {
          tokenId,
          error: redisError instanceof Error ? redisError.message : redisError
        });
        // In fallback mode, refresh tokens are still functional but stateless
        // They rely solely on JWT expiration and cannot be revoked until expiry
      }

      return {
        token: refreshToken,
        tokenId,
      };
    } catch (error) {
      logger.error('Refresh token generation failed', { error: error instanceof Error ? error.message : error });
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Generate complete token pair
   */
  async generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp' | 'kid'>): Promise<TokenPair> {
    try {
      const [accessToken, refreshTokenData] = await Promise.all([
        this.generateAccessToken(payload),
        this.generateRefreshToken(payload.userId),
      ]);

      return {
        accessToken,
        refreshToken: refreshTokenData.token,
        expiresIn: 15 * 60, // 15 minutes in seconds
        tokenId: refreshTokenData.tokenId,
      };
    } catch (error) {
      logger.error('Token pair generation failed', { error: error instanceof Error ? error.message : error });
      throw new Error('Token pair generation failed');
    }
  }

  /**
   * Verify access token with key rotation support
   */
  async verifyAccessToken(token: string): Promise<JWTPayload | null> {
    try {
      // First, try to decode without verification to get the key ID
      const unverifiedPayload = this.fastify.jwt.decode(token) as JWTPayload;

      if (!unverifiedPayload || !unverifiedPayload.kid) {
        // Fallback to current key for tokens without key ID
        try {
          const currentKey = await JWTKeyManager.getCurrentSigningKey();
          if (currentKey) {
            const verified = this.fastify.jwt.verify(token, {
              algorithms: ['RS256'],
              key: currentKey.privateKey,
            }) as JWTPayload;
            return verified;
          }
        } catch (redisError) {
          logger.debug('Redis unavailable for key verification, trying HS256 fallback');
        }

        // If Redis is unavailable, try HS256 verification
        try {
          const verified = this.fastify.jwt.verify(token, {
            algorithms: ['HS256'],
            key: config.JWT_SECRET,
          }) as JWTPayload;
          return verified;
        } catch (verifyError) {
          logger.debug('HS256 fallback verification failed');
          return null;
        }
      }

      // Handle fallback HS256 tokens
      if (unverifiedPayload.kid === 'fallback-hs256') {
        const verified = this.fastify.jwt.verify(token, {
          algorithms: ['HS256'],
          key: config.JWT_SECRET,
        }) as JWTPayload;
        return verified;
      }

      // Get the verification key for the specified key ID
      let publicKey = null;
      try {
        publicKey = await JWTKeyManager.getVerificationKey(unverifiedPayload.kid);
      } catch (redisError) {
        logger.debug('Redis unavailable for key retrieval, cannot verify RS256 token');
        return null;
      }

      if (!publicKey) {
        logger.warn('Token uses unknown key ID', { kid: unverifiedPayload.kid });
        return null;
      }

      // Verify with the correct public key
      const verified = this.fastify.jwt.verify(token, {
        algorithms: ['RS256'],
        key: publicKey,
      }) as JWTPayload;

      return verified;
    } catch (error) {
      logger.debug('Access token verification failed', { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  /**
   * Verify refresh token and optionally rotate
   */
  async verifyRefreshToken(
    refreshToken: string,
    rotateIfNeeded: boolean = true
  ): Promise<{
    valid: boolean;
    payload?: RefreshTokenData;
    shouldRotate?: boolean;
    newTokenPair?: TokenPair;
  }> {
    try {
      // Verify JWT signature first
      const decoded = this.fastify.jwt.verify(refreshToken, {
        algorithms: ['HS256'],
        key: config.JWT_SECRET,
      }) as RefreshTokenData;

      if (!decoded || decoded.type !== 'refresh') {
        return { valid: false };
      }

      // Try to validate against Redis storage if available
      let validation = { valid: true, shouldRotate: false };

      try {
        // Generate token hash for Redis lookup
        const tokenHash = crypto
          .createHash('sha256')
          .update(refreshToken)
          .digest('hex');

        // Validate against Redis storage
        validation = await RefreshTokenManager.validateRefreshToken(decoded.tokenId, tokenHash);

        if (!validation.valid) {
          return { valid: false };
        }
      } catch (redisError) {
        logger.debug('Redis unavailable for refresh token validation, using stateless mode', {
          tokenId: decoded.tokenId,
          error: redisError instanceof Error ? redisError.message : redisError
        });
        // In fallback mode, tokens are valid based solely on JWT signature and expiration
        // No revocation or rotation is possible without Redis
        validation = { valid: true, shouldRotate: false };
      }

      // Check if token should be rotated and user requested rotation
      if (validation.shouldRotate && rotateIfNeeded) {
        // Get fresh user data for new token
        const user = await this.fastify.prisma.user.findUnique({
          where: { id: decoded.userId },
          include: {
            permissions: {
              select: { permission: true },
            },
          },
        });

        if (!user || !user.isActive) {
          return { valid: false };
        }

        // Generate new token pair
        const newTokenPayload = {
          userId: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          permissions: user.permissions.map(p => p.permission),
        };

        const newTokenPair = await this.generateTokenPair(newTokenPayload);

        // Rotate refresh token in Redis
        const newTokenHash = crypto
          .createHash('sha256')
          .update(newTokenPair.refreshToken)
          .digest('hex');

        await RefreshTokenManager.rotateRefreshToken(
          decoded.tokenId,
          newTokenPair.tokenId,
          newTokenHash,
          decoded.userId,
          7 * 24 * 60 * 60 // 7 days
        );

        return {
          valid: true,
          payload: decoded,
          shouldRotate: true,
          newTokenPair,
        };
      }

      return {
        valid: true,
        payload: decoded,
        shouldRotate: validation.shouldRotate,
      };
    } catch (error) {
      logger.debug('Refresh token verification failed', { error: error instanceof Error ? error.message : error });
      return { valid: false };
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const decoded = this.fastify.jwt.verify(refreshToken, {
        algorithms: ['HS256'],
        key: config.JWT_SECRET,
      }) as RefreshTokenData;

      if (!decoded || decoded.type !== 'refresh') {
        return false;
      }

      // Generate token hash for identification
      const tokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      // Validate and then revoke
      const validation = await RefreshTokenManager.validateRefreshToken(decoded.tokenId, tokenHash);

      if (validation.valid) {
        await RefreshTokenManager.revokeAllUserTokens(decoded.userId);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Refresh token revocation failed', { error: error instanceof Error ? error.message : error });
      return false;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      await RefreshTokenManager.revokeAllUserTokens(userId);
      logger.info('All user tokens revoked', { userId });
    } catch (error) {
      logger.error('Failed to revoke all user tokens', {
        userId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get JWT key information for debugging/monitoring
   */
  async getKeyInfo(): Promise<{
    currentKeyId?: string;
    availableKeys: Array<{ keyId: string; hasPublicKey: boolean }>;
  }> {
    try {
      const currentKey = await JWTKeyManager.getCurrentSigningKey();
      const allKeys = await JWTKeyManager.getAllVerificationKeys();

      return {
        currentKeyId: currentKey?.keyId,
        availableKeys: allKeys.map(key => ({
          keyId: key.keyId,
          hasPublicKey: Boolean(key.publicKey),
        })),
      };
    } catch (error) {
      logger.error('Failed to get JWT key info', { error: error instanceof Error ? error.message : error });
      return { availableKeys: [] };
    }
  }

  /**
   * Health check for JWT service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    hasSigningKey: boolean;
    keyCount: number;
    error?: string;
  }> {
    try {
      const currentKey = await JWTKeyManager.getCurrentSigningKey();
      const allKeys = await JWTKeyManager.getAllVerificationKeys();

      return {
        healthy: Boolean(currentKey),
        hasSigningKey: Boolean(currentKey),
        keyCount: allKeys.length,
      };
    } catch (error) {
      return {
        healthy: false,
        hasSigningKey: false,
        keyCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Factory function to create JWT service instance
 */
export function createJWTService(fastify: FastifyInstance): JWTService {
  return new JWTService(fastify);
}

export default JWTService;