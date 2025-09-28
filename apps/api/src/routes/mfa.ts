import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MfaService } from '@/services/mfa-service.js';
import { authMiddleware, requirePermission } from '@/middleware/auth.js';
import { z } from 'zod';

// Request schemas
const setupMfaSchema = z.object({
  serviceName: z.string().optional().default('Urnlabs AI')
});

const verifyMfaSchema = z.object({
  token: z.string().min(6).max(8)
});

const disableMfaSchema = z.object({
  token: z.string().min(6).max(8)
});

const generateBackupCodesSchema = z.object({
  token: z.string().min(6).max(8)
});

const verifySmsSchema = z.object({
  code: z.string().length(6)
});

// Type definitions
interface AuthenticatedRequest extends FastifyRequest {
  jwtUser: {
    userId: string;
    email: string;
    role: string;
  };
}

export async function mfaRoutes(fastify: FastifyInstance) {
  // Add auth middleware to all MFA routes
  fastify.addHook('preHandler', authMiddleware);

  /**
   * Setup TOTP MFA
   * POST /mfa/setup
   */
  fastify.post('/setup', {
    schema: {
      description: 'Setup TOTP MFA for authenticated user',
      tags: ['MFA'],
      body: {
        type: 'object',
        properties: {
          serviceName: { type: 'string' }
        },
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            secret: { type: 'string' },
            qrCode: { type: 'string' },
            backupCodes: {
              type: 'array',
              items: { type: 'string' }
            },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { serviceName } = setupMfaSchema.parse(request.body);
      const mfaService = new MfaService(fastify.prisma);

      const result = await mfaService.setupTotp(request.jwtUser.userId, serviceName);

      return reply.status(200).send({
        ...result,
        message: 'MFA setup initiated. Please verify with your authenticator app to enable.'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'MFA setup failed';
      return reply.status(400).send({
        error: 'MFA Setup Failed',
        message
      });
    }
  });

  /**
   * Enable MFA after setup
   * POST /mfa/enable
   */
  fastify.post('/enable', {
    schema: {
      description: 'Enable MFA after setup verification',
      tags: ['MFA'],
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 6, maxLength: 8 }
        },
        required: ['token'],
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { token } = verifyMfaSchema.parse(request.body);
      const mfaService = new MfaService(fastify.prisma);

      await mfaService.enableMfa(request.jwtUser.userId, token);

      return reply.status(200).send({
        message: 'MFA has been successfully enabled for your account'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'MFA enable failed';
      return reply.status(400).send({
        error: 'MFA Enable Failed',
        message
      });
    }
  });

  /**
   * Verify MFA token
   * POST /mfa/verify
   */
  fastify.post('/verify', {
    schema: {
      description: 'Verify MFA token during authentication',
      tags: ['MFA'],
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 6, maxLength: 8 }
        },
        required: ['token'],
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            backupCodeUsed: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { token } = verifyMfaSchema.parse(request.body);
      const mfaService = new MfaService(fastify.prisma);

      const result = await mfaService.verifyMfa(request.jwtUser.userId, token);

      if (!result.success) {
        return reply.status(400).send({
          error: 'MFA Verification Failed',
          message: result.error || 'Invalid MFA token'
        });
      }

      return reply.status(200).send({
        success: true,
        backupCodeUsed: result.backupCodeUsed || false,
        message: result.backupCodeUsed
          ? 'Backup code used successfully. Consider generating new backup codes.'
          : 'MFA verification successful'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'MFA verification failed';
      return reply.status(400).send({
        error: 'MFA Verification Failed',
        message
      });
    }
  });

  /**
   * Disable MFA
   * POST /mfa/disable
   */
  fastify.post('/disable', {
    schema: {
      description: 'Disable MFA for authenticated user',
      tags: ['MFA'],
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 6, maxLength: 8 }
        },
        required: ['token'],
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { token } = disableMfaSchema.parse(request.body);
      const mfaService = new MfaService(fastify.prisma);

      await mfaService.disableMfa(request.jwtUser.userId, token);

      return reply.status(200).send({
        message: 'MFA has been disabled for your account'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'MFA disable failed';
      return reply.status(400).send({
        error: 'MFA Disable Failed',
        message
      });
    }
  });

  /**
   * Generate new backup codes
   * POST /mfa/backup-codes/regenerate
   */
  fastify.post('/backup-codes/regenerate', {
    schema: {
      description: 'Generate new MFA backup codes',
      tags: ['MFA'],
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 6, maxLength: 8 }
        },
        required: ['token'],
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            backupCodes: {
              type: 'array',
              items: { type: 'string' }
            },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { token } = generateBackupCodesSchema.parse(request.body);
      const mfaService = new MfaService(fastify.prisma);

      const backupCodes = await mfaService.generateNewBackupCodes(request.jwtUser.userId, token);

      return reply.status(200).send({
        backupCodes,
        message: 'New backup codes generated successfully. Please store them securely.'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate backup codes';
      return reply.status(400).send({
        error: 'Backup Code Generation Failed',
        message
      });
    }
  });

  /**
   * Send SMS code
   * POST /mfa/sms/send
   */
  fastify.post('/sms/send', {
    schema: {
      description: 'Send SMS verification code',
      tags: ['MFA'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            messageId: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const mfaService = new MfaService(fastify.prisma);

      const result = await mfaService.sendSmsCode(request.jwtUser.userId);

      if (!result.success) {
        return reply.status(400).send({
          error: 'SMS Send Failed',
          message: result.error || 'Failed to send SMS code'
        });
      }

      return reply.status(200).send({
        message: 'SMS verification code sent successfully',
        messageId: result.messageId
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send SMS';
      return reply.status(400).send({
        error: 'SMS Send Failed',
        message
      });
    }
  });

  /**
   * Get MFA status
   * GET /mfa/status
   */
  fastify.get('/status', {
    schema: {
      description: 'Get MFA status for authenticated user',
      tags: ['MFA'],
      response: {
        200: {
          type: 'object',
          properties: {
            mfaEnabled: { type: 'boolean' },
            hasBackupCodes: { type: 'boolean' },
            backupCodesCount: { type: 'number' },
            phoneVerified: { type: 'boolean' },
            lastMfaAt: { type: 'string', format: 'date-time' },
            isLocked: { type: 'boolean' },
            lockedUntil: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.jwtUser.userId },
        select: {
          mfaEnabled: true,
          mfaBackupCodes: true,
          phoneVerified: true,
          lastMfaAt: true,
          mfaLockedUntil: true
        }
      });

      if (!user) {
        return reply.status(404).send({
          error: 'User Not Found',
          message: 'User not found'
        });
      }

      const backupCodesCount = Array.isArray(user.mfaBackupCodes) ? user.mfaBackupCodes.length : 0;
      const isLocked = user.mfaLockedUntil ? new Date() < user.mfaLockedUntil : false;

      return reply.status(200).send({
        mfaEnabled: user.mfaEnabled,
        hasBackupCodes: backupCodesCount > 0,
        backupCodesCount,
        phoneVerified: user.phoneVerified,
        lastMfaAt: user.lastMfaAt?.toISOString(),
        isLocked,
        lockedUntil: user.mfaLockedUntil?.toISOString()
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get MFA status';
      return reply.status(500).send({
        error: 'Internal Server Error',
        message
      });
    }
  });
}