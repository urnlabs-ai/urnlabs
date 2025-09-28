import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { config } from '@/lib/config.js';
import { logSecurityEvent, logBusinessMetric } from '@/lib/logger.js';
import { authMiddleware } from '@/middleware/auth.js';
import { createJWTService } from '@/services/jwt-service.js';
import { validatePasswordStrength, isPasswordBreached } from '@/utils/password-validation.js';

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

const passwordValidationSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  email: z.string().email('Invalid email format').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function authRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Initialize JWT service
  const jwtService = createJWTService(fastify);
  await jwtService.initialize();

  // Password strength validation endpoint
  fastify.post('/validate-password', {
    schema: {
      tags: ['Authentication'],
      summary: 'Validate password strength',
      description: 'Check password strength and security requirements',
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            isValid: { type: 'boolean' },
            score: { type: 'number' },
            strength: { type: 'string' },
            errors: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
            timeToCrackEstimate: { type: 'string' },
            isBreached: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { password, email, firstName, lastName } = passwordValidationSchema.parse(request.body);

    const userInfo = {
      email: email?.toLowerCase(),
      firstName,
      lastName,
    };

    // Validate password strength
    const validation = validatePasswordStrength(password, {}, userInfo);

    // Check if password has been breached (non-blocking)
    let isBreached = false;
    try {
      isBreached = await isPasswordBreached(password);
    } catch (error) {
      request.log.warn(error, 'Password breach check failed during validation');
    }

    return reply.send({
      isValid: validation.isValid && !isBreached,
      score: validation.score,
      strength: validation.strength,
      errors: validation.errors,
      suggestions: validation.suggestions,
      timeToCrackEstimate: validation.timeToCrackEstimate,
      isBreached,
    });
  });

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
            message: { type: 'string' },
            validation: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                strength: { type: 'string' },
                errors: { type: 'array', items: { type: 'string' } },
                suggestions: { type: 'array', items: { type: 'string' } },
                timeToCrackEstimate: { type: 'string' }
              }
            },
            suggestion: { type: 'string' }
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

    // Validate password strength
    const userInfo = {
      email: email.toLowerCase(),
      firstName,
      lastName,
    };

    const passwordValidation = validatePasswordStrength(password, {}, userInfo);

    if (!passwordValidation.isValid) {
      logSecurityEvent('registration_weak_password', 'medium', {
        email: email.toLowerCase(),
        passwordScore: passwordValidation.score,
        passwordStrength: passwordValidation.strength,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(400).send({
        error: 'WEAK_PASSWORD',
        message: 'Password does not meet security requirements',
        validation: {
          score: passwordValidation.score,
          strength: passwordValidation.strength,
          errors: passwordValidation.errors,
          suggestions: passwordValidation.suggestions,
          timeToCrackEstimate: passwordValidation.timeToCrackEstimate,
        },
      });
    }

    // Check if password has been breached
    try {
      const isBreached = await isPasswordBreached(password);
      if (isBreached) {
        logSecurityEvent('registration_breached_password', 'high', {
          email: email.toLowerCase(),
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.status(400).send({
          error: 'BREACHED_PASSWORD',
          message: 'This password has been found in data breaches and cannot be used',
          suggestion: 'Please choose a different password that has not been compromised',
        });
      }
    } catch (error) {
      // If breach check fails, log but don't block registration
      request.log.warn(error, 'Password breach check failed, continuing with registration');
    }

    // Hash password with bcrypt
    const hashedPassword = await jwtService.hashPassword(password);

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

      // Generate JWT tokens using new JWT service
      const tokenPayload = {
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        organizationId: result.user.organizationId,
        permissions: result.permissions,
      };

      const tokens = await jwtService.generateTokenPair(tokenPayload);

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
        hasOrganization: Boolean(organizationName).toString(),
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
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
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

    // Verify password with bcrypt
    const isPasswordValid = await jwtService.verifyPassword(password, user.passwordHash);
    
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

    // Generate JWT tokens using new JWT service
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      permissions: user.permissions.map(p => p.permission),
    };

    const tokens = await jwtService.generateTokenPair(tokenPayload);

    // Clean up old PostgreSQL refresh tokens (we now use Redis)
    await request.server.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

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
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
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
      // Use new JWT service to verify and rotate refresh token
      const verification = await jwtService.verifyRefreshToken(refreshToken, true);

      if (!verification.valid) {
        logSecurityEvent('refresh_token_invalid', 'medium', {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired refresh token',
        });
      }

      if (verification.newTokenPair) {
        // Token was rotated, return new token pair
        logSecurityEvent('refresh_token_rotated', 'low', {
          userId: verification.payload!.userId,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.send({
          accessToken: verification.newTokenPair.accessToken,
          refreshToken: verification.newTokenPair.refreshToken,
          expiresIn: verification.newTokenPair.expiresIn,
          rotated: true,
        });
      } else {
        // Just generate new access token
        const user = await request.server.prisma.user.findUnique({
          where: { id: verification.payload!.userId },
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

        const tokenPayload = {
          userId: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          permissions: user.permissions.map(p => p.permission),
        };

        const newAccessToken = await jwtService.generateAccessToken(tokenPayload);

        return reply.send({
          accessToken: newAccessToken,
          expiresIn: 15 * 60, // 15 minutes in seconds
          rotated: false,
        });
      }

    } catch (error) {
      request.log.error(error, 'Refresh token verification failed');

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
    const userId = (request as any).user!.userId;

    try {
      // Revoke all user tokens using JWT service (Redis)
      await jwtService.revokeAllUserTokens(userId);

      // Also clean up any remaining PostgreSQL refresh tokens
      await request.server.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      logSecurityEvent('user_logout', 'low', {
        userId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        message: 'Logged out successfully',
      });

    } catch (error) {
      request.log.error(error, 'Logout failed');

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Logout failed',
      });
    }
  });
}