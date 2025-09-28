import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/lib/logger.js';
import { connectRedis, getRedisClient } from '@/lib/redis.js';

// ============================================================================
// SECURE SESSION MANAGEMENT SERVICE
// ============================================================================

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  loginTime: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
  csrfToken: string;
  mfaVerified?: boolean;
  ssoProvider?: string;
}

export interface SessionConfig {
  cookieName: string;
  maxAge: number; // in seconds
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
  path: string;
}

export class SessionService {
  private config: SessionConfig;
  private redisClient: any;
  private memoryStore = new Map<string, { data: SessionData; expires: number }>();
  private useRedis = false;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = {
      cookieName: 'urnlabs_session',
      maxAge: 24 * 60 * 60, // 24 hours
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      ...config,
    };

    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = getRedisClient();
      if (this.redisClient) {
        this.useRedis = true;
        logger.info('Session service using Redis for session storage');
      } else {
        logger.warn('Session service using in-memory storage (not recommended for production)');
      }
    } catch (error) {
      logger.warn('Failed to connect to Redis, using in-memory session storage', { error });
    }
  }

  /**
   * Create a new session
   */
  async createSession(
    reply: FastifyReply,
    userData: Omit<SessionData, 'loginTime' | 'lastActivity' | 'csrfToken'>
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const csrfToken = this.generateCSRFToken();
    const now = Date.now();

    const sessionData: SessionData = {
      ...userData,
      loginTime: now,
      lastActivity: now,
      csrfToken,
    };

    // Store session data
    await this.storeSession(sessionId, sessionData);

    // Set secure cookie
    this.setSessionCookie(reply, sessionId);

    logger.info('Session created', {
      sessionId: this.maskSessionId(sessionId),
      userId: userData.userId,
      email: userData.email,
      ipAddress: userData.ipAddress,
    });

    return sessionId;
  }

  /**
   * Get session data by session ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!sessionId) return null;

    try {
      let sessionData: SessionData | null = null;

      if (this.useRedis && this.redisClient) {
        const data = await this.redisClient.get(`session:${sessionId}`);
        sessionData = data ? JSON.parse(data) : null;
      } else {
        const stored = this.memoryStore.get(sessionId);
        if (stored && stored.expires > Date.now()) {
          sessionData = stored.data;
        } else if (stored) {
          this.memoryStore.delete(sessionId);
        }
      }

      if (sessionData) {
        // Update last activity
        sessionData.lastActivity = Date.now();
        await this.storeSession(sessionId, sessionData);
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session', {
        sessionId: this.maskSessionId(sessionId),
        error: error instanceof Error ? error.message : error
      });
      return null;
    }
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    const existingSession = await this.getSession(sessionId);
    if (!existingSession) return false;

    const updatedSession: SessionData = {
      ...existingSession,
      ...updates,
      lastActivity: Date.now(),
    };

    await this.storeSession(sessionId, updatedSession);
    return true;
  }

  /**
   * Destroy a session
   */
  async destroySession(reply: FastifyReply, sessionId: string): Promise<void> {
    if (!sessionId) return;

    try {
      if (this.useRedis && this.redisClient) {
        await this.redisClient.del(`session:${sessionId}`);
      } else {
        this.memoryStore.delete(sessionId);
      }

      // Clear cookie
      reply.clearCookie(this.config.cookieName, {
        path: this.config.path,
        domain: this.config.domain,
      });

      logger.info('Session destroyed', {
        sessionId: this.maskSessionId(sessionId),
      });
    } catch (error) {
      logger.error('Failed to destroy session', {
        sessionId: this.maskSessionId(sessionId),
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Validate session and check for security issues
   */
  async validateSession(
    request: FastifyRequest,
    sessionId: string
  ): Promise<{ valid: boolean; session?: SessionData; reason?: string }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    // Check session expiry
    const maxAge = this.config.maxAge * 1000; // Convert to milliseconds
    if (Date.now() - session.loginTime > maxAge) {
      await this.destroySession(request.server.inject().then(res => res) as any, sessionId);
      return { valid: false, reason: 'Session expired' };
    }

    // Check for session fixation (IP change)
    if (session.ipAddress !== request.ip) {
      logger.warn('Session IP address mismatch detected', {
        sessionId: this.maskSessionId(sessionId),
        originalIP: session.ipAddress,
        currentIP: request.ip,
        userId: session.userId,
      });
      await this.destroySession(request.server.inject().then(res => res) as any, sessionId);
      return { valid: false, reason: 'IP address mismatch' };
    }

    // Check for suspicious user agent changes
    const currentUserAgent = request.headers['user-agent'] || '';
    if (session.userAgent && session.userAgent !== currentUserAgent) {
      logger.warn('Session user agent mismatch detected', {
        sessionId: this.maskSessionId(sessionId),
        originalUA: session.userAgent,
        currentUA: currentUserAgent,
        userId: session.userId,
      });
      // Don't auto-destroy for UA changes, but log for monitoring
    }

    // Check for session inactivity
    const maxInactivity = 2 * 60 * 60 * 1000; // 2 hours
    if (Date.now() - session.lastActivity > maxInactivity) {
      await this.destroySession(request.server.inject().then(res => res) as any, sessionId);
      return { valid: false, reason: 'Session inactive too long' };
    }

    return { valid: true, session };
  }

  /**
   * Get session ID from request cookie
   */
  getSessionIdFromRequest(request: FastifyRequest): string | null {
    return request.cookies?.[this.config.cookieName] || null;
  }

  /**
   * Generate CSRF token for session
   */
  generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(sessionCSRF: string, requestCSRF: string): boolean {
    if (!sessionCSRF || !requestCSRF) return false;
    return crypto.timingSafeEqual(
      Buffer.from(sessionCSRF, 'hex'),
      Buffer.from(requestCSRF, 'hex')
    );
  }

  /**
   * Clean up expired sessions (for memory store)
   */
  async cleanupExpiredSessions(): Promise<void> {
    if (this.useRedis) return; // Redis handles TTL automatically

    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.memoryStore.entries()) {
      if (session.expires < now) {
        this.memoryStore.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired sessions from memory store`);
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    activeSessions: number;
    totalSessionsToday: number;
    memoryUsage?: number;
  }> {
    if (this.useRedis && this.redisClient) {
      try {
        const keys = await this.redisClient.keys('session:*');
        return {
          activeSessions: keys.length,
          totalSessionsToday: keys.length, // Simplified for now
        };
      } catch (error) {
        logger.error('Failed to get Redis session stats', { error });
        return { activeSessions: 0, totalSessionsToday: 0 };
      }
    } else {
      const memoryUsage = JSON.stringify(Array.from(this.memoryStore.values())).length;
      return {
        activeSessions: this.memoryStore.size,
        totalSessionsToday: this.memoryStore.size,
        memoryUsage,
      };
    }
  }

  // Private helper methods

  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async storeSession(sessionId: string, sessionData: SessionData): Promise<void> {
    if (this.useRedis && this.redisClient) {
      await this.redisClient.setex(
        `session:${sessionId}`,
        this.config.maxAge,
        JSON.stringify(sessionData)
      );
    } else {
      this.memoryStore.set(sessionId, {
        data: sessionData,
        expires: Date.now() + (this.config.maxAge * 1000),
      });
    }
  }

  private setSessionCookie(reply: FastifyReply, sessionId: string): void {
    reply.setCookie(this.config.cookieName, sessionId, {
      maxAge: this.config.maxAge * 1000, // Convert to milliseconds
      secure: this.config.secure,
      httpOnly: this.config.httpOnly,
      sameSite: this.config.sameSite,
      domain: this.config.domain,
      path: this.config.path,
    });
  }

  private maskSessionId(sessionId: string): string {
    if (!sessionId || sessionId.length < 8) return 'invalid';
    return `${sessionId.substring(0, 4)}...${sessionId.substring(sessionId.length - 4)}`;
  }
}

// Singleton instance
let sessionServiceInstance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!sessionServiceInstance) {
    sessionServiceInstance = new SessionService();
  }
  return sessionServiceInstance;
}

export default SessionService;