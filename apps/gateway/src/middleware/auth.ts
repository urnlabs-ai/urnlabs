import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../lib/config.js';
import logger from '../lib/logger.js';
import redisManager from '../lib/redis.js';
import { AuthenticatedRequest } from '../types/index.js';

interface JwtPayload {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export async function authenticate(
  request: FastifyRequest & { user?: AuthenticatedRequest },
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.substring(7);
    
    // Check if token is blacklisted
    const isBlacklisted = await redisManager.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Token has been revoked' 
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    
    // Check if user session exists in Redis
    const sessionKey = `session:${decoded.userId}`;
    const sessionData = await redisManager.get(sessionKey);
    
    if (!sessionData) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Session expired or invalid' 
      });
    }

    // Attach user information to request
    request.user = {
      userId: decoded.userId,
      organizationId: decoded.organizationId,
      role: decoded.role,
      permissions: decoded.permissions
    };

    // Update session activity
    await redisManager.set(sessionKey, sessionData, 24 * 60 * 60); // 24 hours
    
  } catch (error) {
    logger.error({ error }, 'Authentication failed');
    
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Invalid token' 
      });
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Token expired' 
      });
    }

    return reply.status(500).send({ 
      error: 'Internal Server Error', 
      message: 'Authentication service unavailable' 
    });
  }
}

export function authorize(permissions: string[] = []) {
  return async function(
    request: FastifyRequest & { user?: AuthenticatedRequest },
    reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    if (permissions.length === 0) {
      return; // No specific permissions required
    }

    const hasPermission = permissions.every(permission => 
      request.user!.permissions.includes(permission) ||
      request.user!.permissions.includes('admin:*') ||
      request.user!.role === 'SUPER_ADMIN'
    );

    if (!hasPermission) {
      return reply.status(403).send({ 
        error: 'Forbidden', 
        message: 'Insufficient permissions' 
      });
    }
  };
}

export async function optionalAuth(
  request: FastifyRequest & { user?: AuthenticatedRequest },
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return; // No auth provided, continue without user
  }

  try {
    await authenticate(request, reply);
  } catch (error) {
    // Ignore auth errors for optional auth
    logger.debug({ error }, 'Optional authentication failed');
  }
}

export async function generateToken(user: {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
}): Promise<string> {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    userId: user.userId,
    organizationId: user.organizationId,
    role: user.role,
    permissions: user.permissions
  };

  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'urnlabs-gateway',
    audience: 'urnlabs-platform'
  });

  // Store session in Redis
  const sessionKey = `session:${user.userId}`;
  const sessionData = JSON.stringify({
    ...user,
    loginTime: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  });
  
  await redisManager.set(sessionKey, sessionData, 24 * 60 * 60); // 24 hours

  return token;
}

export async function revokeToken(token: string): Promise<void> {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
    
    if (expiresIn > 0) {
      await redisManager.set(`blacklist:${token}`, 'revoked', expiresIn);
    }

    // Remove session
    await redisManager.del(`session:${decoded.userId}`);
    
  } catch (error) {
    logger.error({ error }, 'Failed to revoke token');
    throw error;
  }
}