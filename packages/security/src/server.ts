import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

// Services
import { encryptionService } from './services/encryption';
import { accessControlService } from './services/access-control';
import { identityVerificationService } from './services/identity-verification';
import { auditLoggingService } from './services/audit-logging';
import { runtimeSecurityMonitor } from './services/runtime-security-monitor';
import { ddosProtectionService } from './services/ddos-protection';
import { complianceAutomationService } from './services/compliance-automation';
import { SecretsManagementService } from './services/secrets-management-service';

// Middleware
import {
  zeroTrustAuth,
  zeroTrustAuthorization,
  encryptResponse,
  adaptiveRateLimit,
  continuousAuthMonitoring,
  securityHeaders
} from './middleware/security-middleware';
import {
  ddosProtectionMiddleware,
  responseTimeMiddleware,
  enhancedSecurityHeaders
} from './middleware/ddos-middleware';

// Utils
import SecurityUtils, { SecurityConstants, SecurityErrorCodes } from './utils/security-utils';

const fastify: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty'
    } : undefined
  },
  requestIdLogLabel: 'requestId',
  trustProxy: true
});

// Initialize secrets management service
let secretsManagementService: SecretsManagementService | null = null;

/**
 * Register plugins and middleware
 */
async function registerPlugins() {
  // Security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    }
  });

  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  });

  await fastify.register(rateLimit, {
    max: SecurityConstants.DEFAULT_RATE_LIMIT_REQUESTS,
    timeWindow: SecurityConstants.DEFAULT_RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: (request, context) => ({
      error: 'Rate limit exceeded',
      code: SecurityErrorCodes.RATE_LIMIT_EXCEEDED,
      retryAfter: Math.round(context.ttl / 1000)
    })
  });

  // Global security middleware
  fastify.addHook('onRequest', enhancedSecurityHeaders);
  fastify.addHook('onRequest', responseTimeMiddleware);
  fastify.addHook('preHandler', ddosProtectionMiddleware);
  fastify.addHook('preHandler', adaptiveRateLimit);
  fastify.addHook('preHandler', continuousAuthMonitoring);

  // Response transformation for encryption
  fastify.addHook('onSend', async (request, reply, payload) => {
    return await encryptResponse(request, reply, payload);
  });
}

/**
 * Register routes
 */
async function registerRoutes() {
  // Health check (public)
  fastify.get('/health', async () => ({
    status: 'healthy',
    service: 'security',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  }));

  // Security service status (public)
  fastify.get('/status', async () => {
    const chainIntegrity = auditLoggingService.verifyChainIntegrity();
    const runtimeStats = runtimeSecurityMonitor.getStatistics();
    const ddosStats = ddosProtectionService.getStatistics();
    const ddosMetrics = await ddosProtectionService.getDDoSMetrics();
    const complianceStats = complianceAutomationService.getStatistics();

    return {
      services: {
        encryption: 'operational',
        accessControl: 'operational',
        identityVerification: 'operational',
        auditLogging: 'operational',
        runtimeSecurityMonitor: runtimeStats.monitoring ? 'monitoring' : 'stopped',
        ddosProtection: 'active',
        complianceAutomation: complianceStats.monitoring ? 'monitoring' : 'stopped'
      },
      security: {
        chainIntegrity: chainIntegrity.valid,
        lastVerification: new Date().toISOString(),
        runtimeMonitoring: runtimeStats.monitoring,
        ddosAttackInProgress: ddosStats.attackInProgress,
        complianceMonitoring: complianceStats.monitoring
      },
      metrics: {
        totalAuditEvents: auditLoggingService.generateStatistics().totalEvents,
        activePolicies: accessControlService.getPolicies().length,
        securityPolicies: runtimeStats.policies.total,
        activeBaselines: runtimeStats.baselines,
        ddos: {
          totalRequests: ddosMetrics.totalRequests,
          blockedRequests: ddosMetrics.blockedRequests,
          uniqueIPs: ddosMetrics.uniqueIPs,
          requestsPerSecond: ddosMetrics.requestsPerSecond,
          errorRate: ddosMetrics.errorRate,
          rateLimitRules: ddosStats.rules,
          ipReputations: ddosStats.ipReputations,
          activeChallenges: ddosStats.activeChallenges
        },
        compliance: {
          frameworks: complianceStats.frameworks,
          controls: complianceStats.controls,
          evidence: complianceStats.evidence,
          openFindings: complianceStats.openFindings,
          reports: complianceStats.reports
        }
      }
    };
  });

  // Authentication endpoints
  fastify.post('/auth/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' },
          deviceId: { type: 'string' },
          context: {
            type: 'object',
            properties: {
              ip: { type: 'string' },
              userAgent: { type: 'string' },
              location: { type: 'object' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { token, deviceId, context } = request.body as any;

    try {
      // Extract user ID from token (implement proper JWT verification)
      const userId = extractUserIdFromToken(token);
      if (!userId) {
        return reply.status(401).send({
          error: 'Invalid token',
          code: SecurityErrorCodes.INVALID_TOKEN
        });
      }

      // Perform identity verification
      const result = await identityVerificationService.verifyIdentity(
        userId,
        deviceId,
        context
      );

      // Log authentication attempt
      await auditLoggingService.logEvent({
        eventType: 'AUTHENTICATION_VERIFY',
        category: 'AUTHENTICATION',
        severity: result.success ? 'LOW' : 'MEDIUM',
        source: {
          service: 'security',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'localhost',
          ip: request.ip
        },
        actor: {
          userId,
          deviceId,
          userAgent: request.headers['user-agent'],
          type: 'USER'
        },
        target: {
          resource: '/auth/verify',
          resourceType: 'ENDPOINT'
        },
        action: 'VERIFY',
        outcome: result.success ? 'SUCCESS' : 'FAILURE',
        details: {
          trustScore: result.trustScore,
          verificationLevel: result.verificationLevel,
          challengesRequired: result.challenges.length
        },
        metadata: {
          correlationId: request.id,
          requestId: request.id
        },
        compliance: {
          gdpr: true,
          sox: false,
          iso27001: true,
          pci: false
        }
      });

      return {
        success: result.success,
        trustScore: result.trustScore,
        verificationLevel: result.verificationLevel,
        challenges: result.challenges.map(c => ({
          challengeId: c.challengeId,
          type: c.type
        })),
        riskFactors: result.riskFactors,
        recommendations: result.recommendedActions
      };

    } catch (error) {
      fastify.log.error('Authentication verification failed:', error);
      return reply.status(500).send({
        error: 'Authentication service error',
        code: SecurityErrorCodes.SECURITY_SERVICE_ERROR
      });
    }
  });

  // Challenge verification endpoint
  fastify.post('/auth/challenge/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['challengeId', 'response'],
        properties: {
          challengeId: { type: 'string' },
          response: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { challengeId, response } = request.body as any;

    try {
      const verified = await identityVerificationService.verifyChallenge(challengeId, response);

      await auditLoggingService.logEvent({
        eventType: 'CHALLENGE_VERIFICATION',
        category: 'AUTHENTICATION',
        severity: verified ? 'LOW' : 'MEDIUM',
        source: {
          service: 'security',
          version: '1.0.0',
          instance: process.env.HOSTNAME || 'localhost',
          ip: request.ip
        },
        actor: {
          userAgent: request.headers['user-agent'],
          type: 'USER'
        },
        target: {
          resource: '/auth/challenge/verify',
          resourceType: 'ENDPOINT'
        },
        action: 'VERIFY_CHALLENGE',
        outcome: verified ? 'SUCCESS' : 'FAILURE',
        details: { challengeId },
        metadata: {
          correlationId: request.id,
          requestId: request.id
        },
        compliance: {
          gdpr: true,
          sox: false,
          iso27001: true,
          pci: false
        }
      });

      return { verified };

    } catch (error) {
      fastify.log.error('Challenge verification failed:', error);
      return reply.status(500).send({
        error: 'Challenge verification failed',
        code: SecurityErrorCodes.SECURITY_SERVICE_ERROR
      });
    }
  });

  // Protected routes (require authentication)
  fastify.register(async function (fastify) {
    // Add authentication middleware
    fastify.addHook('preHandler', zeroTrustAuth);
    fastify.addHook('preHandler', zeroTrustAuthorization);

    // Access control evaluation
    fastify.post('/access/evaluate', {
      schema: {
        body: {
          type: 'object',
          required: ['resource', 'action'],
          properties: {
            resource: { type: 'string' },
            action: { type: 'string' },
            context: { type: 'object' }
          }
        }
      }
    }, async (request, reply) => {
      const { resource, action, context } = request.body as any;

      try {
        const accessRequest = {
          userId: request.security.userId!,
          resource,
          action,
          context: {
            ...context,
            ip: request.ip,
            timestamp: new Date(),
            device: {
              id: request.security.deviceId,
              trusted: request.security.trustScore > 70
            },
            session: {
              id: request.security.sessionId!,
              mfaVerified: request.security.verificationLevel !== 'BASIC',
              riskScore: 100 - request.security.trustScore
            }
          }
        };

        const decision = await accessControlService.evaluateAccess(accessRequest);

        return {
          decision: decision.decision,
          reason: decision.reason,
          riskScore: decision.riskScore,
          recommendations: decision.recommendations
        };

      } catch (error) {
        fastify.log.error('Access evaluation failed:', error);
        return reply.status(500).send({
          error: 'Access evaluation failed',
          code: SecurityErrorCodes.SECURITY_SERVICE_ERROR
        });
      }
    });

    // Audit log query
    fastify.post('/audit/query', {
      schema: {
        body: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            eventTypes: { type: 'array', items: { type: 'string' } },
            categories: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number', minimum: 1, maximum: 1000 },
            offset: { type: 'number', minimum: 0 }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const query = request.body as any;

        // Convert date strings to Date objects
        if (query.startDate) query.startDate = new Date(query.startDate);
        if (query.endDate) query.endDate = new Date(query.endDate);

        const events = auditLoggingService.queryEvents(query);

        return {
          events: events.map(event => ({
            id: event.id,
            timestamp: event.timestamp,
            eventType: event.eventType,
            category: event.category,
            severity: event.severity,
            outcome: event.outcome,
            actor: event.actor,
            target: event.target,
            action: event.action
          })),
          total: events.length
        };

      } catch (error) {
        fastify.log.error('Audit query failed:', error);
        return reply.status(500).send({
          error: 'Audit query failed',
          code: SecurityErrorCodes.AUDIT_LOG_ERROR
        });
      }
    });

    // Security statistics
    fastify.get('/stats', async (request, reply) => {
      try {
        const stats = auditLoggingService.generateStatistics();
        return stats;
      } catch (error) {
        fastify.log.error('Failed to generate statistics:', error);
        return reply.status(500).send({
          error: 'Failed to generate statistics',
          code: SecurityErrorCodes.SECURITY_SERVICE_ERROR
        });
      }
    });

    // Compliance report generation
    fastify.post('/compliance/report', {
      schema: {
        body: {
          type: 'object',
          required: ['framework', 'startDate', 'endDate'],
          properties: {
            framework: { type: 'string', enum: ['GDPR', 'SOX', 'ISO27001', 'PCI', 'ALL'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { framework, startDate, endDate } = request.body as any;

        const report = await auditLoggingService.generateComplianceReport(
          framework,
          {
            start: new Date(startDate),
            end: new Date(endDate)
          }
        );

        return report;

      } catch (error) {
        fastify.log.error('Compliance report generation failed:', error);
        return reply.status(500).send({
          error: 'Compliance report generation failed',
          code: SecurityErrorCodes.SECURITY_SERVICE_ERROR
        });
      }
    });

    // Encryption utilities
    fastify.post('/crypto/encrypt', {
      schema: {
        body: {
          type: 'object',
          required: ['data', 'publicKey'],
          properties: {
            data: { type: 'string' },
            publicKey: { type: 'string' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { data, publicKey } = request.body as any;
        const encrypted = encryptionService.encryptForTransport(data, publicKey);
        return { encrypted };
      } catch (error) {
        fastify.log.error('Encryption failed:', error);
        return reply.status(500).send({
          error: 'Encryption failed',
          code: SecurityErrorCodes.ENCRYPTION_ERROR
        });
      }
    });

    // Security utilities
    fastify.post('/utils/validate-password', {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string' }
          }
        }
      }
    }, async (request, reply) => {
      const { password } = request.body as any;
      const validation = SecurityUtils.validatePassword(password);
      return validation;
    });

    fastify.post('/utils/generate-password', {
      schema: {
        body: {
          type: 'object',
          properties: {
            length: { type: 'number', minimum: 8, maximum: 128 },
            options: { type: 'object' }
          }
        }
      }
    }, async (request, reply) => {
      const { length = 16, options = {} } = request.body as any;
      const password = SecurityUtils.generateSecurePassword(length, options);
      return { password };
    });

    // Runtime Security Monitor Management
    fastify.post('/runtime/monitor/start', async (request, reply) => {
      try {
        await runtimeSecurityMonitor.startMonitoring();
        return { success: true, message: 'Runtime security monitoring started' };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to start runtime monitoring',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    fastify.post('/runtime/monitor/stop', async (request, reply) => {
      try {
        await runtimeSecurityMonitor.stopMonitoring();
        return { success: true, message: 'Runtime security monitoring stopped' };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to stop runtime monitoring',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    fastify.get('/runtime/monitor/status', async (request, reply) => {
      const stats = runtimeSecurityMonitor.getStatistics();
      return stats;
    });

    fastify.get('/runtime/policies', async (request, reply) => {
      const policies = runtimeSecurityMonitor.getPolicies();
      return { policies };
    });

    fastify.post('/runtime/policies', {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'description', 'severity', 'rule', 'action'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            rule: { type: 'string' },
            action: { type: 'string', enum: ['log', 'alert', 'block', 'kill'] },
            enabled: { type: 'boolean' },
            metadata: { type: 'object' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { name, description, severity, rule, action, enabled = true, metadata = {} } = request.body as any;

        const policy = {
          id: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          description,
          severity,
          enabled,
          rule,
          action,
          metadata
        };

        runtimeSecurityMonitor.addPolicy(policy);

        return {
          success: true,
          message: 'Security policy created',
          policy: policy
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to create security policy',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    fastify.delete('/runtime/policies/:policyId', async (request, reply) => {
      try {
        const { policyId } = request.params as any;
        const removed = runtimeSecurityMonitor.removePolicy(policyId);

        if (removed) {
          return { success: true, message: 'Security policy removed' };
        } else {
          return reply.status(404).send({
            error: 'Policy not found',
            policyId
          });
        }
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to remove security policy',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    fastify.post('/runtime/baselines', {
      schema: {
        body: {
          type: 'object',
          required: ['containerId', 'containerName', 'image'],
          properties: {
            containerId: { type: 'string' },
            containerName: { type: 'string' },
            image: { type: 'string' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { containerId, containerName, image } = request.body as any;
        await runtimeSecurityMonitor.createBaseline(containerId, containerName, image);

        return {
          success: true,
          message: 'Container baseline created',
          baseline: { containerId, containerName, image }
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to create container baseline',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // DDoS Protection Management
    fastify.get('/ddos/metrics', async (request, reply) => {
      try {
        const metrics = await ddosProtectionService.getDDoSMetrics();
        return metrics;
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to retrieve DDoS metrics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    fastify.get('/ddos/rules', async (request, reply) => {
      const rules = ddosProtectionService.getRules();
      return { rules };
    });

    fastify.post('/ddos/rules', {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'path', 'method', 'windowMs', 'maxRequests'],
          properties: {
            name: { type: 'string' },
            path: { type: 'string' },
            method: { type: 'string' },
            windowMs: { type: 'number', minimum: 1000 },
            maxRequests: { type: 'number', minimum: 1 },
            burst: { type: 'number', minimum: 0 },
            skipSuccessfulRequests: { type: 'boolean' },
            skipFailedRequests: { type: 'boolean' },
            enabled: { type: 'boolean' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const {
          name, path, method, windowMs, maxRequests,
          burst = 5, skipSuccessfulRequests = false,
          skipFailedRequests = false, enabled = true
        } = request.body as any;

        const rule = {
          id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          path,
          method,
          windowMs,
          maxRequests,
          burst,
          skipSuccessfulRequests,
          skipFailedRequests,
          enabled
        };

        ddosProtectionService.addRule(rule);

        return {
          success: true,
          message: 'Rate limiting rule created',
          rule
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to create rate limiting rule',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    fastify.delete('/ddos/rules/:ruleId', async (request, reply) => {
      try {
        const { ruleId } = request.params as any;
        const removed = ddosProtectionService.removeRule(ruleId);

        if (removed) {
          return { success: true, message: 'Rate limiting rule removed' };
        } else {
          return reply.status(404).send({
            error: 'Rule not found',
            ruleId
          });
        }
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to remove rate limiting rule',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    fastify.post('/ddos/challenge/verify', {
      schema: {
        body: {
          type: 'object',
          required: ['challengeId', 'response'],
          properties: {
            challengeId: { type: 'string' },
            response: { type: 'string' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { challengeId, response } = request.body as any;
        const result = await ddosProtectionService.verifyChallenge(challengeId, response);

        return result;
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to verify challenge',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  });
}

/**
 * Error handling
 */
function setupErrorHandling() {
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error('Request error:', error);

    // Audit log the error
    auditLoggingService.logEvent({
      eventType: 'ERROR_OCCURRED',
      category: 'SYSTEM',
      severity: 'HIGH',
      source: {
        service: 'security',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: request.ip
      },
      actor: {
        userId: request.security?.userId,
        userAgent: request.headers['user-agent'],
        type: request.security?.userId ? 'USER' : 'ANONYMOUS'
      },
      target: {
        resource: request.routerPath || request.url,
        resourceType: 'ENDPOINT'
      },
      action: request.method,
      outcome: 'FAILURE',
      details: {
        errorMessage: error.message,
        errorStack: error.stack
      },
      metadata: {
        correlationId: request.id,
        requestId: request.id,
        errorCode: error.code
      },
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    }).catch(auditError => {
      fastify.log.error('Failed to log error event:', auditError);
    });

    // Send appropriate error response
    const statusCode = error.statusCode || 500;
    const errorResponse = {
      error: error.message || 'Internal server error',
      code: error.code || SecurityErrorCodes.SECURITY_SERVICE_ERROR,
      requestId: request.id
    };

    reply.status(statusCode).send(errorResponse);
  });

  // Graceful shutdown
  fastify.addHook('onClose', async (instance, done) => {
    instance.log.info('Security service shutting down...');

    // Perform cleanup operations
    await auditLoggingService.logEvent({
      eventType: 'SERVICE_SHUTDOWN',
      category: 'SYSTEM',
      severity: 'LOW',
      source: {
        service: 'security',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'localhost'
      },
      actor: {
        type: 'SYSTEM'
      },
      target: {
        resource: 'security-service',
        resourceType: 'SERVICE'
      },
      action: 'SHUTDOWN',
      outcome: 'SUCCESS',
      details: {},
      metadata: {},
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    });

    done();
  });
}

/**
 * Helper function to extract user ID from token
 */
function extractUserIdFromToken(token: string): string | null {
  try {
    // Simplified token extraction - implement proper JWT verification in production
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.sub || payload.userId;
  } catch {
    return null;
  }
}

/**
 * Start the security service
 */
async function start() {
  try {
    await registerPlugins();
    await registerRoutes();
    setupErrorHandling();

    // Initialize runtime security monitor
    await runtimeSecurityMonitor.initialize();

    // Start runtime monitoring if enabled
    if (process.env.RUNTIME_MONITORING_ENABLED !== 'false') {
      await runtimeSecurityMonitor.startMonitoring();
    }

    // Set up runtime security event handlers
    runtimeSecurityMonitor.on('securityEvent', (event, analysis) => {
      fastify.log.info(`Runtime security event: ${event.rule} - ${analysis.threatLevel}`);
    });

    runtimeSecurityMonitor.on('criticalThreat', (event, analysis) => {
      fastify.log.error(`CRITICAL THREAT DETECTED: ${event.rule} in ${event.source.container_name}`);
      // In production, this would trigger immediate alerts to security team
    });

    // Set up DDoS protection event handlers
    ddosProtectionService.on('ddosAttackDetected', (pattern) => {
      fastify.log.error(`DDoS ATTACK DETECTED: ${pattern.requestsPerSecond} RPS, ${pattern.uniqueIPs} unique IPs`);
      // In production, this would trigger emergency response procedures
    });

    ddosProtectionService.on('ddosAttackEnded', (pattern) => {
      fastify.log.info(`DDoS attack ended. Traffic normalized: ${pattern.requestsPerSecond} RPS`);
    });

    ddosProtectionService.on('ipBlacklisted', (reputation) => {
      fastify.log.warn(`IP automatically blacklisted: ${reputation.ip} (score: ${reputation.score})`);
    });

    const port = parseInt(process.env.SECURITY_PORT || '7009');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    // Log service startup
    await auditLoggingService.logEvent({
      eventType: 'SERVICE_STARTUP',
      category: 'SYSTEM',
      severity: 'LOW',
      source: {
        service: 'security',
        version: '1.0.0',
        instance: process.env.HOSTNAME || 'localhost',
        ip: 'localhost'
      },
      actor: {
        type: 'SYSTEM'
      },
      target: {
        resource: 'security-service',
        resourceType: 'SERVICE'
      },
      action: 'STARTUP',
      outcome: 'SUCCESS',
      details: { port, host },
      metadata: {},
      compliance: {
        gdpr: false,
        sox: false,
        iso27001: true,
        pci: false
      }
    });

    fastify.log.info(`Security service listening on ${host}:${port}`);

  } catch (err) {
    fastify.log.error('Failed to start security service:', err);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => fastify.close());
process.on('SIGTERM', () => fastify.close());

start();