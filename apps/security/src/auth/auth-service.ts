import bcrypt from 'bcrypt';
import argon2 from 'argon2';
import speakeasy from 'speakeasy';
import type {
  User,
  LoginRequest,
  LoginResponse,
  AuthSession,
  AuthContext,
  SecurityConfig,
  SecurityEventType,
  SecurityEventSeverity
} from '../types/auth.js';
import { JWTService } from './jwt-service.js';
import { SecurityEventService } from '../audit/security-event-service.js';
import { logger } from '../lib/logger.js';

export class AuthService {
  constructor(
    private config: SecurityConfig,
    private jwtService: JWTService,
    private securityEventService: SecurityEventService
  ) {}

  /**
   * Authenticate user with email/password and optional MFA
   */
  async login(request: LoginRequest, clientInfo: { ipAddress: string; userAgent: string }): Promise<LoginResponse> {
    const { email, password, mfaCode, rememberMe = false } = request;
    const { ipAddress, userAgent } = clientInfo;

    try {
      // Step 1: Find user by email
      const user = await this.findUserByEmail(email);
      if (!user) {
        await this.logSecurityEvent({
          eventType: SecurityEventType.LOGIN_FAILED,
          description: `Login failed: User not found for email ${email}`,
          severity: SecurityEventSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: { email, reason: 'user_not_found' }
        });
        throw new Error('Invalid credentials');
      }

      // Step 2: Check if account is active
      if (!user.isActive) {
        await this.logSecurityEvent({
          userId: user.id,
          eventType: SecurityEventType.LOGIN_BLOCKED,
          description: 'Login blocked: Account is inactive',
          severity: SecurityEventSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: { email, reason: 'account_inactive' }
        });
        throw new Error('Account is inactive');
      }

      // Step 3: Verify password
      const isPasswordValid = await this.verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        await this.logSecurityEvent({
          userId: user.id,
          eventType: SecurityEventType.LOGIN_FAILED,
          description: 'Login failed: Invalid password',
          severity: SecurityEventSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: { email, reason: 'invalid_password' }
        });
        throw new Error('Invalid credentials');
      }

      // Step 4: Verify MFA if enabled
      if (user.mfaEnabled) {
        if (!mfaCode) {
          throw new Error('MFA code required');
        }
        
        const isMFAValid = await this.verifyMFA(user.mfaSecret, mfaCode);
        if (!isMFAValid) {
          await this.logSecurityEvent({
            userId: user.id,
            eventType: SecurityEventType.LOGIN_FAILED,
            description: 'Login failed: Invalid MFA code',
            severity: SecurityEventSeverity.HIGH,
            ipAddress,
            userAgent,
            metadata: { email, reason: 'invalid_mfa' }
          });
          throw new Error('Invalid MFA code');
        }
      }

      // Step 5: Check session limits
      await this.enforceSessionLimits(user.id);

      // Step 6: Create new session
      const sessionId = this.jwtService.generateSessionId();
      const tokenFamily = this.jwtService.generateTokenFamily();
      
      // Step 7: Generate tokens
      const accessToken = await this.jwtService.generateAccessToken(user, sessionId);
      const refreshToken = await this.jwtService.generateRefreshToken(user.id, sessionId, tokenFamily);
      
      // Step 8: Store session
      const session = await this.createAuthSession({
        id: sessionId,
        userId: user.id,
        tokenFamily,
        refreshTokenHash: this.jwtService.hashRefreshToken(refreshToken),
        ipAddress,
        userAgent,
        isActive: true,
        expiresAt: new Date(Date.now() + this.parseExpiry(this.config.jwt.refreshTokenExpiry) * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Step 9: Update user last login
      await this.updateUserLastLogin(user.id);

      // Step 10: Log successful login
      await this.logSecurityEvent({
        userId: user.id,
        sessionId,
        eventType: SecurityEventType.LOGIN_SUCCESS,
        description: 'User logged in successfully',
        severity: SecurityEventSeverity.LOW,
        ipAddress,
        userAgent,
        metadata: { 
          email, 
          mfaUsed: user.mfaEnabled,
          rememberMe,
          sessionId 
        }
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: this.parseExpiry(this.config.jwt.accessTokenExpiry),
        tokenType: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          mfaEnabled: user.mfaEnabled,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      };

    } catch (error) {
      logger.error('Login failed', { error, email, ipAddress });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<LoginResponse> {
    const { ipAddress, userAgent } = clientInfo;

    try {
      // Step 1: Verify refresh token
      const payload = await this.jwtService.verifyRefreshToken(refreshToken);
      
      // Step 2: Find session
      const session = await this.findAuthSession(payload.sessionId);
      if (!session || !session.isActive) {
        throw new Error('Invalid session');
      }

      // Step 3: Verify token family (detect token reuse)
      if (session.tokenFamily !== payload.tokenFamily) {
        // Potential token theft - revoke all user sessions
        await this.revokeAllUserSessions(payload.sub, 'Token reuse detected');
        throw new Error('Token reuse detected');
      }

      // Step 4: Verify refresh token hash
      if (!this.jwtService.validateRefreshTokenHash(refreshToken, session.refreshTokenHash)) {
        throw new Error('Invalid refresh token');
      }

      // Step 5: Check session expiry
      if (session.expiresAt < new Date()) {
        await this.revokeSession(session.id);
        throw new Error('Session expired');
      }

      // Step 6: Get user details
      const user = await this.findUserById(payload.sub);
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Step 7: Generate new tokens with same session
      const newAccessToken = await this.jwtService.generateAccessToken(user, session.id);
      const newRefreshToken = await this.jwtService.generateRefreshToken(user.id, session.id, session.tokenFamily);
      
      // Step 8: Update session with new refresh token hash
      await this.updateAuthSession(session.id, {
        refreshTokenHash: this.jwtService.hashRefreshToken(newRefreshToken),
        updatedAt: new Date()
      });

      // Step 9: Log token refresh
      await this.logSecurityEvent({
        userId: user.id,
        sessionId: session.id,
        eventType: SecurityEventType.TOKEN_REFRESH,
        description: 'Access token refreshed',
        severity: SecurityEventSeverity.LOW,
        ipAddress,
        userAgent,
        metadata: { sessionId: session.id }
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: this.parseExpiry(this.config.jwt.accessTokenExpiry),
        tokenType: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          mfaEnabled: user.mfaEnabled,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      };

    } catch (error) {
      logger.error('Token refresh failed', { error, ipAddress });
      throw error;
    }
  }

  /**
   * Logout user and revoke session
   */
  async logout(sessionId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<void> {
    const { ipAddress, userAgent } = clientInfo;

    try {
      const session = await this.findAuthSession(sessionId);
      if (session) {
        await this.revokeSession(sessionId);
        
        await this.logSecurityEvent({
          userId: session.userId,
          sessionId,
          eventType: SecurityEventType.LOGOUT,
          description: 'User logged out',
          severity: SecurityEventSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: { sessionId }
        });
      }
    } catch (error) {
      logger.error('Logout failed', { error, sessionId, ipAddress });
      throw error;
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<void> {
    const { ipAddress, userAgent } = clientInfo;

    try {
      await this.revokeAllUserSessions(userId, 'User logged out from all devices');
      
      await this.logSecurityEvent({
        userId,
        eventType: SecurityEventType.LOGOUT,
        description: 'User logged out from all devices',
        severity: SecurityEventSeverity.MEDIUM,
        ipAddress,
        userAgent,
        metadata: { reason: 'logout_all' }
      });
    } catch (error) {
      logger.error('Logout all failed', { error, userId, ipAddress });
      throw error;
    }
  }

  /**
   * Verify password using argon2 (preferred) or bcrypt (fallback)
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      // Try argon2 first (modern hashing)
      if (hash.startsWith('$argon2')) {
        return await argon2.verify(hash, password);
      }
      
      // Fallback to bcrypt for legacy passwords
      if (hash.startsWith('$2b$') || hash.startsWith('$2a$') || hash.startsWith('$2y$')) {
        return await bcrypt.compare(password, hash);
      }
      
      return false;
    } catch (error) {
      logger.error('Password verification failed', { error });
      return false;
    }
  }

  /**
   * Verify MFA code using TOTP
   */
  private async verifyMFA(secret: string, code: string): Promise<boolean> {
    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 2 // Allow some time drift
      });
    } catch (error) {
      logger.error('MFA verification failed', { error });
      return false;
    }
  }

  /**
   * Enforce maximum active sessions per user
   */
  private async enforceSessionLimits(userId: string): Promise<void> {
    const activeSessions = await this.getUserActiveSessions(userId);
    const maxSessions = this.config.session.maxActiveSessions;

    if (activeSessions.length >= maxSessions) {
      // Remove oldest sessions
      const sessionsToRemove = activeSessions
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, activeSessions.length - maxSessions + 1);

      for (const session of sessionsToRemove) {
        await this.revokeSession(session.id);
      }
    }
  }

  /**
   * Parse expiry string to milliseconds
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
   * Log security event
   */
  private async logSecurityEvent(event: Omit<Parameters<SecurityEventService['logSecurityEvent']>[0], 'id' | 'createdAt'>): Promise<void> {
    await this.securityEventService.logSecurityEvent(event);
  }

  // Database methods (these would be implemented with your actual database layer)
  private async findUserByEmail(email: string): Promise<User | null> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }

  private async findUserById(id: string): Promise<User | null> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }

  private async updateUserLastLogin(userId: string): Promise<void> {
    // TODO: Implement database update
    throw new Error('Not implemented');
  }

  private async createAuthSession(session: AuthSession): Promise<AuthSession> {
    // TODO: Implement database insert
    throw new Error('Not implemented');
  }

  private async findAuthSession(sessionId: string): Promise<AuthSession | null> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }

  private async updateAuthSession(sessionId: string, updates: Partial<AuthSession>): Promise<void> {
    // TODO: Implement database update
    throw new Error('Not implemented');
  }

  private async revokeSession(sessionId: string): Promise<void> {
    // TODO: Implement database update
    throw new Error('Not implemented');
  }

  private async revokeAllUserSessions(userId: string, reason: string): Promise<void> {
    // TODO: Implement database update
    throw new Error('Not implemented');
  }

  private async getUserActiveSessions(userId: string): Promise<AuthSession[]> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }
}