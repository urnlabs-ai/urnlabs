import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import winston from 'winston';
import { WAFEngine, ThreatDetectionResult } from '../services/waf-engine.js';

interface WAFMiddlewareOptions {
  redis: Redis;
  logger: winston.Logger;
  bypassTokens?: string[];
  whitelistIPs?: string[];
  enableDevMode?: boolean;
  customBlockPage?: string;
  challengeMode?: 'captcha' | 'js_challenge' | 'block';
  rateLimitHeaders?: boolean;
  logAllRequests?: boolean;
}

interface WAFRequest extends Request {
  waf?: {
    result: ThreatDetectionResult;
    bypassReason?: string;
    processingTime: number;
  };
}

export class WAFMiddleware {
  private wafEngine: WAFEngine;
  private options: Required<WAFMiddlewareOptions>;
  private whitelistSet: Set<string>;
  private bypassTokenSet: Set<string>;

  constructor(options: WAFMiddlewareOptions) {
    this.wafEngine = new WAFEngine(options.redis, options.logger);
    this.options = {
      ...options,
      bypassTokens: options.bypassTokens || [],
      whitelistIPs: options.whitelistIPs || [],
      enableDevMode: options.enableDevMode || false,
      customBlockPage: options.customBlockPage || this.getDefaultBlockPage(),
      challengeMode: options.challengeMode || 'block',
      rateLimitHeaders: options.rateLimitHeaders !== false,
      logAllRequests: options.logAllRequests !== false
    };

    this.whitelistSet = new Set(this.options.whitelistIPs);
    this.bypassTokenSet = new Set(this.options.bypassTokens);

    this.options.logger.info('WAF Middleware initialized', {
      whitelistIPs: this.options.whitelistIPs.length,
      bypassTokens: this.options.bypassTokens.length,
      devMode: this.options.enableDevMode,
      challengeMode: this.options.challengeMode
    });
  }

  public middleware() {
    return async (req: WAFRequest, res: Response, next: NextFunction): Promise<void> => {
      const startTime = Date.now();
      const clientIP = this.getClientIP(req);

      try {
        // Check for bypass conditions first
        const bypassResult = this.checkBypass(req, clientIP);
        if (bypassResult.bypassed) {
          req.waf = {
            result: {
              blocked: false,
              riskScore: 0,
              threats: [],
              action: 'allow',
              metadata: { bypassed: true, bypassReason: bypassResult.reason }
            },
            bypassReason: bypassResult.reason,
            processingTime: Date.now() - startTime
          };

          if (this.options.logAllRequests) {
            this.options.logger.info('WAF bypassed request', {
              clientIP,
              path: req.path,
              method: req.method,
              bypassReason: bypassResult.reason
            });
          }

          return next();
        }

        // Perform WAF analysis
        const analysisResult = await this.wafEngine.analyzeRequest(req);
        const processingTime = Date.now() - startTime;

        // Add WAF data to request
        req.waf = {
          result: analysisResult,
          processingTime
        };

        // Add security headers
        this.addSecurityHeaders(res, analysisResult);

        // Handle different actions
        switch (analysisResult.action) {
          case 'block':
            await this.handleBlocked(req, res, analysisResult);
            return;

          case 'challenge':
            await this.handleChallenge(req, res, analysisResult);
            return;

          case 'rate_limit':
            await this.handleRateLimit(req, res, analysisResult);
            return;

          case 'allow':
          default:
            // Log if there were threats but action is allow
            if (analysisResult.threats.length > 0) {
              this.options.logger.warn('WAF detected threats but allowing request', {
                clientIP,
                path: req.path,
                method: req.method,
                riskScore: analysisResult.riskScore,
                threatsCount: analysisResult.threats.length,
                threats: analysisResult.threats.map(t => ({ rule: t.rule, category: t.category }))
              });
            }

            return next();
        }

      } catch (error) {
        this.options.logger.error('WAF middleware error', {
          error: error.message,
          stack: error.stack,
          clientIP,
          path: req.path,
          method: req.method
        });

        // In case of WAF failure, decide whether to fail open or closed
        if (this.options.enableDevMode) {
          // Fail open in dev mode
          return next();
        } else {
          // Fail closed in production - temporary rate limit
          res.status(503).json({
            error: 'Service temporarily unavailable',
            code: 'WAF_ERROR',
            timestamp: new Date().toISOString()
          });
          return;
        }
      }
    };
  }

  private checkBypass(req: Request, clientIP: string): { bypassed: boolean; reason?: string } {
    // Check IP whitelist
    if (this.whitelistSet.has(clientIP)) {
      return { bypassed: true, reason: 'IP_WHITELIST' };
    }

    // Check for bypass tokens in headers
    const bypassToken = req.headers['x-waf-bypass'] as string;
    if (bypassToken && this.bypassTokenSet.has(bypassToken)) {
      return { bypassed: true, reason: 'BYPASS_TOKEN' };
    }

    // Check for internal service requests
    const userAgent = req.get('User-Agent') || '';
    if (userAgent.includes('urnlabs-internal') || userAgent.includes('health-check')) {
      return { bypassed: true, reason: 'INTERNAL_SERVICE' };
    }

    // Check for development mode and local IPs
    if (this.options.enableDevMode) {
      const localIPs = ['127.0.0.1', '::1', 'localhost'];
      if (localIPs.includes(clientIP) || clientIP.startsWith('192.168.') || clientIP.startsWith('10.')) {
        return { bypassed: true, reason: 'DEV_MODE_LOCAL' };
      }
    }

    // Check for health check endpoints
    const healthPaths = ['/health', '/status', '/ping', '/ready', '/metrics'];
    if (healthPaths.some(path => req.path.startsWith(path))) {
      return { bypassed: true, reason: 'HEALTH_CHECK' };
    }

    return { bypassed: false };
  }

  private addSecurityHeaders(res: Response, result: ThreatDetectionResult): void {
    // Add custom WAF headers
    res.setHeader('X-WAF-Status', result.blocked ? 'BLOCKED' : 'ALLOWED');
    res.setHeader('X-WAF-Risk-Score', result.riskScore);
    res.setHeader('X-WAF-Threats', result.threats.length);

    if (this.options.rateLimitHeaders && result.metadata.remaining !== undefined) {
      res.setHeader('X-RateLimit-Remaining', result.metadata.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60); // 1 minute window
    }

    // Add standard security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  private async handleBlocked(req: Request, res: Response, result: ThreatDetectionResult): Promise<void> {
    const clientIP = this.getClientIP(req);

    this.options.logger.warn('WAF blocked request', {
      clientIP,
      path: req.path,
      method: req.method,
      riskScore: result.riskScore,
      threats: result.threats,
      userAgent: req.get('User-Agent')
    });

    // Send block response
    res.status(403);

    if (req.accepts('json')) {
      res.json({
        error: 'Access Denied',
        message: 'Your request has been blocked by our security system',
        code: 'WAF_BLOCKED',
        requestId: this.generateRequestId(),
        timestamp: new Date().toISOString()
      });
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.send(this.options.customBlockPage);
    }
  }

  private async handleChallenge(req: Request, res: Response, result: ThreatDetectionResult): Promise<void> {
    const clientIP = this.getClientIP(req);

    this.options.logger.info('WAF challenge issued', {
      clientIP,
      path: req.path,
      method: req.method,
      riskScore: result.riskScore,
      challengeMode: this.options.challengeMode
    });

    switch (this.options.challengeMode) {
      case 'js_challenge':
        res.status(403).json({
          error: 'Security Challenge Required',
          message: 'Please enable JavaScript and try again',
          code: 'WAF_JS_CHALLENGE',
          requestId: this.generateRequestId(),
          timestamp: new Date().toISOString()
        });
        break;

      case 'captcha':
        res.status(403).json({
          error: 'CAPTCHA Required',
          message: 'Please complete the CAPTCHA verification',
          code: 'WAF_CAPTCHA_CHALLENGE',
          requestId: this.generateRequestId(),
          timestamp: new Date().toISOString()
        });
        break;

      case 'block':
      default:
        await this.handleBlocked(req, res, result);
        break;
    }
  }

  private async handleRateLimit(req: Request, res: Response, result: ThreatDetectionResult): Promise<void> {
    const clientIP = this.getClientIP(req);

    this.options.logger.warn('WAF rate limit triggered', {
      clientIP,
      path: req.path,
      method: req.method,
      riskScore: result.riskScore
    });

    // Add rate limit specific headers
    res.setHeader('Retry-After', '60');
    res.setHeader('X-RateLimit-Limit', '100');
    res.setHeader('X-RateLimit-Remaining', '0');

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      code: 'WAF_RATE_LIMITED',
      retryAfter: 60,
      requestId: this.generateRequestId(),
      timestamp: new Date().toISOString()
    });
  }

  private getClientIP(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      '127.0.0.1'
    );
  }

  private generateRequestId(): string {
    return `waf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultBlockPage(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied - Urnlabs Security</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 15px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        .shield {
            font-size: 60px;
            color: #e74c3c;
            margin-bottom: 20px;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 28px;
        }
        p {
            color: #7f8c8d;
            line-height: 1.6;
            margin-bottom: 25px;
        }
        .details {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            font-size: 14px;
            color: #6c757d;
        }
        .contact {
            color: #3498db;
            text-decoration: none;
        }
        .contact:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="shield">🛡️</div>
        <h1>Access Denied</h1>
        <p>Our security system has detected suspicious activity in your request and has blocked access to protect our services.</p>
        <div class="details">
            <strong>What happened?</strong><br>
            Your request triggered one or more security rules designed to protect against malicious activity.
        </div>
        <p>If you believe this is an error, please contact our support team at <a href="mailto:security@urnlabs.ai" class="contact">security@urnlabs.ai</a></p>
        <p><small>Powered by Urnlabs Web Application Firewall</small></p>
    </div>
</body>
</html>`;
  }

  // Management methods
  public updateWhitelist(ips: string[]): void {
    this.whitelistSet = new Set(ips);
    this.options.whitelistIPs = ips;
    this.options.logger.info('WAF whitelist updated', { count: ips.length });
  }

  public updateBypassTokens(tokens: string[]): void {
    this.bypassTokenSet = new Set(tokens);
    this.options.bypassTokens = tokens;
    this.options.logger.info('WAF bypass tokens updated', { count: tokens.length });
  }

  public getStatistics(): Promise<any> {
    return this.wafEngine.getStatistics();
  }

  public getWAFEngine(): WAFEngine {
    return this.wafEngine;
  }
}

// Helper function to create middleware instance
export function createWAFMiddleware(options: WAFMiddlewareOptions): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const wafMiddleware = new WAFMiddleware(options);
  return wafMiddleware.middleware();
}

// Export types for external use
export type { WAFRequest, WAFMiddlewareOptions };