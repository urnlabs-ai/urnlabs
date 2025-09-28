/**
 * Security Headers Middleware
 *
 * Comprehensive security headers implementation for the API Gateway
 * following OWASP recommendations and industry best practices.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger.js';

interface SecurityHeadersConfig {
  enabled: boolean;

  // HSTS Configuration
  hsts: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };

  // Content Security Policy
  csp: {
    enabled: boolean;
    policy: string;
    reportOnly: boolean;
    reportUri?: string;
  };

  // X-Frame-Options
  frameOptions: {
    enabled: boolean;
    value: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    allowFrom?: string;
  };

  // X-Content-Type-Options
  contentTypeOptions: {
    enabled: boolean;
    nosniff: boolean;
  };

  // X-XSS-Protection
  xssProtection: {
    enabled: boolean;
    value: '0' | '1' | '1; mode=block' | '1; report=<reporting-uri>';
    reportUri?: string;
  };

  // Referrer Policy
  referrerPolicy: {
    enabled: boolean;
    policy: string;
  };

  // Feature Policy / Permissions Policy
  permissionsPolicy: {
    enabled: boolean;
    policy: string;
  };

  // Cross-Origin Policies
  crossOrigin: {
    embedderPolicy: {
      enabled: boolean;
      value: 'unsafe-none' | 'require-corp';
    };
    openerPolicy: {
      enabled: boolean;
      value: 'unsafe-none' | 'same-origin-allow-popups' | 'same-origin';
    };
    resourcePolicy: {
      enabled: boolean;
      value: 'same-site' | 'same-origin' | 'cross-origin';
    };
  };

  // Server Information
  serverInfo: {
    hideServer: boolean;
    hidePoweredBy: boolean;
    customServerHeader?: string;
  };

  // CORS Configuration
  cors: {
    enabled: boolean;
    origins: string[];
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };

  // Custom Headers
  customHeaders: Record<string, string>;

  // Environment-specific settings
  environment: 'development' | 'staging' | 'production';
}

interface SecurityValidationResult {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  score: number;
}

/**
 * Security Headers Middleware
 */
export class SecurityHeaders {
  private config: SecurityHeadersConfig;

  constructor(config: SecurityHeadersConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Main security headers middleware
   */
  public middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Apply security headers
        this.applySecurityHeaders(request, reply);

        // Validate request security
        const validation = this.validateRequestSecurity(request);
        if (!validation.isValid && this.config.environment === 'production') {
          this.logSecurityViolations(request, validation);
        }

      } catch (error) {
        logger.error({ error, url: request.url }, 'Security Headers middleware error');
        // Continue processing - security headers are important but shouldn't break requests
      }
    };
  }

  /**
   * Apply all configured security headers
   */
  private applySecurityHeaders(request: FastifyRequest, reply: FastifyReply): void {
    if (!this.config.enabled) {
      return;
    }

    // HTTP Strict Transport Security (HSTS)
    this.applyHSTS(reply);

    // Content Security Policy (CSP)
    this.applyCSP(reply);

    // X-Frame-Options
    this.applyFrameOptions(reply);

    // X-Content-Type-Options
    this.applyContentTypeOptions(reply);

    // X-XSS-Protection
    this.applyXSSProtection(reply);

    // Referrer Policy
    this.applyReferrerPolicy(reply);

    // Permissions Policy
    this.applyPermissionsPolicy(reply);

    // Cross-Origin Policies
    this.applyCrossOriginPolicies(reply);

    // Server Information Headers
    this.applyServerHeaders(reply);

    // CORS Headers
    this.applyCORSHeaders(request, reply);

    // Custom Headers
    this.applyCustomHeaders(reply);

    // Security-related response headers
    this.applyAdditionalSecurityHeaders(reply);
  }

  /**
   * Apply HTTP Strict Transport Security (HSTS)
   */
  private applyHSTS(reply: FastifyReply): void {
    if (!this.config.hsts.enabled) {
      return;
    }

    let hstsValue = `max-age=${this.config.hsts.maxAge}`;

    if (this.config.hsts.includeSubDomains) {
      hstsValue += '; includeSubDomains';
    }

    if (this.config.hsts.preload) {
      hstsValue += '; preload';
    }

    reply.header('Strict-Transport-Security', hstsValue);
  }

  /**
   * Apply Content Security Policy (CSP)
   */
  private applyCSP(reply: FastifyReply): void {
    if (!this.config.csp.enabled) {
      return;
    }

    const headerName = this.config.csp.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    let policy = this.config.csp.policy;

    // Add report-uri if specified
    if (this.config.csp.reportUri) {
      policy += `; report-uri ${this.config.csp.reportUri}`;
    }

    reply.header(headerName, policy);
  }

  /**
   * Apply X-Frame-Options
   */
  private applyFrameOptions(reply: FastifyReply): void {
    if (!this.config.frameOptions.enabled) {
      return;
    }

    let value = this.config.frameOptions.value;

    if (value === 'ALLOW-FROM' && this.config.frameOptions.allowFrom) {
      value += ` ${this.config.frameOptions.allowFrom}`;
    }

    reply.header('X-Frame-Options', value);
  }

  /**
   * Apply X-Content-Type-Options
   */
  private applyContentTypeOptions(reply: FastifyReply): void {
    if (!this.config.contentTypeOptions.enabled) {
      return;
    }

    if (this.config.contentTypeOptions.nosniff) {
      reply.header('X-Content-Type-Options', 'nosniff');
    }
  }

  /**
   * Apply X-XSS-Protection
   */
  private applyXSSProtection(reply: FastifyReply): void {
    if (!this.config.xssProtection.enabled) {
      return;
    }

    let value = this.config.xssProtection.value;

    if (value.includes('report=') && this.config.xssProtection.reportUri) {
      value = value.replace('<reporting-uri>', this.config.xssProtection.reportUri);
    }

    reply.header('X-XSS-Protection', value);
  }

  /**
   * Apply Referrer Policy
   */
  private applyReferrerPolicy(reply: FastifyReply): void {
    if (!this.config.referrerPolicy.enabled) {
      return;
    }

    reply.header('Referrer-Policy', this.config.referrerPolicy.policy);
  }

  /**
   * Apply Permissions Policy (formerly Feature Policy)
   */
  private applyPermissionsPolicy(reply: FastifyReply): void {
    if (!this.config.permissionsPolicy.enabled) {
      return;
    }

    reply.header('Permissions-Policy', this.config.permissionsPolicy.policy);
  }

  /**
   * Apply Cross-Origin Policies
   */
  private applyCrossOriginPolicies(reply: FastifyReply): void {
    const { crossOrigin } = this.config;

    // Cross-Origin-Embedder-Policy
    if (crossOrigin.embedderPolicy.enabled) {
      reply.header('Cross-Origin-Embedder-Policy', crossOrigin.embedderPolicy.value);
    }

    // Cross-Origin-Opener-Policy
    if (crossOrigin.openerPolicy.enabled) {
      reply.header('Cross-Origin-Opener-Policy', crossOrigin.openerPolicy.value);
    }

    // Cross-Origin-Resource-Policy
    if (crossOrigin.resourcePolicy.enabled) {
      reply.header('Cross-Origin-Resource-Policy', crossOrigin.resourcePolicy.value);
    }
  }

  /**
   * Apply server information headers
   */
  private applyServerHeaders(reply: FastifyReply): void {
    const { serverInfo } = this.config;

    if (serverInfo.hideServer) {
      reply.removeHeader('Server');
      if (serverInfo.customServerHeader) {
        reply.header('Server', serverInfo.customServerHeader);
      }
    }

    if (serverInfo.hidePoweredBy) {
      reply.removeHeader('X-Powered-By');
    }
  }

  /**
   * Apply CORS headers
   */
  private applyCORSHeaders(request: FastifyRequest, reply: FastifyReply): void {
    if (!this.config.cors.enabled) {
      return;
    }

    const origin = request.headers.origin as string;
    const { cors } = this.config;

    // Access-Control-Allow-Origin
    if (cors.origins.includes('*')) {
      reply.header('Access-Control-Allow-Origin', '*');
    } else if (origin && cors.origins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
    }

    // Access-Control-Allow-Methods
    if (cors.methods.length > 0) {
      reply.header('Access-Control-Allow-Methods', cors.methods.join(', '));
    }

    // Access-Control-Allow-Headers
    if (cors.allowedHeaders.length > 0) {
      reply.header('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
    }

    // Access-Control-Expose-Headers
    if (cors.exposedHeaders.length > 0) {
      reply.header('Access-Control-Expose-Headers', cors.exposedHeaders.join(', '));
    }

    // Access-Control-Allow-Credentials
    if (cors.credentials) {
      reply.header('Access-Control-Allow-Credentials', 'true');
    }

    // Access-Control-Max-Age
    if (cors.maxAge > 0) {
      reply.header('Access-Control-Max-Age', cors.maxAge.toString());
    }
  }

  /**
   * Apply custom headers
   */
  private applyCustomHeaders(reply: FastifyReply): void {
    Object.entries(this.config.customHeaders).forEach(([name, value]) => {
      reply.header(name, value);
    });
  }

  /**
   * Apply additional security headers
   */
  private applyAdditionalSecurityHeaders(reply: FastifyReply): void {
    // Cache-Control for sensitive endpoints
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');

    // Security timing information
    reply.header('X-Content-Security-Policy', 'default-src \'self\'');

    // DNS Prefetch Control
    reply.header('X-DNS-Prefetch-Control', 'off');

    // Download Options
    reply.header('X-Download-Options', 'noopen');

    // Permitted Cross-Domain Policies
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');
  }

  /**
   * Validate request security
   */
  private validateRequestSecurity(request: FastifyRequest): SecurityValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let score = 100;

    // Check for required headers
    const requiredHeaders = ['user-agent', 'accept'];
    requiredHeaders.forEach(header => {
      if (!request.headers[header]) {
        violations.push(`Missing required header: ${header}`);
        score -= 10;
      }
    });

    // Check for suspicious headers
    const suspiciousPatterns = [
      { header: 'user-agent', patterns: [/curl/i, /wget/i, /python/i, /bot/i] },
      { header: 'accept', patterns: [/\*\/\*/, /text\/html.*q=0/] }
    ];

    suspiciousPatterns.forEach(({ header, patterns }) => {
      const headerValue = request.headers[header] as string;
      if (headerValue) {
        patterns.forEach(pattern => {
          if (pattern.test(headerValue)) {
            warnings.push(`Suspicious ${header}: ${headerValue}`);
            score -= 5;
          }
        });
      }
    });

    // Check protocol security
    if (request.protocol !== 'https' && this.config.environment === 'production') {
      violations.push('Non-HTTPS request in production');
      score -= 20;
    }

    // Check for security bypass attempts
    const bypassHeaders = ['x-forwarded-proto', 'x-real-ip', 'x-forwarded-for'];
    bypassHeaders.forEach(header => {
      if (request.headers[header]) {
        warnings.push(`Potential security bypass header: ${header}`);
        score -= 3;
      }
    });

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
      score: Math.max(score, 0)
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    const errors: string[] = [];

    // Validate CSP
    if (this.config.csp.enabled && !this.config.csp.policy) {
      errors.push('CSP enabled but no policy specified');
    }

    // Validate HSTS
    if (this.config.hsts.enabled && this.config.hsts.maxAge < 31536000) {
      logger.warn('HSTS max-age should be at least 1 year (31536000 seconds)');
    }

    // Validate Frame Options
    if (this.config.frameOptions.value === 'ALLOW-FROM' && !this.config.frameOptions.allowFrom) {
      errors.push('ALLOW-FROM specified but no allowFrom URL provided');
    }

    // Validate CORS
    if (this.config.cors.enabled && this.config.cors.origins.length === 0) {
      errors.push('CORS enabled but no origins specified');
    }

    if (errors.length > 0) {
      throw new Error(`Security Headers configuration errors: ${errors.join(', ')}`);
    }
  }

  /**
   * Log security violations
   */
  private logSecurityViolations(request: FastifyRequest, validation: SecurityValidationResult): void {
    logger.warn({
      ip: request.ip,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      violations: validation.violations,
      warnings: validation.warnings,
      securityScore: validation.score
    }, 'Security validation failed');
  }

  /**
   * Get security headers status
   */
  public getSecurityStatus(): Record<string, boolean> {
    return {
      hstsEnabled: this.config.hsts.enabled,
      cspEnabled: this.config.csp.enabled,
      frameOptionsEnabled: this.config.frameOptions.enabled,
      contentTypeOptionsEnabled: this.config.contentTypeOptions.enabled,
      xssProtectionEnabled: this.config.xssProtection.enabled,
      referrerPolicyEnabled: this.config.referrerPolicy.enabled,
      permissionsPolicyEnabled: this.config.permissionsPolicy.enabled,
      corsEnabled: this.config.cors.enabled
    };
  }

  /**
   * Update configuration at runtime
   */
  public updateConfig(updates: Partial<SecurityHeadersConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
  }
}

/**
 * Factory function to create security headers middleware
 */
export function createSecurityHeadersMiddleware(config: SecurityHeadersConfig) {
  const securityHeaders = new SecurityHeaders(config);
  return securityHeaders.middleware();
}

/**
 * Default security headers configuration
 */
export const DEFAULT_SECURITY_HEADERS_CONFIG: SecurityHeadersConfig = {
  enabled: true,

  hsts: {
    enabled: true,
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },

  csp: {
    enabled: true,
    policy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
    reportOnly: false,
    reportUri: '/api/security/csp-report'
  },

  frameOptions: {
    enabled: true,
    value: 'DENY'
  },

  contentTypeOptions: {
    enabled: true,
    nosniff: true
  },

  xssProtection: {
    enabled: true,
    value: '1; mode=block'
  },

  referrerPolicy: {
    enabled: true,
    policy: 'strict-origin-when-cross-origin'
  },

  permissionsPolicy: {
    enabled: true,
    policy: 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()'
  },

  crossOrigin: {
    embedderPolicy: {
      enabled: true,
      value: 'require-corp'
    },
    openerPolicy: {
      enabled: true,
      value: 'same-origin'
    },
    resourcePolicy: {
      enabled: true,
      value: 'same-origin'
    }
  },

  serverInfo: {
    hideServer: true,
    hidePoweredBy: true,
    customServerHeader: 'Urnlabs-Gateway'
  },

  cors: {
    enabled: true,
    origins: [],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: true,
    maxAge: 86400 // 24 hours
  },

  customHeaders: {
    'X-Security-Framework': 'Urnlabs-Security',
    'X-API-Version': '1.0',
    'X-Request-ID': '{{requestId}}'
  },

  environment: 'production'
};

/**
 * Development-specific configuration
 */
export const DEVELOPMENT_SECURITY_HEADERS_CONFIG: SecurityHeadersConfig = {
  ...DEFAULT_SECURITY_HEADERS_CONFIG,
  environment: 'development',
  hsts: {
    ...DEFAULT_SECURITY_HEADERS_CONFIG.hsts,
    enabled: false // Disable HSTS in development
  },
  csp: {
    ...DEFAULT_SECURITY_HEADERS_CONFIG.csp,
    reportOnly: true // Use report-only mode in development
  },
  cors: {
    ...DEFAULT_SECURITY_HEADERS_CONFIG.cors,
    origins: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']
  }
};