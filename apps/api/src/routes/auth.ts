import { FastifyInstance, FastifyPluginOptions } from 'fastify';
// import bcrypt from 'bcrypt';
import { z } from 'zod';
import { config } from '@/lib/config.js';
import { logSecurityEvent, logBusinessMetric } from '@/lib/logger.js';
import { authMiddleware } from '@/middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  organizationName: z.string().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // User registration
  fastify.post('/register', {
    schema: {
      tags: ['Authentication'],
      summary: 'User registration',
      description: 'Register a new user account',
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          organizationName: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                organizationId: { type: 'string', nullable: true }
              }
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'number' }
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
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, firstName, lastName, organizationName } = registerSchema.parse(request.body);

    // Check if user already exists
    const existingUser = await request.server.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      logSecurityEvent('registration_duplicate_email', 'medium', {
        email: email.toLowerCase(),
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(409).send({
        error: 'Conflict',
        message: 'User with this email already exists',
      });
    }

    // Hash password (temporary - replace with bcrypt in production)
    const hashedPassword = '$2b$12$placeholder.hash.for.development.only';

    try {
      // Create user (with organization if provided)
      const result = await request.server.prisma.$transaction(async (tx) => {
        let organizationId: string | null = null;

        // Create organization if provided
        if (organizationName) {
          const organization = await tx.organization.create({
            data: {
              name: organizationName,
              slug: organizationName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            },
          });
          organizationId = organization.id;
        }

        // Create user
        const user = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash: hashedPassword,
            firstName,
            lastName,
            role: 'USER',
            organizationId,
            isActive: true,
            emailVerified: false, // Implement email verification
          },
        });

        // Get user permissions
        const permissions = await tx.userPermission.findMany({
          where: { userId: user.id },
          select: { permission: true },
        });

        return {
          user,
          permissions: permissions.map(p => p.permission),
        };
      });

      // Generate JWT tokens
      const tokenPayload = {
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        organizationId: result.user.organizationId,
        permissions: result.permissions,
      };

      const accessToken = fastify.jwt.sign(tokenPayload, {
        expiresIn: config.JWT_EXPIRES_IN,
      });

      const refreshToken = fastify.jwt.sign(
        { userId: result.user.id, type: 'refresh' },
        { expiresIn: '30d' }
      );

      // Store refresh token
      await request.server.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: result.user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // Update last login
      await request.server.prisma.user.update({
        where: { id: result.user.id },
        data: { lastLoginAt: new Date() },
      });

      // Log successful registration
      logSecurityEvent('user_registered', 'low', {
        userId: result.user.id,
        email: result.user.email,
        organizationId: result.user.organizationId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      logBusinessMetric('user_registration', 1, 'count', {
        hasOrganization: Boolean(organizationName),
      });

      return reply.status(201).send({
        message: 'User registered successfully',
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
          organizationId: result.user.organizationId,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
        },
      });

    } catch (error) {
      request.log.error(error, 'User registration failed');
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Registration failed',
      });
    }
  });

  // User login
  fastify.post('/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'User login',
      description: 'Authenticate user and return JWT tokens',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                organizationId: { type: 'string', nullable: true }
              }
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'number' }
              }
            }
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
  }, async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    // Find user with permissions
    const user = await request.server.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        permissions: {
          select: { permission: true },
        },
      },
    });

    if (!user) {
      logSecurityEvent('login_user_not_found', 'medium', {
        email: email.toLowerCase(),
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      logSecurityEvent('login_user_inactive', 'medium', {
        userId: user.id,
        email: user.email,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Account is deactivated',
      });
    }

    // Verify password (temporary - replace with bcrypt in production)
    const isPasswordValid = password === 'password123';
    
    if (!isPasswordValid) {
      logSecurityEvent('login_invalid_password', 'high', {
        userId: user.id,
        email: user.email,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Generate JWT tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      permissions: user.permissions.map(p => p.permission),
    };

    const accessToken = fastify.jwt.sign(tokenPayload, {
      expiresIn: config.JWT_EXPIRES_IN,
    });

    const refreshToken = fastify.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '30d' }
    );

    // Store refresh token (cleanup old ones)
    await request.server.prisma.$transaction([
      request.server.prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
      request.server.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    // Update last login
    await request.server.prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    // Log successful login
    logSecurityEvent('user_login', 'low', {
      userId: user.id,
      email: user.email,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    logBusinessMetric('user_login', 1, 'count');

    return reply.send({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 7 * 24 * 60 * 60,
      },
    });
  });

  // Token refresh
  fastify.post('/refresh', {
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      description: 'Generate new access token using refresh token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body);

    try {
      const decoded = fastify.jwt.verify(refreshToken) as { userId: string; type: string };
      
      if (decoded.type !== 'refresh') {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid refresh token',
        });
      }

      // Verify refresh token exists and is not expired
      const storedToken = await request.server.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: decoded.userId,
          expiresAt: { gt: new Date() },
        },
      });

      if (!storedToken) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token expired or invalid',
        });
      }

      // Get user with permissions
      const user = await request.server.prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          permissions: {
            select: { permission: true },
          },
        },
      });

      if (!user || !user.isActive) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'User account not found or inactive',
        });
      }

      // Generate new access token
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        permissions: user.permissions.map(p => p.permission),
      };

      const newAccessToken = fastify.jwt.sign(tokenPayload, {
        expiresIn: config.JWT_EXPIRES_IN,
      });

      return reply.send({
        accessToken: newAccessToken,
        expiresIn: 7 * 24 * 60 * 60,
      });

    } catch (error) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid refresh token',
      });
    }
  });

  // Logout
  fastify.post('/logout', {
    schema: {
      tags: ['Authentication'],
      summary: 'User logout',
      description: 'Invalidate user session and refresh tokens',
    },
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    // Delete all refresh tokens for the user
    await request.server.prisma.refreshToken.deleteMany({
      where: { userId: request.user!.userId },
    });

    logSecurityEvent('user_logout', 'low', {
      userId: request.user!.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      message: 'Logged out successfully',
    });
  });
}