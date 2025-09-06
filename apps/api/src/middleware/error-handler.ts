import { FastifyInstance, FastifyPluginOptions, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { logger, logError } from '@/lib/logger.js';

interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

export async function errorHandler(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;
    const statusCode = error.statusCode || 500;

    // Log error with context
    logError(error, {
      requestId,
      method: request.method,
      url: request.url,
      statusCode,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    let errorResponse: ErrorResponse = {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      requestId,
    };

    // Handle different error types
    if (error instanceof ZodError) {
      // Validation errors
      errorResponse = {
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
        requestId,
      };
      reply.status(400);
    } else if (error instanceof PrismaClientKnownRequestError) {
      // Database errors
      switch (error.code) {
        case 'P2002':
          errorResponse = {
            error: 'Conflict',
            message: 'A record with this data already exists',
            code: error.code,
            requestId,
          };
          reply.status(409);
          break;
        case 'P2025':
          errorResponse = {
            error: 'Not Found',
            message: 'The requested record was not found',
            code: error.code,
            requestId,
          };
          reply.status(404);
          break;
        case 'P2003':
          errorResponse = {
            error: 'Foreign Key Constraint',
            message: 'Cannot delete or update record due to foreign key constraint',
            code: error.code,
            requestId,
          };
          reply.status(400);
          break;
        default:
          errorResponse = {
            error: 'Database Error',
            message: 'A database error occurred',
            code: error.code,
            requestId,
          };
          reply.status(500);
      }
    } else if (statusCode === 401) {
      errorResponse = {
        error: 'Unauthorized',
        message: 'Authentication required',
        requestId,
      };
      reply.status(401);
    } else if (statusCode === 403) {
      errorResponse = {
        error: 'Forbidden',
        message: 'Insufficient permissions',
        requestId,
      };
      reply.status(403);
    } else if (statusCode === 404) {
      errorResponse = {
        error: 'Not Found',
        message: 'The requested resource was not found',
        requestId,
      };
      reply.status(404);
    } else if (statusCode === 429) {
      errorResponse = {
        error: 'Rate Limit Exceeded',
        message: 'Too many requests, please try again later',
        requestId,
      };
      reply.status(429);
    } else if (statusCode >= 400 && statusCode < 500) {
      // Client errors
      errorResponse = {
        error: 'Bad Request',
        message: error.message || 'Invalid request',
        requestId,
      };
      reply.status(statusCode);
    } else {
      // Server errors
      reply.status(500);
    }

    // Add security headers
    reply.headers({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    });

    return reply.send(errorResponse);
  });

  // Handle 404 errors for undefined routes
  fastify.setNotFoundHandler((request, reply) => {
    const errorResponse: ErrorResponse = {
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    };

    logger.warn({
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
    }, 'Route not found');

    reply.status(404).send(errorResponse);
  });
}