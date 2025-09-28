import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin/plugin.js';
import { logger } from '@/lib/logger.js';
import { getSessionService } from '@/services/session-service.js';
import crypto from 'crypto';

// ============================================================================
// COMPREHENSIVE SECURITY MIDDLEWARE
// ============================================================================

interface SecurityMiddlewareOptions {
  enableCSRF?: boolean;
  enableSecurityHeaders?: boolean;
  enableContentTypeValidation?: boolean;
  enableRateLimitBypass?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    csrfToken?: () => string;
    validateCSRF?: () => boolean;
  }
}

async function securityMiddleware(
  fastify: FastifyInstance,
  options: SecurityMiddlewareOptions = {}
) {
  const {
    enableCSRF = true,
    enableSecurityHeaders = true,
    enableContentTypeValidation = true,
    enableRateLimitBypass = false,
  } = options;

  // ============================================================================
  // CUSTOM CSRF PROTECTION (Session-based)
  // ============================================================================

  if (enableCSRF) {
    // Add CSRF token generation endpoint
    fastify.get('/csrf-token', async (request, reply) => {
      const sessionId = getSessionService().getSessionIdFromRequest(request);
      if (sessionId) {
        const session = await getSessionService().getSession(sessionId);
        if (session) {
          return { csrfToken: session.csrfToken };
        }
      }

      // Generate temporary CSRF token for non-authenticated requests
      const tempToken = crypto.randomBytes(32).toString('hex');
      reply.setCookie('csrf_temp', tempToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      return { csrfToken: tempToken };
    });

    // CSRF validation hook
    fastify.addHook('preHandler', async (request, reply) => {
      // Skip CSRF for safe HTTP methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return;
      }

      // Skip CSRF for specific routes
      const skipPaths = [
        '/health',
        '/docs',
        '/auth/login',
        '/auth/register',
        '/sso/auth',
        '/sso/callback',
        '/csrf-token',
      ];

      const shouldSkip = skipPaths.some(path => request.url.startsWith(path));
      if (shouldSkip) {
        return;
      }

      const sessionService = getSessionService();
      const sessionId = sessionService.getSessionIdFromRequest(request);

      // Get CSRF token from header or body
      const csrfToken = request.headers['x-csrf-token'] ||
                       request.headers['csrf-token'] ||
                       (request.body as any)?.csrfToken;

      if (!csrfToken) {
        logger.warn('CSRF token missing', {
          url: request.url,
          method: request.method,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.code(403).send({
          error: 'CSRF_TOKEN_MISSING',
          message: 'CSRF token is required',
        });
      }

      let isValid = false;

      if (sessionId) {
        // Validate against session CSRF token
        const session = await sessionService.getSession(sessionId);
        if (session) {
          isValid = sessionService.validateCSRFToken(session.csrfToken, csrfToken);
        }
      } else {
        // Validate against temporary CSRF token
        const tempToken = request.cookies?.csrf_temp;
        if (tempToken) {
          isValid = sessionService.validateCSRFToken(tempToken, csrfToken);
        }
      }

      if (!isValid) {
        logger.warn('CSRF validation failed', {
          url: request.url,
          method: request.method,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          hasSession: !!sessionId,
        });

        return reply.code(403).send({
          error: 'CSRF_TOKEN_INVALID',
          message: 'Invalid CSRF token',
        });
      }
    });
  }

  // ============================================================================
  // SECURITY HEADERS MIDDLEWARE
  // ============================================================================

  if (enableSecurityHeaders) {
    fastify.addHook('onSend', async (request, reply) => {
      // Content Security Policy
      reply.header('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for development
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' wss: ws:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '));

      // Security headers
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Permissions-Policy', [
        'geolocation=()',
        'microphone=()',
        'camera=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()',
      ].join(', '));

      // HSTS (HTTP Strict Transport Security) for production
      if (process.env.NODE_ENV === 'production') {
        reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }

      // Prevent caching of sensitive endpoints
      const sensitiveEndpoints = ['/auth', '/mfa', '/sso', '/users'];
      const isSensitive = sensitiveEndpoints.some(endpoint =>
        request.url.startsWith(endpoint)
      );

      if (isSensitive) {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
      }
    });
  }

  // ============================================================================
  // CONTENT TYPE VALIDATION MIDDLEWARE
  // ============================================================================

  if (enableContentTypeValidation) {
    fastify.addHook('preHandler', async (request, reply) => {
      // Skip validation for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return;
      }

      const contentType = request.headers['content-type'];

      // Require Content-Type for POST/PUT/PATCH requests
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        if (!contentType) {
          return reply.code(400).send({
            error: 'CONTENT_TYPE_REQUIRED',
            message: 'Content-Type header is required',
          });
        }

        // Validate allowed content types
        const allowedTypes = [
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data',
          'text/plain',
        ];

        const isValidType = allowedTypes.some(type =>
          contentType.toLowerCase().startsWith(type)
        );

        if (!isValidType) {
          logger.warn('Invalid content type attempted', {
            contentType,
            url: request.url,
            method: request.method,
            ip: request.ip,
          });

          return reply.code(415).send({
            error: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Unsupported Content-Type',
            allowedTypes,
          });
        }
      }
    });
  }

  // ============================================================================
  // REQUEST SIZE VALIDATION
  // ============================================================================

  fastify.addHook('preHandler', async (request, reply) => {
    const contentLength = request.headers['content-length'];

    if (contentLength) {
      const length = parseInt(contentLength, 10);
      const maxSize = 50 * 1024 * 1024; // 50MB default

      // Special limits for different endpoints
      const limits: Record<string, number> = {
        '/auth': 1024, // 1KB for auth requests
        '/mfa': 1024,  // 1KB for MFA requests
        '/users': 10 * 1024, // 10KB for user updates
        '/agents': 1024 * 1024, // 1MB for agent configs
        '/workflows': 5 * 1024 * 1024, // 5MB for workflow definitions
      };

      let limit = maxSize;
      for (const [path, pathLimit] of Object.entries(limits)) {
        if (request.url.startsWith(path)) {
          limit = pathLimit;
          break;
        }
      }

      if (length > limit) {
        logger.warn('Request size limit exceeded', {
          contentLength: length,
          limit,
          url: request.url,
          ip: request.ip,
        });

        return reply.code(413).send({
          error: 'PAYLOAD_TOO_LARGE',
          message: `Request size ${length} exceeds limit ${limit}`,
          maxSize: limit,
        });
      }
    }
  });

  // ============================================================================
  // SUSPICIOUS ACTIVITY DETECTION
  // ============================================================================

  const suspiciousPatterns = [
    // SQL injection patterns
    /(\b(union|select|insert|update|delete|drop|exec|script)\b)/i,
    // XSS patterns
    /(<script|javascript:|onload=|onerror=)/i,
    // Path traversal
    /(\.\.\/|\.\.\\)/,
    // Command injection
    /(\b(cat|ls|ps|netstat|ifconfig|whoami|id)\b)/i,
  ];

  fastify.addHook('preHandler', async (request, reply) => {
    const suspicious = [
      request.url,
      JSON.stringify(request.query),
      JSON.stringify(request.headers),
      request.body ? JSON.stringify(request.body) : '',
    ].join(' ');

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(suspicious)) {
        logger.error('Suspicious activity detected', {
          pattern: pattern.source,
          url: request.url,
          method: request.method,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          headers: request.headers,
          query: request.query,
        });

        // Rate limit suspicious IPs more aggressively
        reply.header('X-Rate-Limit-Suspicious', 'true');

        return reply.code(400).send({
          error: 'SUSPICIOUS_REQUEST',
          message: 'Request contains suspicious patterns',
        });
      }
    }
  });

  // ============================================================================
  // RATE LIMITING BYPASS FOR AUTHENTICATED USERS (OPTIONAL)
  // ============================================================================

  if (enableRateLimitBypass) {
    fastify.addHook('preHandler', async (request) => {
      const sessionId = getSessionService().getSessionIdFromRequest(request);
      if (sessionId) {
        const validation = await getSessionService().validateSession(request, sessionId);
        if (validation.valid && validation.session) {
          // Add user info for rate limiting decisions
          (request as any).user = {
            id: validation.session.userId,
            role: validation.session.role,
            permissions: validation.session.permissions,
          };
        }
      }
    });
  }

  // ============================================================================
  // SECURITY METRICS AND MONITORING
  // ============================================================================

  let securityMetrics = {
    csrfViolations: 0,
    suspiciousRequests: 0,
    contentTypeViolations: 0,
    oversizedRequests: 0,
  };

  // Log security metrics periodically
  setInterval(() => {
    if (Object.values(securityMetrics).some(v => v > 0)) {
      logger.info('Security middleware metrics', securityMetrics);
      securityMetrics = {
        csrfViolations: 0,
        suspiciousRequests: 0,
        contentTypeViolations: 0,
        oversizedRequests: 0,
      };
    }
  }, 60000); // Every minute

  logger.info('Security middleware registered', {
    csrf: enableCSRF,
    headers: enableSecurityHeaders,
    contentValidation: enableContentTypeValidation,
    rateLimitBypass: enableRateLimitBypass,
  });
}

export default fp(securityMiddleware, {
  name: 'security-middleware',
  dependencies: ['@fastify/helmet'], // Ensure helmet is loaded first
});

export { SecurityMiddlewareOptions };