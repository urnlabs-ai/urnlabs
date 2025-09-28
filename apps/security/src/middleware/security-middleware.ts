import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { SecurityConfig, User, AuthContext } from '../types/auth.js';
import { JWTService } from '../auth/jwt-service.js';
import { AuthorizationService } from '../rbac/authorization-service.js';
import { SecurityEventService } from '../audit/security-event-service.js';
import { logger } from '../lib/logger.js';

export interface SecurityMiddlewareOptions {
  config: SecurityConfig;
  jwtService: JWTService;
  authorizationService: AuthorizationService;
  securityEventService: SecurityEventService;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (request: FastifyRequest) => string;
}

export interface AuthenticationOptions {
  required?: boolean;
  allowedRoles?: string[];
  requiredPermissions?: Array<{ resource: string; action: string }>;
}

export interface CSRFOptions {
  enabled: boolean;
  tokenHeader?: string;
  cookieName?: string;
  secretLength?: number;
}

export class SecurityMiddleware {
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private csrfTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(private options: SecurityMiddlewareOptions) {}

  /**
   * Rate limiting middleware
   */
  createRateLimitMiddleware(options: RateLimitOptions) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const key = options.keyGenerator ? 
        options.keyGenerator(request) : 
        this.getClientKey(request);

      const now = Date.now();
      const windowStart = now - options.windowMs;

      // Clean up expired entries
      this.cleanupRateLimitStore(windowStart);

      // Get or create rate limit record
      let record = this.rateLimitStore.get(key);
      if (!record || record.resetTime < windowStart) {
        record = { count: 0, resetTime: now + options.windowMs };
        this.rateLimitStore.set(key, record);
      }

      // Check if limit exceeded
      if (record.count >= options.maxRequests) {
        await this.logRateLimitExceeded(request, options);
        
        reply.status(429).send({
          error: 'Too Many Requests',
          message: options.message || 'Rate limit exceeded',
          retryAfter: Math.ceil((record.resetTime - now) / 1000)
        });
        return;
      }

      // Increment counter
      record.count++;

      // Add rate limit headers
      reply.header('X-RateLimit-Limit', options.maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, options.maxRequests - record.count));
      reply.header('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    };
  }

  /**
   * JWT Authentication middleware
   */
  createAuthenticationMiddleware(options: AuthenticationOptions = {}) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = this.extractToken(request);
        
        if (!token) {
          if (options.required !== false) {
            reply.status(401).send({
              error: 'Unauthorized',
              message: 'Authentication token required'
            });
            return;
          }
          return; // Optional authentication
        }

        // Verify JWT token
        const payload = await this.options.jwtService.verifyAccessToken(token);
        
        // Get user details
        const user = await this.getUserById(payload.sub);
        if (!user || !user.isActive) {
          reply.status(401).send({
            error: 'Unauthorized',
            message: 'Invalid or inactive user'
          });
          return;
        }

        // Check session validity
        const session = await this.getAuthSession(payload.sessionId);
        if (!session || !session.isActive) {
          reply.status(401).send({
            error: 'Unauthorized',
            message: 'Invalid session'
          });
          return;
        }

        // Check role requirements
        if (options.allowedRoles && options.allowedRoles.length > 0) {
          const userRoles = user.roles.map(r => r.name);
          const hasRequiredRole = options.allowedRoles.some(role => userRoles.includes(role));
          
          if (!hasRequiredRole) {
            await this.logUnauthorizedAccess(request, user, 'Insufficient role permissions');
            reply.status(403).send({
              error: 'Forbidden',
              message: 'Insufficient role permissions'
            });
            return;
          }
        }

        // Check permission requirements
        if (options.requiredPermissions && options.requiredPermissions.length > 0) {
          for (const perm of options.requiredPermissions) {
            const result = await this.options.authorizationService.checkPermission({
              userId: user.id,
              resource: perm.resource,
              action: perm.action,
              context: {
                ipAddress: this.getClientIP(request),
                userAgent: request.headers['user-agent'] || 'unknown'
              }
            });

            if (!result.allowed) {
              await this.logUnauthorizedAccess(request, user, `Missing permission: ${perm.resource}:${perm.action}`);
              reply.status(403).send({
                error: 'Forbidden',
                message: 'Insufficient permissions'
              });
              return;
            }
          }
        }

        // Add auth context to request
        (request as any).auth = {
          user,
          sessionId: payload.sessionId,
          ipAddress: this.getClientIP(request),
          userAgent: request.headers['user-agent'] || 'unknown'
        } as AuthContext;

      } catch (error) {
        logger.error('Authentication middleware error', { error });
        reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication failed'
        });
      }
    };
  }

  /**
   * CSRF Protection middleware
   */
  createCSRFMiddleware(options: CSRFOptions) {
    if (!options.enabled) {
      return async () => {}; // No-op if disabled
    }

    return async (request: FastifyRequest, reply: FastifyReply) => {
      const method = request.method.toLowerCase();
      
      // Skip CSRF check for safe methods
      if (['get', 'head', 'options'].includes(method)) {
        return;
      }

      const sessionId = this.getSessionId(request);
      if (!sessionId) {
        reply.status(403).send({
          error: 'Forbidden',
          message: 'CSRF token validation failed: No session'
        });
        return;
      }

      const tokenHeader = options.tokenHeader || 'x-csrf-token';
      const submittedToken = request.headers[tokenHeader] as string;
      
      if (!submittedToken) {
        reply.status(403).send({
          error: 'Forbidden',
          message: 'CSRF token required'
        });
        return;
      }

      const storedTokenData = this.csrfTokens.get(sessionId);
      if (!storedTokenData) {
        reply.status(403).send({
          error: 'Forbidden',
          message: 'CSRF token validation failed: No stored token'
        });
        return;
      }

      // Check token expiry
      if (Date.now() > storedTokenData.expiresAt) {
        this.csrfTokens.delete(sessionId);
        reply.status(403).send({
          error: 'Forbidden',
          message: 'CSRF token expired'
        });
        return;
      }

      // Validate token
      if (submittedToken !== storedTokenData.token) {
        await this.logCSRFAttack(request);
        reply.status(403).send({
          error: 'Forbidden',
          message: 'CSRF token validation failed'
        });
        return;
      }
    };
  }

  /**
   * Security Headers middleware
   */
  createSecurityHeadersMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Security headers
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Content Security Policy
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'"
      ].join('; ');
      reply.header('Content-Security-Policy', csp);

      // HSTS for HTTPS
      if (request.protocol === 'https') {
        reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }
    };
  }

  /**
   * Request Validation middleware
   */
  createRequestValidationMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Check Content-Length limits
      const contentLength = parseInt(request.headers['content-length'] || '0');
      const maxSize = 10 * 1024 * 1024; // 10MB default
      
      if (contentLength > maxSize) {
        reply.status(413).send({
          error: 'Payload Too Large',
          message: 'Request body too large'
        });
        return;
      }

      // Validate Content-Type for POST/PUT requests
      const method = request.method.toLowerCase();
      if (['post', 'put', 'patch'].includes(method)) {
        const contentType = request.headers['content-type'];
        if (!contentType) {
          reply.status(400).send({
            error: 'Bad Request',
            message: 'Content-Type header required'
          });
          return;
        }

        // Only allow specific content types
        const allowedTypes = [
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data'
        ];
        
        const isAllowed = allowedTypes.some(type => contentType.startsWith(type));
        if (!isAllowed) {
          reply.status(415).send({
            error: 'Unsupported Media Type',
            message: 'Content-Type not supported'
          });
          return;
        }
      }

      // Validate User-Agent
      const userAgent = request.headers['user-agent'];
      if (!userAgent || userAgent.length < 10) {
        await this.logSuspiciousRequest(request, 'Missing or suspicious User-Agent');
      }
    };
  }

  /**
   * Generate CSRF token for session
   */
  generateCSRFToken(sessionId: string, expiryMinutes: number = 60): string {
    const token = this.options.jwtService.generateCSRFToken();
    const expiresAt = Date.now() + (expiryMinutes * 60 * 1000);
    
    this.csrfTokens.set(sessionId, { token, expiresAt });
    
    return token;
  }

  /**
   * Cleanup expired CSRF tokens
   */
  cleanupCSRFTokens(): void {
    const now = Date.now();
    for (const [sessionId, tokenData] of this.csrfTokens.entries()) {
      if (now > tokenData.expiresAt) {
        this.csrfTokens.delete(sessionId);
      }
    }
  }

  /**
   * Get client IP address
   */
  private getClientIP(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    
    const realIP = request.headers['x-real-ip'];
    if (realIP && typeof realIP === 'string') {
      return realIP;
    }
    
    return request.ip || 'unknown';
  }

  /**
   * Get client key for rate limiting
   */
  private getClientKey(request: FastifyRequest): string {
    const auth = (request as any).auth;
    if (auth?.user?.id) {
      return `user:${auth.user.id}`;
    }
    return `ip:${this.getClientIP(request)}`;
  }

  /**
   * Extract JWT token from request
   */
  private extractToken(request: FastifyRequest): string | null {
    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader) {
      return this.options.jwtService.extractBearerToken(authHeader);
    }
    
    // Check cookies
    const cookies = request.cookies;
    if (cookies?.accessToken) {
      return cookies.accessToken;
    }
    
    return null;
  }

  /**
   * Get session ID from request
   */
  private getSessionId(request: FastifyRequest): string | null {
    const auth = (request as any).auth;
    return auth?.sessionId || null;
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupRateLimitStore(windowStart: number): void {
    for (const [key, record] of this.rateLimitStore.entries()) {
      if (record.resetTime < windowStart) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  /**
   * Log rate limit exceeded event
   */
  private async logRateLimitExceeded(request: FastifyRequest, options: RateLimitOptions): Promise<void> {
    try {
      await this.options.securityEventService.logSecurityEvent({
        eventType: 'SUSPICIOUS_ACTIVITY' as any,
        description: 'Rate limit exceeded',
        severity: 'MEDIUM' as any,
        ipAddress: this.getClientIP(request),
        userAgent: request.headers['user-agent'] || 'unknown',
        metadata: {
          endpoint: request.url,
          method: request.method,
          maxRequests: options.maxRequests,
          windowMs: options.windowMs
        }
      });
    } catch (error) {
      logger.error('Failed to log rate limit exceeded', { error });
    }
  }

  /**
   * Log unauthorized access attempt
   */
  private async logUnauthorizedAccess(request: FastifyRequest, user: User, reason: string): Promise<void> {
    try {
      await this.options.securityEventService.logSecurityEvent({
        userId: user.id,
        eventType: 'PERMISSION_DENIED' as any,
        description: `Unauthorized access: ${reason}`,
        severity: 'MEDIUM' as any,
        ipAddress: this.getClientIP(request),
        userAgent: request.headers['user-agent'] || 'unknown',
        metadata: {
          endpoint: request.url,
          method: request.method,
          reason
        }
      });
    } catch (error) {
      logger.error('Failed to log unauthorized access', { error });
    }
  }

  /**
   * Log CSRF attack attempt
   */
  private async logCSRFAttack(request: FastifyRequest): Promise<void> {
    try {
      await this.options.securityEventService.logSecurityEvent({
        eventType: 'SUSPICIOUS_ACTIVITY' as any,
        description: 'CSRF attack attempt detected',
        severity: 'HIGH' as any,
        ipAddress: this.getClientIP(request),
        userAgent: request.headers['user-agent'] || 'unknown',
        metadata: {
          endpoint: request.url,
          method: request.method,
          referer: request.headers.referer
        }
      });
    } catch (error) {
      logger.error('Failed to log CSRF attack', { error });
    }
  }

  /**
   * Log suspicious request
   */
  private async logSuspiciousRequest(request: FastifyRequest, reason: string): Promise<void> {
    try {
      await this.options.securityEventService.logSecurityEvent({
        eventType: 'SUSPICIOUS_ACTIVITY' as any,
        description: `Suspicious request: ${reason}`,
        severity: 'LOW' as any,
        ipAddress: this.getClientIP(request),
        userAgent: request.headers['user-agent'] || 'unknown',
        metadata: {
          endpoint: request.url,
          method: request.method,
          reason
        }
      });
    } catch (error) {
      logger.error('Failed to log suspicious request', { error });
    }
  }

  // Database methods (to be implemented)
  private async getUserById(userId: string): Promise<User | null> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }

  private async getAuthSession(sessionId: string): Promise<any> {
    // TODO: Implement database query
    throw new Error('Not implemented');
  }
}