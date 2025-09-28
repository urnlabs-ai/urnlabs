import { FastifyRequest, FastifyReply } from 'fastify';
import { opaService, AuthorizationRequest, AuthorizationResponse } from '../opa';
import { auditLoggingService } from '../services/audit-logging';

export interface OPAAuthorizationConfig {
  enabled: boolean;
  skipRoutes?: string[];
  skipMethods?: string[];
  allowAnonymous?: boolean;
  defaultDenyMessage?: string;
  extractSubject?: (request: FastifyRequest) => Promise<AuthorizationRequest['subject']>;
  extractResource?: (request: FastifyRequest) => Promise<AuthorizationRequest['resource']>;
  extractAction?: (request: FastifyRequest) => Promise<AuthorizationRequest['action']>;
  extractContext?: (request: FastifyRequest) => Promise<Partial<AuthorizationRequest['context']>>;
  onAuthorizationSuccess?: (request: FastifyRequest, response: AuthorizationResponse) => Promise<void>;
  onAuthorizationFailure?: (request: FastifyRequest, response: AuthorizationResponse) => Promise<void>;
  onAuthorizationError?: (request: FastifyRequest, error: Error) => Promise<void>;
}

/**
 * OPA Authorization Middleware for Fastify
 */
export function createOPAAuthorizationMiddleware(config: OPAAuthorizationConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if OPA authorization is disabled
    if (!config.enabled) {
      return;
    }

    // Skip specific routes
    if (config.skipRoutes?.some(route => request.url.startsWith(route))) {
      return;
    }

    // Skip specific methods
    if (config.skipMethods?.includes(request.method)) {
      return;
    }

    // Skip health checks and static resources
    if (request.url.startsWith('/health') ||
        request.url.startsWith('/metrics') ||
        request.url.startsWith('/static') ||
        request.url.startsWith('/favicon')) {
      return;
    }

    try {
      // Extract authorization components
      const subject = await (config.extractSubject || extractDefaultSubject)(request);
      const resource = await (config.extractResource || extractDefaultResource)(request);
      const action = await (config.extractAction || extractDefaultAction)(request);
      const context = await (config.extractContext || extractDefaultContext)(request);

      // Skip if anonymous access is not allowed and no subject is identified
      if (!config.allowAnonymous && (!subject.id || subject.type === 'anonymous')) {
        await reply.code(401).send({
          error: 'Authentication required',
          message: 'Valid authentication credentials are required to access this resource'
        });
        return;
      }

      // Create authorization request
      const authRequest: AuthorizationRequest = {
        subject,
        resource,
        action,
        context: {
          requestId: request.id || generateRequestId(),
          timestamp: new Date(),
          environment: process.env.NODE_ENV || 'development',
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          ...context
        }
      };

      // Perform authorization
      const authResponse = await opaService.authorize(authRequest);

      // Handle authorization result
      if (authResponse.decision === 'allow') {
        // Authorization successful
        if (config.onAuthorizationSuccess) {
          await config.onAuthorizationSuccess(request, authResponse);
        }

        // Add authorization metadata to request
        (request as any).authorization = {
          decision: authResponse.decision,
          evaluationId: authResponse.metadata.evaluationId,
          policyId: authResponse.metadata.policyId,
          obligations: authResponse.obligations || []
        };

        // Process obligations
        await processObligations(request, reply, authResponse.obligations || []);

        return;

      } else {
        // Authorization denied
        if (config.onAuthorizationFailure) {
          await config.onAuthorizationFailure(request, authResponse);
        }

        await reply.code(403).send({
          error: 'Access denied',
          message: config.defaultDenyMessage || 'You do not have permission to access this resource',
          reasons: authResponse.reasons,
          evaluationId: authResponse.metadata.evaluationId
        });
        return;
      }

    } catch (error) {
      // Handle authorization error
      if (config.onAuthorizationError) {
        await config.onAuthorizationError(request, error);
      }

      // Log error
      await auditLoggingService.logEvent({
        eventType: 'AUTHORIZATION_MIDDLEWARE_ERROR',
        category: 'AUTHORIZATION',
        severity: 'HIGH',
        source: {
          service: 'opa-middleware',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'unknown',
          ip: request.ip
        },
        actor: {
          type: 'SYSTEM'
        },
        target: {
          resource: request.url,
          resourceType: 'HTTP_ENDPOINT'
        },
        action: request.method,
        outcome: 'FAILURE',
        details: {
          error: error.message,
          url: request.url,
          method: request.method,
          headers: request.headers
        },
        metadata: {
          requestId: request.id
        },
        compliance: {
          gdpr: true,
          sox: true,
          iso27001: true,
          pci: true
        }
      });

      // Return error response (default to deny for security)
      await reply.code(500).send({
        error: 'Authorization error',
        message: 'An error occurred while checking permissions',
        evaluationId: generateRequestId()
      });
      return;
    }
  };
}

/**
 * Default subject extractor
 */
async function extractDefaultSubject(request: FastifyRequest): Promise<AuthorizationRequest['subject']> {
  // Try to get user from JWT token or session
  const user = (request as any).user;

  if (user) {
    return {
      id: user.id || user.sub || user.userId,
      type: user.type || 'user',
      attributes: {
        email: user.email,
        roles: user.roles || [],
        permissions: user.permissions || [],
        groups: user.groups || [],
        ...user
      },
      roles: user.roles || [],
      permissions: user.permissions || []
    };
  }

  // Check for API key authentication
  const apiKey = request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');

  if (apiKey) {
    return {
      id: `api_key_${apiKey.substring(0, 8)}...`,
      type: 'service',
      attributes: {
        apiKey: apiKey.substring(0, 8) + '...',
        authenticated: true
      }
    };
  }

  // Default to anonymous user
  return {
    id: 'anonymous',
    type: 'anonymous',
    attributes: {
      authenticated: false
    }
  };
}

/**
 * Default resource extractor
 */
async function extractDefaultResource(request: FastifyRequest): Promise<AuthorizationRequest['resource']> {
  // Extract resource information from URL path
  const pathSegments = request.url.split('/').filter(segment => segment.length > 0);

  // Remove query parameters
  const cleanPath = pathSegments.join('/').split('?')[0];

  // Try to identify resource type and ID from common REST patterns
  let resourceType = 'endpoint';
  let resourceId: string | undefined;
  let resourcePath = cleanPath;

  if (pathSegments.length >= 1) {
    resourceType = pathSegments[0];
  }

  if (pathSegments.length >= 2 && !isNaN(Number(pathSegments[1]))) {
    // Numeric ID in second segment
    resourceId = pathSegments[1];
  } else if (pathSegments.length >= 2) {
    // Non-numeric identifier
    resourceId = pathSegments[1];
  }

  // Check for nested resources
  if (pathSegments.length >= 4) {
    resourceType = `${pathSegments[0]}.${pathSegments[2]}`;
    resourceId = pathSegments.length >= 4 ? pathSegments[3] : pathSegments[2];
  }

  return {
    type: resourceType,
    id: resourceId,
    path: resourcePath,
    attributes: {
      fullPath: request.url,
      pathSegments,
      query: request.query
    }
  };
}

/**
 * Default action extractor
 */
async function extractDefaultAction(request: FastifyRequest): Promise<AuthorizationRequest['action']> {
  // Map HTTP methods to CRUD actions
  const methodActionMap: Record<string, string> = {
    'GET': 'read',
    'POST': 'create',
    'PUT': 'update',
    'PATCH': 'update',
    'DELETE': 'delete',
    'HEAD': 'read',
    'OPTIONS': 'read'
  };

  const action = methodActionMap[request.method] || 'access';

  return {
    name: action,
    parameters: {
      method: request.method,
      url: request.url,
      body: request.body,
      query: request.query
    }
  };
}

/**
 * Default context extractor
 */
async function extractDefaultContext(request: FastifyRequest): Promise<Partial<AuthorizationRequest['context']>> {
  return {
    sessionId: extractSessionId(request),
    metadata: {
      contentType: request.headers['content-type'],
      acceptType: request.headers['accept'],
      referer: request.headers['referer'],
      origin: request.headers['origin'],
      contentLength: request.headers['content-length']
    }
  };
}

/**
 * Extract session ID from request
 */
function extractSessionId(request: FastifyRequest): string | undefined {
  // Try to get session ID from various sources
  const sessionHeader = request.headers['x-session-id'];
  if (sessionHeader && typeof sessionHeader === 'string') {
    return sessionHeader;
  }

  // Try to get from cookies
  const cookies = request.headers.cookie;
  if (cookies) {
    const sessionMatch = cookies.match(/sessionId=([^;]+)/);
    if (sessionMatch) {
      return sessionMatch[1];
    }
  }

  return undefined;
}

/**
 * Process policy obligations
 */
async function processObligations(
  request: FastifyRequest,
  reply: FastifyReply,
  obligations: AuthorizationResponse['obligations']
): Promise<void> {
  for (const obligation of obligations) {
    switch (obligation.type) {
      case 'log_access':
        // Log access for compliance
        await auditLoggingService.logEvent({
          eventType: 'RESOURCE_ACCESS_LOGGED',
          category: 'DATA_ACCESS',
          severity: 'LOW',
          source: {
            service: 'opa-middleware',
            version: '1.0.0',
            instance: process.env.HOSTNAME || 'unknown',
            ip: request.ip
          },
          actor: {
            userId: (request as any).user?.id,
            type: 'USER'
          },
          target: {
            resource: request.url,
            resourceType: 'HTTP_ENDPOINT'
          },
          action: 'ACCESS_LOGGED',
          outcome: 'SUCCESS',
          details: {
            obligation: obligation,
            method: request.method,
            url: request.url
          },
          metadata: {
            requestId: request.id
          },
          compliance: {
            gdpr: true,
            sox: true,
            iso27001: true,
            pci: true
          }
        });
        break;

      case 'rate_limit':
        // Apply rate limiting
        const limit = obligation.parameters?.limit || 100;
        const window = obligation.parameters?.window || 3600; // 1 hour

        // Add rate limit headers
        reply.header('X-RateLimit-Limit', limit.toString());
        reply.header('X-RateLimit-Window', window.toString());
        break;

      case 'audit_sensitive':
        // Flag for sensitive data auditing
        (request as any).auditSensitive = true;
        break;

      case 'require_mfa':
        // Check if MFA is required
        const user = (request as any).user;
        if (!user?.mfaVerified) {
          await reply.code(403).send({
            error: 'MFA required',
            message: 'Multi-factor authentication is required for this action',
            obligation: 'require_mfa'
          });
          return;
        }
        break;

      case 'mask_response':
        // Flag to mask sensitive data in response
        (request as any).maskResponse = obligation.parameters?.fields || [];
        break;

      default:
        // Log unknown obligation
        console.warn(`Unknown policy obligation: ${obligation.type}`);
    }
  }
}

/**
 * Generate request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Pre-configured middleware for common scenarios
 */
export const opaAuthorizationMiddleware = {
  /**
   * Standard OPA authorization with JWT authentication
   */
  standard: createOPAAuthorizationMiddleware({
    enabled: process.env.OPA_AUTHORIZATION_ENABLED !== 'false',
    allowAnonymous: false,
    skipRoutes: ['/health', '/metrics', '/docs'],
    skipMethods: ['OPTIONS'],
    defaultDenyMessage: 'Access denied by security policy'
  }),

  /**
   * Relaxed OPA authorization allowing anonymous access
   */
  relaxed: createOPAAuthorizationMiddleware({
    enabled: process.env.OPA_AUTHORIZATION_ENABLED !== 'false',
    allowAnonymous: true,
    skipRoutes: ['/health', '/metrics', '/docs', '/public'],
    skipMethods: ['OPTIONS', 'HEAD'],
    defaultDenyMessage: 'Access denied by security policy'
  }),

  /**
   * Strict OPA authorization with minimal exceptions
   */
  strict: createOPAAuthorizationMiddleware({
    enabled: true,
    allowAnonymous: false,
    skipRoutes: ['/health'],
    skipMethods: [],
    defaultDenyMessage: 'Access denied. Contact administrator if you believe this is an error.'
  }),

  /**
   * API-only OPA authorization for service-to-service communication
   */
  api: createOPAAuthorizationMiddleware({
    enabled: process.env.OPA_AUTHORIZATION_ENABLED !== 'false',
    allowAnonymous: false,
    skipRoutes: ['/health', '/metrics'],
    skipMethods: ['OPTIONS'],
    defaultDenyMessage: 'API access denied by security policy',
    extractSubject: async (request) => {
      // Custom subject extraction for API keys
      const apiKey = request.headers['x-api-key'];
      if (apiKey && typeof apiKey === 'string') {
        return {
          id: `api_${apiKey.substring(0, 8)}`,
          type: 'service',
          attributes: {
            apiKey: apiKey.substring(0, 8) + '...',
            service: request.headers['x-service-name'] || 'unknown'
          }
        };
      }
      throw new Error('API key required');
    }
  })
};

export default opaAuthorizationMiddleware;