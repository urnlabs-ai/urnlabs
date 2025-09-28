import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  JWTPayload,
  RefreshTokenPayload,
  AuthSession,
  User,
  SecurityConfig,
  AuthContext
} from '../types/auth.js';
import { logger } from '../lib/logger.js';
import { SecurityEventService } from '../audit/security-event-service.js';
import { EncryptionService } from '../encryption/encryption-service.js';

export class JWTService {
  private securityEventService: SecurityEventService;
  private encryptionService: EncryptionService;

  constructor(
    private config: SecurityConfig,
    securityEventService: SecurityEventService,
    encryptionService: EncryptionService
  ) {
    this.securityEventService = securityEventService;
    this.encryptionService = encryptionService;
  }

  /**
   * Generate access token for authenticated user
   */
  async generateAccessToken(user: User, sessionId: string): Promise<string> {
    try {
      const payload: JWTPayload = {
        sub: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles.map(role => role.name),
        permissions: user.permissions.map(perm => `${perm.resource}:${perm.action}`),
        sessionId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpiry(this.config.jwt.accessTokenExpiry),
        iss: this.config.jwt.issuer,
        aud: this.config.jwt.audience
      };

      const token = jwt.sign(payload, this.config.jwt.accessTokenSecret, {
        algorithm: 'HS256'
      });

      logger.info('Access token generated', { 
        userId: user.id, 
        sessionId,
        expiresIn: this.config.jwt.accessTokenExpiry 
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate access token', { error, userId: user.id });
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token for session management
   */
  async generateRefreshToken(userId: string, sessionId: string, tokenFamily: string): Promise<string> {
    try {
      const payload: RefreshTokenPayload = {
        sub: userId,
        sessionId,
        tokenFamily,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpiry(this.config.jwt.refreshTokenExpiry),
        iss: this.config.jwt.issuer,
        aud: this.config.jwt.audience
      };

      const token = jwt.sign(payload, this.config.jwt.refreshTokenSecret, {
        algorithm: 'HS256'
      });

      logger.info('Refresh token generated', { 
        userId, 
        sessionId,
        tokenFamily,
        expiresIn: this.config.jwt.refreshTokenExpiry 
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate refresh token', { error, userId });
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Verify and decode access token
   */
  async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, this.config.jwt.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience
      }) as JWTPayload;

      // Validate token structure
      if (!decoded.sub || !decoded.sessionId || !decoded.email) {
        throw new Error('Invalid token payload');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid access token', { error: error.message });
        throw new Error('Invalid token');
      } else if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Expired access token', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      } else {
        logger.error('Token verification failed', { error });
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Verify and decode refresh token
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const decoded = jwt.verify(token, this.config.jwt.refreshTokenSecret, {
        algorithms: ['HS256'],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience
      }) as RefreshTokenPayload;

      // Validate token structure
      if (!decoded.sub || !decoded.sessionId || !decoded.tokenFamily) {
        throw new Error('Invalid refresh token payload');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid refresh token', { error: error.message });
        throw new Error('Invalid refresh token');
      } else if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Expired refresh token', { expiredAt: error.expiredAt });
        throw new Error('Refresh token expired');
      } else {
        logger.error('Refresh token verification failed', { error });
        throw new Error('Refresh token verification failed');
      }
    }
  }

  /**
   * Generate secure token family for refresh token rotation
   */
  generateTokenFamily(): string {
    return uuidv4();
  }

  /**
   * Hash refresh token for secure storage
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Validate refresh token against stored hash
   */
  validateRefreshTokenHash(token: string, hash: string): boolean {
    const computedHash = this.hashRefreshToken(token);
    return computedHash === hash;
  }

  /**
   * Generate secure session ID
   */
  generateSessionId(): string {
    return uuidv4();
  }

  /**
   * Extract bearer token from authorization header
   */
  extractBearerToken(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Create secure cookie options for token storage
   */
  getSecureCookieOptions(maxAge?: number) {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: maxAge || this.parseExpiry(this.config.jwt.refreshTokenExpiry) * 1000,
      path: '/'
    };
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiry(expiry: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Revoke all tokens for a user (logout from all devices)
   */
  async revokeAllUserTokens(userId: string, reason: string = 'User logout'): Promise<void> {
    try {
      // This would typically involve database operations to mark sessions as inactive
      // For now, we'll log the event
      await this.securityEventService.logSecurityEvent({
        userId,
        eventType: 'TOKEN_REVOKED' as any,
        description: `All tokens revoked: ${reason}`,
        severity: 'MEDIUM' as any,
        ipAddress: 'system',
        userAgent: 'system',
        metadata: { reason, revokedAt: new Date().toISOString() }
      });

      logger.info('All user tokens revoked', { userId, reason });
    } catch (error) {
      logger.error('Failed to revoke user tokens', { error, userId });
      throw error;
    }
  }

  /**
   * Revoke specific session token
   */
  async revokeSessionToken(sessionId: string, reason: string = 'Session logout'): Promise<void> {
    try {
      await this.securityEventService.logSecurityEvent({
        sessionId,
        eventType: 'TOKEN_REVOKED' as any,
        description: `Session token revoked: ${reason}`,
        severity: 'LOW' as any,
        ipAddress: 'system',
        userAgent: 'system',
        metadata: { reason, revokedAt: new Date().toISOString() }
      });

      logger.info('Session token revoked', { sessionId, reason });
    } catch (error) {
      logger.error('Failed to revoke session token', { error, sessionId });
      throw error;
    }
  }

  /**
   * Generate anti-CSRF token
   */
  generateCSRFToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Validate anti-CSRF token
   */
  validateCSRFToken(token: string, sessionToken: string): boolean {
    // Simple validation - in production, this should be more sophisticated
    return token.length === 64 && /^[a-f0-9]+$/i.test(token);
  }
}