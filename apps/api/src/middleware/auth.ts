import { FastifyRequest, FastifyReply } from 'fastify';
import { logSecurityEvent } from '@/lib/logger.js';

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
    user?: JWTPayload;
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

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    try {
      const decoded = await request.jwtVerify<JWTPayload>();
      request.user = decoded;

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
      where: { id: request.user.userId },
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
        userId: request.user.userId,
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
    request.user = {
      ...request.user,
      role: user.role,
      organizationId: user.organizationId,
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

// Permission checking helper
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!request.user.permissions.includes(permission)) {
      logSecurityEvent('auth_insufficient_permissions', 'medium', {
        userId: request.user.userId,
        requiredPermission: permission,
        userPermissions: request.user.permissions,
        ip: request.ip,
        url: request.url,
        method: request.method,
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: `Permission required: ${permission}`,
      });
    }
  };
}

// Role checking helper
export function requireRole(role: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (request.user.role !== role) {
      logSecurityEvent('auth_insufficient_role', 'medium', {
        userId: request.user.userId,
        requiredRole: role,
        userRole: request.user.role,
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
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const organizationId = request.params?.organizationId || request.body?.organizationId;
    
    if (organizationId && request.user.organizationId !== organizationId) {
      logSecurityEvent('auth_organization_access_denied', 'high', {
        userId: request.user.userId,
        userOrganizationId: request.user.organizationId,
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