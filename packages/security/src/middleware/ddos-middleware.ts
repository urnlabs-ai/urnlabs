/**
 * DDoS Protection Middleware
 *
 * Integrates DDoS protection service with Fastify request pipeline
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ddosProtectionService } from '../services/ddos-protection';

/**
 * DDoS protection middleware for Fastify
 */
export async function ddosProtectionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const ip = getClientIP(request);
    const path = request.routerPath || request.url;
    const method = request.method;
    const userAgent = request.headers['user-agent'];
    const headers = request.headers as Record<string, string>;

    // Check rate limit and DDoS protection
    const result = await ddosProtectionService.checkRateLimit(ip, path, method, userAgent, headers);

    if (!result.allowed) {
      // Add rate limit headers
      if (result.remainingRequests !== undefined) {
        reply.header('X-RateLimit-Remaining', result.remainingRequests);
      }
      if (result.resetTime !== undefined) {
        reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
      }

      switch (result.action) {
        case 'challenge':
          // Return challenge for suspicious requests
          return reply.status(429).send({
            error: 'Challenge required',
            challengeId: result.challengeId,
            message: 'Please complete the challenge to continue',
            type: 'challenge_required'
          });

        case 'block':
          // Block malicious requests
          return reply.status(429).send({
            error: 'Rate limit exceeded',
            message: result.reason || 'Too many requests',
            retryAfter: result.resetTime ? Math.ceil((result.resetTime - Date.now()) / 1000) : 60
          });

        default:
          return reply.status(429).send({
            error: 'Rate limit exceeded',
            message: result.reason || 'Too many requests',
            retryAfter: result.resetTime ? Math.ceil((result.resetTime - Date.now()) / 1000) : 60
          });
      }
    }

    // Add rate limit headers for successful requests
    if (result.remainingRequests !== undefined) {
      reply.header('X-RateLimit-Remaining', result.remainingRequests);
    }
    if (result.resetTime !== undefined) {
      reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
    }
    reply.header('X-RateLimit-Limit', 'varies');

  } catch (error) {
    // Log error but don't block request (fail open)
    request.log.error('DDoS protection middleware error:', error);
  }
}

/**
 * Extract client IP address from request
 */
function getClientIP(request: FastifyRequest): string {
  // Check for forwarded IP addresses
  const forwarded = request.headers['x-forwarded-for'] as string;
  if (forwarded) {
    // Take the first IP from the chain
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0];
  }

  // Check for Cloudflare connecting IP
  const cfConnectingIP = request.headers['cf-connecting-ip'] as string;
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Check for real IP header
  const realIP = request.headers['x-real-ip'] as string;
  if (realIP) {
    return realIP;
  }

  // Fall back to connection remote address
  return request.ip || '127.0.0.1';
}

/**
 * Response time tracking middleware
 */
export async function responseTimeMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();

  reply.addHook('onSend', async () => {
    const responseTime = Date.now() - startTime;
    reply.header('X-Response-Time', `${responseTime}ms`);
  });
}

/**
 * Security headers middleware
 */
export async function enhancedSecurityHeaders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // DDoS protection headers
  reply.header('X-DDoS-Protection', 'active');
  reply.header('X-Bot-Protection', 'enabled');

  // Rate limiting headers (will be overridden by actual values)
  reply.header('X-RateLimit-Policy', 'adaptive');

  // Security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Feature policy / permissions policy
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Expect-CT header for certificate transparency
  reply.header('Expect-CT', 'max-age=86400, enforce');
}