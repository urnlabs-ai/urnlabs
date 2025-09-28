import { FastifyRequest, FastifyReply } from 'fastify';
import { logSecurityEvent } from '@/lib/logger.js';
import { createJWTService } from '@/services/jwt-service.js';
import { AuthorizationService } from '@/services/authorization-service.js';
import type { PermissionCheckRequest, AuthorizationContext } from '@/services/authorization-service.js';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
  permissions: string[];
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    jwtUser?: JWTPayload;
    authContext?: AuthorizationContext;
    checkPermission?: (permission: string, resourceType?: string, resourceId?: string) => Promise<boolean>;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurityEvent('auth_missing_token', 'medium', {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        url: request.url,
        method: request.method,
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authorization token required',
      });
    }

    // Remove 'Bearer ' prefix
    const token = authHeader.substring(7);

    // Initialize JWT service and verify token
    const jwtService = createJWTService(request.server);
    let decoded: JWTPayload | null;

    try {
      // Use our new JWT service for RS256 verification
      const jwtPayload = await jwtService.verifyAccessToken(token);

      if (!jwtPayload) {
        throw new Error('Token verification failed');
      }

      decoded = jwtPayload as JWTPayload;
      request.jwtUser = decoded;

      // Check if token is about to expire (less than 1 hour remaining)
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - now;
      
      if (timeUntilExpiry < 3600) { // 1 hour in seconds
        reply.header('X-Token-Expires-Soon', 'true');
        reply.header('X-Token-Expires-In', timeUntilExpiry.toString());
      }

    } catch (jwtError) {
      logSecurityEvent('auth_invalid_token', 'high', {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        url: request.url,
        method: request.method,
        error: jwtError instanceof Error ? jwtError.message : 'Unknown JWT error',
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Additional user validation (check if user still exists and is active)
    const user = await request.server.prisma.user.findUnique({
      where: { id: (request.jwtUser as JWTPayload).userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        organizationId: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      logSecurityEvent('auth_user_not_found', 'high', {
        userId: (request.jwtUser as JWTPayload).userId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User account not found',
      });
    }

    if (!user.isActive) {
      logSecurityEvent('auth_user_inactive', 'medium', {
        userId: user.id,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: 'User account is deactivated',
      });
    }

    // Update user information in token payload
    const updatedUser: JWTPayload = {
      ...(request.jwtUser as JWTPayload),
      role: user.role,
    };
    
    // Only include organizationId if it exists
    if (user.organizationId) {
      updatedUser.organizationId = user.organizationId;
    }
    
    request.jwtUser = updatedUser;

    // Create authorization context
    const authContext: AuthorizationContext = {
      userId: user.id,
      organizationId: user.organizationId || undefined,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: (request as any).id,
      timestamp: new Date(),
    };

    request.authContext = authContext;

    // Create authorization service instance
    const authorizationService = new AuthorizationService(request.server.prisma);

    // Add permission checking helper to request
    request.checkPermission = async (
      permission: string,
      resourceType?: string,
      resourceId?: string
    ): Promise<boolean> => {
      const permissionRequest: PermissionCheckRequest = {
        userId: user.id,
        permission,
        resourceType,
        resourceId,
        context: authContext,
      };

      const result = await authorizationService.checkPermission(permissionRequest);
      return result.allowed;
    };

    // Update last activity
    await request.server.prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() },
    });

  } catch (error) {
    logSecurityEvent('auth_middleware_error', 'critical', {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      url: request.url,
      method: request.method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication service unavailable',
    });
  }
}

// Permission checking helper - enhanced with RBAC
export function requirePermission(
  permission: string,
  resourceType?: string,
  resourceId?: string
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!request.checkPermission) {
      logSecurityEvent('auth_permission_checker_missing', 'critical', {
        userId: (request.jwtUser as JWTPayload).userId,
        permission,
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Permission checking service unavailable',
      });
    }

    try {
      const hasPermission = await request.checkPermission(permission, resourceType, resourceId);

      if (!hasPermission) {
        logSecurityEvent('auth_insufficient_permissions', 'medium', {
          userId: (request.jwtUser as JWTPayload).userId,
          requiredPermission: permission,
          resourceType,
          resourceId,
          ip: request.ip,
          url: request.url,
          method: request.method,
        });

        return reply.status(403).send({
          error: 'Forbidden',
          message: `Permission required: ${permission}`,
        });
      }
    } catch (error) {
      logSecurityEvent('auth_permission_check_error', 'high', {
        userId: (request.jwtUser as JWTPayload).userId,
        permission,
        resourceType,
        resourceId,
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.ip,
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Permission validation failed',
      });
    }
  };
}

// Role checking helper
export function requireRole(role: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if ((request.jwtUser as JWTPayload).role !== role) {
      logSecurityEvent('auth_insufficient_role', 'medium', {
        userId: (request.jwtUser as JWTPayload).userId,
        requiredRole: role,
        userRole: (request.jwtUser as JWTPayload).role,
        ip: request.ip,
        url: request.url,
        method: request.method,
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: `Role required: ${role}`,
      });
    }
  };
}

// Organization access checking helper
export function requireOrganizationAccess() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const organizationId = (request.params as any)?.organizationId || (request.body as any)?.organizationId;
    
    if (organizationId && (request.jwtUser as JWTPayload).organizationId !== organizationId) {
      logSecurityEvent('auth_organization_access_denied', 'high', {
        userId: (request.jwtUser as JWTPayload).userId,
        userOrganizationId: (request.jwtUser as JWTPayload).organizationId,
        requestedOrganizationId: organizationId,
        ip: request.ip,
        url: request.url,
        method: request.method,
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access denied to this organization',
      });
    }
  };
}