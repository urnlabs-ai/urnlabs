import { Request, Response, NextFunction } from 'express';
import {
  PolicyEvaluationEngine,
  PolicyEvaluationContext,
  PolicyEvaluationSummary
} from '../services/policy-evaluation-engine';
import { logger } from '../lib/logger';

/**
 * Policy enforcement configuration
 */
export interface PolicyEnforcementConfig {
  enabled: boolean;
  enforceMode: 'strict' | 'permissive' | 'audit_only';
  skipRoutes?: string[];
  skipMethods?: string[];
  requireAuthentication?: boolean;
  fallbackAction?: 'allow' | 'deny';
  timeoutMs?: number;
}

/**
 * Extended Express Request with policy context
 */
export interface PolicyAwareRequest extends Request {
  user?: {
    id: string;
    organizationId: string;
    roles?: string[];
    permissions?: string[];
  };
  policyContext?: PolicyEvaluationContext;
  policyResult?: PolicyEvaluationSummary;
  resourceInfo?: {
    type: string;
    id: string;
    action: string;
  };
}

/**
 * Policy enforcement middleware factory
 *
 * Creates middleware that intercepts requests and evaluates policies
 * before allowing request to proceed to route handlers
 */
export function createPolicyEnforcementMiddleware(
  policyEngine: PolicyEvaluationEngine,
  config: PolicyEnforcementConfig
) {
  return async (req: PolicyAwareRequest, res: Response, next: NextFunction) => {
    // Skip if policy enforcement is disabled
    if (!config.enabled) {
      return next();
    }

    // Skip if route is in skip list
    if (config.skipRoutes?.some(route => req.path.startsWith(route))) {
      return next();
    }

    // Skip if method is in skip list
    if (config.skipMethods?.includes(req.method)) {
      return next();
    }

    try {
      // Check authentication if required
      if (config.requireAuthentication && !req.user) {
        return res.status(401).json({
          error: 'Authentication required for policy evaluation',
          code: 'POLICY_AUTH_REQUIRED'
        });
      }

      // Extract policy evaluation context
      const context = extractPolicyContext(req);
      req.policyContext = context;

      // Extract resource information from request
      const resourceInfo = extractResourceInfo(req);
      req.resourceInfo = resourceInfo;

      // Evaluate policies with timeout
      const evaluationPromise = resourceInfo
        ? policyEngine.evaluateForResource(
            resourceInfo.type,
            resourceInfo.id,
            resourceInfo.action,
            context
          )
        : Promise.resolve({
            finalDecision: 'allow' as const,
            results: [],
            totalEvaluationTime: 0,
            appliedPolicies: 0
          });

      const timeoutMs = config.timeoutMs || 5000;
      const timeoutPromise = new Promise<PolicyEvaluationSummary>((_, reject) => {
        setTimeout(() => reject(new Error('Policy evaluation timeout')), timeoutMs);
      });

      const policyResult = await Promise.race([evaluationPromise, timeoutPromise]);
      req.policyResult = policyResult;

      // Handle policy result based on enforcement mode
      await handlePolicyResult(req, res, next, policyResult, config);

    } catch (error) {
      logger.error('Policy enforcement error', {
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        error: error.message
      });

      // Handle errors based on enforcement mode
      if (config.enforceMode === 'strict') {
        return res.status(500).json({
          error: 'Policy evaluation failed',
          code: 'POLICY_EVALUATION_ERROR',
          message: config.fallbackAction === 'allow'
            ? 'Request allowed due to policy evaluation error'
            : 'Request denied due to policy evaluation error'
        });
      } else {
        // In permissive or audit_only mode, continue with fallback action
        if (config.fallbackAction === 'deny') {
          return res.status(403).json({
            error: 'Access denied by fallback policy',
            code: 'POLICY_FALLBACK_DENY'
          });
        }
        return next();
      }
    }
  };
}

/**
 * Handle policy evaluation result
 */
async function handlePolicyResult(
  req: PolicyAwareRequest,
  res: Response,
  next: NextFunction,
  result: PolicyEvaluationSummary,
  config: PolicyEnforcementConfig
): Promise<void> {
  const { finalDecision, blockedBy, approvalRequired, warnings } = result;

  // Log policy evaluation for audit
  logger.info('Policy evaluation completed', {
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    finalDecision,
    evaluationTime: result.totalEvaluationTime,
    appliedPolicies: result.appliedPolicies,
    blockedBy: blockedBy?.length || 0,
    approvalRequired: approvalRequired?.length || 0,
    warnings: warnings?.length || 0
  });

  // Handle audit-only mode
  if (config.enforceMode === 'audit_only') {
    // Log but don't enforce
    if (finalDecision !== 'allow') {
      logger.warn('Policy violation detected (audit only)', {
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        finalDecision,
        violations: blockedBy?.map(b => ({
          policyId: b.policyId,
          message: b.message,
          severity: b.violationSeverity
        }))
      });
    }
    return next();
  }

  // Handle policy decisions
  switch (finalDecision) {
    case 'allow':
      // Add warnings to response headers if present
      if (warnings && warnings.length > 0) {
        res.setHeader('X-Policy-Warnings', JSON.stringify(
          warnings.map(w => ({
            policyId: w.policyId,
            message: w.message,
            severity: w.violationSeverity
          }))
        ));
      }
      return next();

    case 'deny':
      const blockingPolicies = blockedBy || [];
      const primaryBlocking = blockingPolicies[0];

      return res.status(403).json({
        error: 'Access denied by policy',
        code: 'POLICY_ACCESS_DENIED',
        message: primaryBlocking?.message || 'Request blocked by organizational policy',
        details: {
          blockedBy: blockingPolicies.map(p => ({
            policyId: p.policyId,
            rule: p.ruleMatched,
            message: p.message,
            severity: p.violationSeverity
          })),
          evaluationTime: result.totalEvaluationTime,
          timestamp: new Date().toISOString()
        }
      });

    case 'require_approval':
      const approvalPolicies = approvalRequired || [];
      const allApprovers = new Set<string>();

      // Collect all required approvers
      approvalPolicies.forEach(policy => {
        if (policy.approvers) {
          policy.approvers.forEach(approver => allApprovers.add(approver));
        }
      });

      return res.status(202).json({
        message: 'Request requires approval',
        code: 'POLICY_APPROVAL_REQUIRED',
        approvalDetails: {
          requiredApprovers: Array.from(allApprovers),
          policies: approvalPolicies.map(p => ({
            policyId: p.policyId,
            rule: p.ruleMatched,
            message: p.message,
            approvers: p.approvers
          })),
          submissionId: generateSubmissionId(req),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        }
      });

    default:
      // Fallback for unknown decisions
      logger.error('Unknown policy decision', { finalDecision });
      return res.status(500).json({
        error: 'Unknown policy decision',
        code: 'POLICY_UNKNOWN_DECISION'
      });
  }
}

/**
 * Extract policy evaluation context from request
 */
function extractPolicyContext(req: PolicyAwareRequest): PolicyEvaluationContext {
  const baseContext: PolicyEvaluationContext = {
    userId: req.user?.id || 'anonymous',
    organizationId: req.user?.organizationId || 'default',
    timestamp: new Date(),
    userRoles: req.user?.roles || [],
    userPermissions: req.user?.permissions || [],
    metadata: {}
  };

  // Add request-specific context
  baseContext.metadata = {
    ...baseContext.metadata,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: filterSensitiveHeaders(req.headers),
    userAgent: req.get('User-Agent'),
    ipAddress: getClientIpAddress(req),
    requestId: req.get('X-Request-ID') || generateRequestId()
  };

  // Add request body for POST/PUT/PATCH requests (be careful with sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    baseContext.requestData = sanitizeRequestData(req.body);
  }

  return baseContext;
}

/**
 * Extract resource information from request path and parameters
 */
function extractResourceInfo(req: PolicyAwareRequest): {
  type: string;
  id: string;
  action: string;
} | null {
  const path = req.path;
  const method = req.method;

  // Define resource extraction patterns
  const patterns = [
    // RESTful API patterns
    { pattern: /^\/api\/v\d+\/([^\/]+)\/([^\/]+)(?:\/.*)?$/, typeIndex: 1, idIndex: 2 },
    { pattern: /^\/api\/([^\/]+)\/([^\/]+)(?:\/.*)?$/, typeIndex: 1, idIndex: 2 },
    { pattern: /^\/([^\/]+)\/([^\/]+)(?:\/.*)?$/, typeIndex: 1, idIndex: 2 }
  ];

  for (const { pattern, typeIndex, idIndex } of patterns) {
    const match = path.match(pattern);
    if (match) {
      const type = match[typeIndex];
      const id = match[idIndex];

      // Skip if ID looks like an action rather than a resource ID
      if (['new', 'create', 'edit', 'delete', 'search'].includes(id)) {
        continue;
      }

      const action = mapMethodToAction(method);
      return { type, id, action };
    }
  }

  return null;
}

/**
 * Map HTTP methods to policy actions
 */
function mapMethodToAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'read';
    case 'POST': return 'create';
    case 'PUT': return 'update';
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return method.toLowerCase();
  }
}

/**
 * Filter sensitive headers from logging
 */
function filterSensitiveHeaders(headers: any): Record<string, any> {
  const sensitive = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  const filtered: Record<string, any> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!sensitive.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Get client IP address from request
 */
function getClientIpAddress(req: Request): string {
  return (
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection as any)?.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Sanitize request data to remove sensitive information
 */
function sanitizeRequestData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitive = [
    'password', 'token', 'secret', 'key', 'auth', 'authorization',
    'credit_card', 'ssn', 'social_security', 'passport'
  ];

  const sanitized = { ...data };

  function sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return sanitizeObject(sanitized);
}

/**
 * Generate unique submission ID for approval requests
 */
function generateSubmissionId(req: PolicyAwareRequest): string {
  const timestamp = Date.now();
  const userId = req.user?.id || 'anonymous';
  const path = req.path;
  const hash = require('crypto')
    .createHash('md5')
    .update(`${timestamp}-${userId}-${path}`)
    .digest('hex')
    .slice(0, 8);

  return `sub_${timestamp}_${hash}`;
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return require('crypto').randomUUID();
}

/**
 * Middleware to add policy context to response headers (for debugging)
 */
export function addPolicyDebugHeaders() {
  return (req: PolicyAwareRequest, res: Response, next: NextFunction) => {
    if (req.policyResult && process.env.NODE_ENV !== 'production') {
      res.setHeader('X-Policy-Decision', req.policyResult.finalDecision);
      res.setHeader('X-Policy-Evaluation-Time', req.policyResult.totalEvaluationTime);
      res.setHeader('X-Policy-Applied-Count', req.policyResult.appliedPolicies);

      if (req.policyResult.blockedBy) {
        res.setHeader('X-Policy-Blocked-By', req.policyResult.blockedBy.length);
      }

      if (req.policyResult.approvalRequired) {
        res.setHeader('X-Policy-Approval-Required', req.policyResult.approvalRequired.length);
      }
    }

    next();
  };
}

/**
 * Middleware to bypass policy enforcement for specific requests
 */
export function bypassPolicyEnforcement() {
  return (req: PolicyAwareRequest, res: Response, next: NextFunction) => {
    req.policyBypass = true;
    next();
  };
}

/**
 * Create policy enforcement middleware with default configuration
 */
export function createDefaultPolicyEnforcement(policyEngine: PolicyEvaluationEngine) {
  const config: PolicyEnforcementConfig = {
    enabled: process.env.POLICY_ENFORCEMENT_ENABLED !== 'false',
    enforceMode: (process.env.POLICY_ENFORCE_MODE as any) || 'strict',
    skipRoutes: ['/health', '/metrics', '/docs', '/swagger'],
    skipMethods: ['OPTIONS'],
    requireAuthentication: true,
    fallbackAction: 'deny',
    timeoutMs: 5000
  };

  return createPolicyEnforcementMiddleware(policyEngine, config);
}

// Type augmentation for the bypass flag
declare global {
  namespace Express {
    interface Request {
      policyBypass?: boolean;
    }
  }
}