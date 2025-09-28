import { logSecurityEvent } from '@/lib/logger.js';
export async function authMiddleware(request, reply) {
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
        authHeader.substring(7);
        // Verify JWT token
        try {
            const decoded = await request.jwtVerify();
            request.jwtUser = decoded;
            // Check if token is about to expire (less than 1 hour remaining)
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = decoded.exp - now;
            if (timeUntilExpiry < 3600) { // 1 hour in seconds
                reply.header('X-Token-Expires-Soon', 'true');
                reply.header('X-Token-Expires-In', timeUntilExpiry.toString());
            }
        }
        catch (jwtError) {
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
            where: { id: request.jwtUser.userId },
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
                userId: request.jwtUser.userId,
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
        const updatedUser = {
            ...request.jwtUser,
            role: user.role,
        };
        // Only include organizationId if it exists
        if (user.organizationId) {
            updatedUser.organizationId = user.organizationId;
        }
        request.jwtUser = updatedUser;
        // Update last activity
        await request.server.prisma.user.update({
            where: { id: user.id },
            data: { lastActivityAt: new Date() },
        });
    }
    catch (error) {
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
export function requirePermission(permission) {
    return async (request, reply) => {
        if (!request.jwtUser) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
        }
        if (!request.jwtUser.permissions.includes(permission)) {
            logSecurityEvent('auth_insufficient_permissions', 'medium', {
                userId: request.jwtUser.userId,
                requiredPermission: permission,
                userPermissions: request.jwtUser.permissions,
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
export function requireRole(role) {
    return async (request, reply) => {
        if (!request.jwtUser) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
        }
        if (request.jwtUser.role !== role) {
            logSecurityEvent('auth_insufficient_role', 'medium', {
                userId: request.jwtUser.userId,
                requiredRole: role,
                userRole: request.jwtUser.role,
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
    return async (request, reply) => {
        if (!request.jwtUser) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
        }
        const organizationId = request.params?.organizationId || request.body?.organizationId;
        if (organizationId && request.jwtUser.organizationId !== organizationId) {
            logSecurityEvent('auth_organization_access_denied', 'high', {
                userId: request.jwtUser.userId,
                userOrganizationId: request.jwtUser.organizationId,
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
//# sourceMappingURL=auth.js.map