import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { 
  LoginRequest, 
  RefreshTokenRequest, 
  SecurityConfig,
  AuthContext
} from '../types/auth.js';
import { AuthService } from '../auth/auth-service.js';
import { JWTService } from '../auth/jwt-service.js';
import { SecurityEventService } from '../audit/security-event-service.js';
import { EncryptionService } from '../encryption/encryption-service.js';
import { SecurityMiddleware } from '../middleware/security-middleware.js';
import { logger } from '../lib/logger.js';

export async function authRoutes(fastify: FastifyInstance) {
  const config: SecurityConfig = {
    jwt: {
      accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'your-access-secret',
      refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
      accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
      refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
      issuer: process.env.JWT_ISSUER || 'urnlabs-security',
      audience: process.env.JWT_AUDIENCE || 'urnlabs-platform'
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16
    },
    rateLimit: {
      auth: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5, // 5 login attempts per 15 minutes
        message: 'Too many login attempts, please try again later'
      },
      api: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 100,
        message: 'API rate limit exceeded'
      },
      upload: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10,
        message: 'Upload rate limit exceeded'
      }
    },
    session: {
      maxActiveSessions: 5,
      inactivityTimeout: 30 * 60 * 1000 // 30 minutes
    },
    password: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAge: 90 // days
    }
  };

  // Initialize services
  const securityEventService = new SecurityEventService();
  const encryptionService = new EncryptionService(config);
  const jwtService = new JWTService(config, securityEventService, encryptionService);
  const authService = new AuthService(config, jwtService, securityEventService);
  const securityMiddleware = new SecurityMiddleware({
    config,
    jwtService,
    authorizationService: null as any, // Will be injected
    securityEventService
  });

  // Apply rate limiting to auth routes
  const authRateLimit = securityMiddleware.createRateLimitMiddleware(config.rateLimit.auth);

  // Login endpoint
  fastify.post('/login', {
    preHandler: [authRateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
          mfaCode: { type: 'string', pattern: '^[0-9]{6}$' },
          rememberMe: { type: 'boolean', default: false }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'number' },
            tokenType: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' },
                isActive: { type: 'boolean' },
                emailVerified: { type: 'boolean' },
                mfaEnabled: { type: 'boolean' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const loginRequest = request.body as LoginRequest;
      const clientInfo = {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || 'unknown'
      };

      const result = await authService.login(loginRequest, clientInfo);

      // Set refresh token as secure HTTP-only cookie
      const cookieOptions = jwtService.getSecureCookieOptions();
      reply.setCookie('refreshToken', result.refreshToken, cookieOptions);

      // Don't include refresh token in response body for security
      const { refreshToken, ...responseData } = result;
      
      reply.send(responseData);
    } catch (error: any) {
      logger.error('Login failed', { error, ip: request.ip });
      reply.status(401).send({
        error: 'Authentication Failed',
        message: error.message || 'Invalid credentials'
      });
    }
  });

  // Refresh token endpoint
  fastify.post('/refresh', {
    schema: {
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let refreshToken: string;
      
      // Try to get refresh token from body or cookie
      const body = request.body as RefreshTokenRequest;
      if (body.refreshToken) {
        refreshToken = body.refreshToken;
      } else if (request.cookies.refreshToken) {
        refreshToken = request.cookies.refreshToken;
      } else {
        throw new Error('Refresh token required');
      }

      const clientInfo = {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || 'unknown'
      };

      const result = await authService.refreshToken(refreshToken, clientInfo);

      // Update refresh token cookie
      const cookieOptions = jwtService.getSecureCookieOptions();
      reply.setCookie('refreshToken', result.refreshToken, cookieOptions);

      // Don't include refresh token in response body
      const { refreshToken: newRefreshToken, ...responseData } = result;
      
      reply.send(responseData);
    } catch (error: any) {
      logger.error('Token refresh failed', { error, ip: request.ip });
      reply.status(401).send({
        error: 'Token Refresh Failed',
        message: error.message || 'Invalid refresh token'
      });
    }
  });

  // Logout endpoint
  fastify.post('/logout', {
    preHandler: [securityMiddleware.createAuthenticationMiddleware({ required: true })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = (request as any).auth as AuthContext;
      const clientInfo = {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || 'unknown'
      };

      await authService.logout(auth.sessionId, clientInfo);

      // Clear refresh token cookie
      reply.clearCookie('refreshToken');

      reply.send({ message: 'Logged out successfully' });
    } catch (error: any) {
      logger.error('Logout failed', { error });
      reply.status(500).send({
        error: 'Logout Failed',
        message: 'Could not complete logout'
      });
    }
  });

  // Logout from all devices
  fastify.post('/logout-all', {
    preHandler: [securityMiddleware.createAuthenticationMiddleware({ required: true })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = (request as any).auth as AuthContext;
      const clientInfo = {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || 'unknown'
      };

      await authService.logoutAll(auth.user.id, clientInfo);

      // Clear refresh token cookie
      reply.clearCookie('refreshToken');

      reply.send({ message: 'Logged out from all devices successfully' });
    } catch (error: any) {
      logger.error('Logout all failed', { error });
      reply.status(500).send({
        error: 'Logout Failed',
        message: 'Could not complete logout from all devices'
      });
    }
  });

  // Get current user profile
  fastify.get('/me', {
    preHandler: [securityMiddleware.createAuthenticationMiddleware({ required: true })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = (request as any).auth as AuthContext;
      
      reply.send({
        user: {
          id: auth.user.id,
          email: auth.user.email,
          username: auth.user.username,
          isActive: auth.user.isActive,
          emailVerified: auth.user.emailVerified,
          mfaEnabled: auth.user.mfaEnabled,
          lastLoginAt: auth.user.lastLoginAt,
          createdAt: auth.user.createdAt,
          updatedAt: auth.user.updatedAt
        },
        sessionId: auth.sessionId
      });
    } catch (error: any) {
      logger.error('Get profile failed', { error });
      reply.status(500).send({
        error: 'Profile Retrieval Failed',
        message: 'Could not retrieve user profile'
      });
    }
  });

  // Validate token endpoint (for other services)
  fastify.post('/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = request.body as { token: string };
      const payload = await jwtService.verifyAccessToken(token);
      
      reply.send({
        valid: true,
        payload: {
          userId: payload.sub,
          email: payload.email,
          username: payload.username,
          roles: payload.roles,
          permissions: payload.permissions,
          sessionId: payload.sessionId,
          expiresAt: new Date(payload.exp * 1000)
        }
      });
    } catch (error: any) {
      reply.send({
        valid: false,
        error: error.message
      });
    }
  });

  // Generate CSRF token
  fastify.get('/csrf-token', {
    preHandler: [securityMiddleware.createAuthenticationMiddleware({ required: true })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = (request as any).auth as AuthContext;
      const token = securityMiddleware.generateCSRFToken(auth.sessionId);
      
      reply.send({ csrfToken: token });
    } catch (error: any) {
      logger.error('CSRF token generation failed', { error });
      reply.status(500).send({
        error: 'CSRF Token Generation Failed',
        message: 'Could not generate CSRF token'
      });
    }
  });
}