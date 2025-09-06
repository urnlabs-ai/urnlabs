import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { createRequestLogger, logPerformance } from '@/lib/logger.js';

export async function requestLogger(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Request start logging
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.startTime = Date.now();
    
    const reqLogger = createRequestLogger(
      request.id,
      request.method,
      request.url
    );

    reqLogger.info({
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      referer: request.headers.referer,
      contentLength: request.headers['content-length'],
    }, 'Request started');
  });

  // Response logging
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    
    const reqLogger = createRequestLogger(
      request.id,
      request.method,
      request.url
    );

    const logData = {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      contentLength: reply.getHeader('content-length'),
      userId: request.user?.userId,
    };

    // Determine log level based on status code
    if (reply.statusCode >= 500) {
      reqLogger.error(logData, `Request failed with ${reply.statusCode}`);
    } else if (reply.statusCode >= 400) {
      reqLogger.warn(logData, `Request completed with ${reply.statusCode}`);
    } else {
      reqLogger.info(logData, `Request completed with ${reply.statusCode}`);
    }

    // Log performance metrics for slow requests
    if (duration > 1000) { // Log slow requests (>1s)
      logPerformance(
        `${request.method} ${request.url}`,
        duration,
        {
          statusCode: reply.statusCode,
          userId: request.user?.userId,
          slow: true,
        }
      );
    }

    // Business metrics logging
    if (request.url.startsWith('/api/agents') && request.method === 'POST') {
      // Log agent creation metrics
      logPerformance('agent_creation', duration, {
        statusCode: reply.statusCode,
        success: reply.statusCode < 400,
      });
    }

    if (request.url.startsWith('/api/workflows') && request.method === 'POST') {
      // Log workflow execution metrics
      logPerformance('workflow_execution', duration, {
        statusCode: reply.statusCode,
        success: reply.statusCode < 400,
      });
    }
  });

  // Error logging
  fastify.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, error: Error) => {
    const duration = Date.now() - (request.startTime || Date.now());
    
    const reqLogger = createRequestLogger(
      request.id,
      request.method,
      request.url
    );

    reqLogger.error({
      method: request.method,
      url: request.url,
      duration,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: request.user?.userId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    }, 'Request failed with error');
  });
}

// Extend FastifyRequest to include startTime
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}