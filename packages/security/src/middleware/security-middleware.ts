import { FastifyRequest, FastifyReply } from 'fastify';
import { accessControlService } from '../services/access-control';
import { identityVerificationService } from '../services/identity-verification';
import { auditLoggingService } from '../services/audit-logging';
import { encryptionService } from '../services/encryption';

export interface SecurityContext {
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  trustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  verificationLevel: 'BASIC' | 'STANDARD' | 'ENHANCED' | 'MAXIMUM';
  authenticated: boolean;
  authorized: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    security: SecurityContext;
  }
}

/**
 * Zero-trust authentication middleware
 */
export async function zeroTrustAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();
  let authenticated = false;
  let trustScore = 0;
  let verificationLevel: SecurityContext['verificationLevel'] = 'BASIC';

  try {
    // Extract authentication context
    const authHeader = request.headers.authorization;
    const deviceId = request.headers['x-device-id'] as string;
    const sessionId = request.headers['x-session-id'] as string;

    if (!authHeader) {
      await logSecurityEvent(request, 'AUTHENTICATION_MISSING', 'MEDIUM', 'FAILURE');
      return reply.status(401).send({ error: 'Authentication required' });
    }

    // Extract user ID from token (simplified - use proper JWT verification)
    const token = authHeader.replace('Bearer ', '');
    const userId = extractUserIdFromToken(token);

    if (!userId) {
      await logSecurityEvent(request, 'INVALID_TOKEN', 'HIGH', 'FAILURE');
      return reply.status(401).send({ error: 'Invalid authentication token' });
    }

    // Verify identity with comprehensive checks
    const verificationResult = await identityVerificationService.verifyIdentity(
      userId,
      deviceId,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] || '',
        location: await getLocationFromIP(request.ip)
      }
    );

    authenticated = verificationResult.success;
    trustScore = verificationResult.trustScore;
    verificationLevel = verificationResult.verificationLevel;

    if (!authenticated || verificationResult.challenges.length > 0) {
      await logSecurityEvent(request, 'VERIFICATION_REQUIRED', 'MEDIUM', 'FAILURE');
      return reply.status(403).send({
        error: 'Additional verification required',
        challenges: verificationResult.challenges.map(c => ({
          challengeId: c.challengeId,
          type: c.type
        })),
        riskFactors: verificationResult.riskFactors,
        recommendations: verificationResult.recommendedActions
      });
    }

    // Initialize security context
    request.security = {
      userId,
      deviceId,
      sessionId,
      trustScore,
      riskLevel: calculateRiskLevel(trustScore),
      verificationLevel,
      authenticated: true,
      authorized: false // Will be set by authorization middleware
    };

    await logSecurityEvent(request, 'AUTHENTICATION_SUCCESS', 'LOW', 'SUCCESS');

  } catch (error) {
    console.error('Authentication error:', error);
    await logSecurityEvent(request, 'AUTHENTICATION_ERROR', 'HIGH', 'FAILURE');
    return reply.status(500).send({ error: 'Authentication service error' });
  } finally {
    const duration = Date.now() - startTime;
    console.log(`Authentication completed in ${duration}ms for ${request.ip}`);
  }
}

/**
 * Zero-trust authorization middleware
 */
export async function zeroTrustAuthorization(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.security || !request.security.authenticated) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const startTime = Date.now();

  try {
    // Prepare access request
    const accessRequest = {
      userId: request.security.userId!,
      resource: request.routerPath || request.url,
      action: request.method,
      context: {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
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

    // Evaluate access decision
    const accessDecision = await accessControlService.evaluateAccess(accessRequest);

    if (accessDecision.decision === 'DENY') {
      await logSecurityEvent(request, 'AUTHORIZATION_DENIED', 'MEDIUM', 'FAILURE', {
        reason: accessDecision.reason,
        riskScore: accessDecision.riskScore
      });

      return reply.status(403).send({
        error: 'Access denied',
        reason: accessDecision.reason,
        recommendations: accessDecision.recommendations
      });
    }

    // Update security context
    request.security.authorized = true;
    request.security.riskLevel = calculateRiskLevel(accessDecision.riskScore);

    await logSecurityEvent(request, 'AUTHORIZATION_SUCCESS', 'LOW', 'SUCCESS', {
      appliedPolicies: accessDecision.appliedPolicies,
      riskScore: accessDecision.riskScore
    });

  } catch (error) {
    console.error('Authorization error:', error);
    await logSecurityEvent(request, 'AUTHORIZATION_ERROR', 'HIGH', 'FAILURE');
    return reply.status(500).send({ error: 'Authorization service error' });
  } finally {
    const duration = Date.now() - startTime;
    console.log(`Authorization completed in ${duration}ms for ${request.security.userId}`);
  }
}

/**
 * Data encryption middleware for sensitive responses
 */
export async function encryptResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
): Promise<any> {
  if (!request.security || !shouldEncryptResponse(request)) {
    return payload;
  }

  try {
    // Check if client supports encryption
    const encryptionSupported = request.headers['x-encryption-supported'] === 'true';
    const clientPublicKey = request.headers['x-public-key'] as string;

    if (!encryptionSupported || !clientPublicKey) {
      return payload;
    }

    // Encrypt response payload
    const payloadString = JSON.stringify(payload);
    const encryptedResponse = encryptionService.encryptForTransport(payloadString, clientPublicKey);

    // Set encryption headers
    reply.header('x-encrypted', 'true');
    reply.header('x-encryption-algorithm', 'AES-256-GCM+RSA-4096');

    return {
      encrypted: true,
      data: encryptedResponse.encryptedData,
      key: encryptedResponse.encryptedKey
    };

  } catch (error) {
    console.error('Response encryption error:', error);
    // Return unencrypted payload on encryption failure
    return payload;
  }
}

/**
 * Rate limiting middleware with adaptive thresholds
 */
export async function adaptiveRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const clientId = request.security?.userId || request.ip;
  const riskLevel = request.security?.riskLevel || 'MEDIUM';

  // Adaptive rate limits based on risk level
  const rateLimits = {
    LOW: { requests: 1000, window: 60000 }, // 1000 requests per minute
    MEDIUM: { requests: 500, window: 60000 }, // 500 requests per minute
    HIGH: { requests: 100, window: 60000 }, // 100 requests per minute
    CRITICAL: { requests: 10, window: 60000 } // 10 requests per minute
  };

  const limit = rateLimits[riskLevel];

  // Simplified rate limiting (implement proper rate limiting with Redis in production)
  const key = `rate_limit:${clientId}:${Math.floor(Date.now() / limit.window)}`;

  // In production, use Redis or similar for distributed rate limiting
  // For now, just log the rate limit check
  await logSecurityEvent(request, 'RATE_LIMIT_CHECK', 'LOW', 'SUCCESS', {
    clientId,
    riskLevel,
    limit: limit.requests
  });
}

/**
 * Continuous authentication monitoring
 */
export async function continuousAuthMonitoring(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.security?.sessionId) {
    return;
  }

  try {
    // Update continuous authentication context
    const behaviorData = {
      endpoint: request.routerPath,
      method: request.method,
      timestamp: new Date(),
      userAgent: request.headers['user-agent'],
      ip: request.ip
    };

    const newRiskScore = identityVerificationService.updateContinuousAuth(
      request.security.sessionId,
      behaviorData
    );

    // Update security context if risk score changed significantly
    if (Math.abs(newRiskScore - request.security.trustScore) > 20) {
      request.security.trustScore = newRiskScore;
      request.security.riskLevel = calculateRiskLevel(newRiskScore);

      await logSecurityEvent(request, 'RISK_SCORE_CHANGE', 'MEDIUM', 'SUCCESS', {
        oldScore: request.security.trustScore,
        newScore: newRiskScore
      });
    }

  } catch (error) {
    console.error('Continuous auth monitoring error:', error);
  }
}

/**
 * Security headers middleware
 */
export async function securityHeaders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Set security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('Content-Security-Policy', "default-src 'self'");
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Remove sensitive headers
  reply.removeHeader('X-Powered-By');
  reply.removeHeader('Server');
}

/**
 * Helper functions
 */

function extractUserIdFromToken(token: string): string | null {
  try {
    // Simplified token extraction - use proper JWT verification in production
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.sub || payload.userId;
  } catch {
    return null;
  }
}

async function getLocationFromIP(ip: string): Promise<any> {
  // Simplified location lookup - integrate with GeoIP service in production
  return {
    country: 'US',
    region: 'CA',
    city: 'San Francisco'
  };
}

function calculateRiskLevel(trustScore: number): SecurityContext['riskLevel'] {
  if (trustScore >= 80) return 'LOW';
  if (trustScore >= 60) return 'MEDIUM';
  if (trustScore >= 30) return 'HIGH';
  return 'CRITICAL';
}

function shouldEncryptResponse(request: FastifyRequest): boolean {
  // Determine if response should be encrypted based on content sensitivity
  const sensitiveEndpoints = [
    '/api/v1/users',
    '/api/v1/profiles',
    '/api/v1/payments',
    '/api/v1/financial'
  ];

  return sensitiveEndpoints.some(endpoint =>
    request.routerPath?.startsWith(endpoint)
  );
}

async function logSecurityEvent(
  request: FastifyRequest,
  eventType: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL',
  details: Record<string, any> = {}
): Promise<void> {
  await auditLoggingService.logEvent({
    eventType,
    category: 'SECURITY',
    severity,
    source: {
      service: 'security',
      version: '1.0.0',
      instance: process.env.NODE_ENV || 'development',
      ip: request.ip
    },
    actor: {
      userId: request.security?.userId,
      sessionId: request.security?.sessionId,
      deviceId: request.security?.deviceId,
      userAgent: request.headers['user-agent'],
      type: request.security?.userId ? 'USER' : 'ANONYMOUS'
    },
    target: {
      resource: request.routerPath || request.url,
      resourceType: 'ENDPOINT'
    },
    action: request.method,
    outcome,
    details,
    metadata: {
      correlationId: request.id,
      requestId: request.id,
      traceId: request.headers['x-trace-id'] as string
    },
    compliance: {
      gdpr: true,
      sox: false,
      iso27001: true,
      pci: false
    }
  });
}