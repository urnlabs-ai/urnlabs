import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { z } from 'zod';
import { ScanOrchestrator } from './orchestrator/scan-orchestrator.js';
import { logger } from './utils/logger.js';
import { ScanConfig, ScanType } from './types/scan-types.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty'
    } : undefined
  }
});

// Initialize scan orchestrator
const scanOrchestrator = new ScanOrchestrator();

// Register plugins
await fastify.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || true
});

await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Register Swagger documentation
await fastify.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Urnlabs Security Scanner API',
      description: 'Comprehensive vulnerability scanning service',
      version: '1.0.0'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header'
        }
      }
    }
  }
});

await fastify.register(swaggerUI, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  }
});

// Validation schemas
const ScanConfigSchema = z.object({
  repository: z.string().optional(),
  branch: z.string().optional(),
  targetUrl: z.string().url().optional(),
  includeDevDependencies: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  severity: z.array(z.enum(['critical', 'high', 'medium', 'low', 'info'])).optional(),
  excludePatterns: z.array(z.string()).optional(),
  generateReport: z.boolean().optional(),
  notifyOnCritical: z.boolean().optional()
});

const MultiScanSchema = z.object({
  scanTypes: z.array(z.enum(['dependency', 'secrets', 'sast', 'dast'])),
  repository: z.string(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  config: ScanConfigSchema.optional()
});

// Routes

// Health check
fastify.get('/health', {
  schema: {
    description: 'Health check endpoint',
    tags: ['Health'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          timestamp: { type: 'string' },
          uptime: { type: 'number' },
          version: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  };
});

// Start comprehensive scan
fastify.post('/scans/full', {
  schema: {
    description: 'Start a comprehensive vulnerability scan',
    tags: ['Scans'],
    body: MultiScanSchema,
    response: {
      200: {
        type: 'object',
        properties: {
          scanId: { type: 'string' },
          status: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const body = MultiScanSchema.parse(request.body);

    const scanId = await scanOrchestrator.scheduleFullScan({
      scanTypes: body.scanTypes,
      repository: body.repository,
      priority: body.priority || 'normal',
      config: body.config
    });

    return {
      scanId,
      status: 'scheduled',
      message: 'Comprehensive scan scheduled successfully'
    };

  } catch (error) {
    reply.code(400);
    return {
      error: 'Invalid request',
      message: error.message
    };
  }
});

// Start individual scan
fastify.post('/scans/:type', {
  schema: {
    description: 'Start an individual vulnerability scan',
    tags: ['Scans'],
    params: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['dependency', 'secrets', 'sast', 'dast']
        }
      }
    },
    body: ScanConfigSchema,
    response: {
      200: {
        type: 'object',
        properties: {
          scanId: { type: 'string' },
          status: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { type } = request.params as { type: ScanType };
    const config = ScanConfigSchema.parse(request.body);

    const scanId = await scanOrchestrator.scheduleScan(type, config);

    return {
      scanId,
      status: 'scheduled',
      message: `${type} scan scheduled successfully`
    };

  } catch (error) {
    reply.code(400);
    return {
      error: 'Invalid request',
      message: error.message
    };
  }
});

// Get scan status
fastify.get('/scans/:scanId/status', {
  schema: {
    description: 'Get scan status',
    tags: ['Scans'],
    params: {
      type: 'object',
      properties: {
        scanId: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          scanId: { type: 'string' },
          status: { type: 'string' },
          progress: { type: 'number' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { scanId } = request.params as { scanId: string };

    const status = await scanOrchestrator.getScanStatus(scanId);

    if (status.status === 'not_found') {
      reply.code(404);
      return {
        error: 'Scan not found',
        message: `Scan with ID ${scanId} was not found`
      };
    }

    return {
      scanId,
      ...status
    };

  } catch (error) {
    reply.code(500);
    return {
      error: 'Internal server error',
      message: error.message
    };
  }
});

// Cancel scan
fastify.delete('/scans/:scanId', {
  schema: {
    description: 'Cancel a running scan',
    tags: ['Scans'],
    params: {
      type: 'object',
      properties: {
        scanId: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          cancelled: { type: 'boolean' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { scanId } = request.params as { scanId: string };

    const cancelled = await scanOrchestrator.cancelScan(scanId);

    if (!cancelled) {
      reply.code(404);
      return {
        error: 'Scan not found or cannot be cancelled',
        message: `Scan with ID ${scanId} was not found or cannot be cancelled`
      };
    }

    return {
      message: 'Scan cancelled successfully',
      cancelled: true
    };

  } catch (error) {
    reply.code(500);
    return {
      error: 'Internal server error',
      message: error.message
    };
  }
});

// Get scan history
fastify.get('/scans/history', {
  schema: {
    description: 'Get scan history',
    tags: ['Scans'],
    querystring: {
      type: 'object',
      properties: {
        repository: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 50 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          scans: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                scanId: { type: 'string' },
                scanType: { type: 'string' },
                status: { type: 'string' },
                startTime: { type: 'string' },
                endTime: { type: 'string' },
                summary: { type: 'object' }
              }
            }
          },
          total: { type: 'number' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { repository, limit = 50 } = request.query as { repository?: string; limit?: number };

    const scans = scanOrchestrator.getScanHistory(repository, limit);

    return {
      scans: scans.map(scan => ({
        scanId: scan.scanId,
        scanType: scan.scanType,
        status: scan.status,
        startTime: scan.startTime.toISOString(),
        endTime: scan.endTime.toISOString(),
        summary: scan.summary,
        repository: scan.metadata?.repository
      })),
      total: scans.length
    };

  } catch (error) {
    reply.code(500);
    return {
      error: 'Internal server error',
      message: error.message
    };
  }
});

// Get vulnerability trends
fastify.get('/analytics/trends/:repository', {
  schema: {
    description: 'Get vulnerability trends for a repository',
    tags: ['Analytics'],
    params: {
      type: 'object',
      properties: {
        repository: { type: 'string' }
      }
    },
    querystring: {
      type: 'object',
      properties: {
        days: { type: 'number', minimum: 1, maximum: 365, default: 30 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          trends: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                critical: { type: 'number' },
                high: { type: 'number' },
                medium: { type: 'number' },
                low: { type: 'number' }
              }
            }
          },
          summary: {
            type: 'object',
            properties: {
              current: { type: 'number' },
              trend: { type: 'string' },
              change: { type: 'number' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { repository } = request.params as { repository: string };
    const { days = 30 } = request.query as { days?: number };

    const trends = await scanOrchestrator.getVulnerabilityTrends(repository, days);

    return trends;

  } catch (error) {
    reply.code(500);
    return {
      error: 'Internal server error',
      message: error.message
    };
  }
});

// WebSocket endpoint for real-time updates
fastify.register(async function (fastify) {
  await fastify.register(require('@fastify/websocket'));

  fastify.get('/ws/scans', { websocket: true }, (connection, req) => {
    logger.info('WebSocket connection established');

    // Listen for scan events
    const onScanCompleted = (result: any) => {
      connection.socket.send(JSON.stringify({
        type: 'scanCompleted',
        data: result
      }));
    };

    const onCriticalVulnerabilities = (data: any) => {
      connection.socket.send(JSON.stringify({
        type: 'criticalVulnerabilities',
        data
      }));
    };

    const onScanFailed = (data: any) => {
      connection.socket.send(JSON.stringify({
        type: 'scanFailed',
        data
      }));
    };

    // Register event listeners
    scanOrchestrator.on('scanCompleted', onScanCompleted);
    scanOrchestrator.on('criticalVulnerabilities', onCriticalVulnerabilities);
    scanOrchestrator.on('scanFailed', onScanFailed);

    // Handle connection close
    connection.socket.on('close', () => {
      logger.info('WebSocket connection closed');

      // Remove event listeners
      scanOrchestrator.removeListener('scanCompleted', onScanCompleted);
      scanOrchestrator.removeListener('criticalVulnerabilities', onCriticalVulnerabilities);
      scanOrchestrator.removeListener('scanFailed', onScanFailed);
    });

    // Send initial status
    connection.socket.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established'
    }));
  });
});

// Error handling
fastify.setErrorHandler((error, request, reply) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });

  reply.code(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Graceful shutdown initiated');

  try {
    await scanOrchestrator.shutdown();
    await fastify.close();
    logger.info('Server shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const start = async () => {
  try {
    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT || '3000');

    await fastify.listen({ host, port });

    logger.info(`Security Scanner API server listening on ${host}:${port}`);
    logger.info(`API Documentation available at http://${host}:${port}/docs`);

  } catch (err) {
    logger.error('Error starting server', { error: err.message });
    process.exit(1);
  }
};

start();