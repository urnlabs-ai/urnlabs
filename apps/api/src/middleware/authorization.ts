import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthorizationService, AuthorizationContext, PolicyContext, ResourceContext } from '@/services/authorization-service.js';
import { logSecurityEvent } from '@/lib/logger.js';
import { PermissionCheckRequest } from '@/lib/schemas/rbac.js';

// Extend FastifyRequest to include authorization service and context
declare module 'fastify' {
  interface FastifyRequest {
    authorizationService?: AuthorizationService;
    authContext?: AuthorizationContext;
  }
}

/**
 * Initialize authorization service and attach to request
 */
export function initAuthorizationService() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.server.prisma) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Database service unavailable',
      });
    }

    request.authorizationService = new AuthorizationService(request.server.prisma);

    // Build authorization context from request
    if (request.jwtUser) {
      request.authContext = {
        userId: request.jwtUser.userId,
        organizationId: request.jwtUser.organizationId,
        sessionId: request.headers['x-session-id'] as string,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
        timestamp: new Date(),
      };
    }
  };
}

/**
 * Enhanced permission middleware with fine-grained control
 */
export function requireEnhancedPermission(
  permission: string,
  options: {
    resourceType?: string;
    resourceIdParam?: string; // Parameter name to extract resource ID from
    policyIdParam?: string; // Parameter name to extract policy ID from
    requireApproval?: boolean;
    bypassCache?: boolean;
  } = {}
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser || !request.authorizationService || !request.authContext) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication and authorization context required',
      });
    }

    try {
      // Extract resource context from request
      const resourceContext: ResourceContext | undefined = options.resourceType ? {
        resourceType: options.resourceType,
        resourceId: options.resourceIdParam ? (request.params as any)[options.resourceIdParam] : undefined,
      } : undefined;

      // Extract policy context if policy operations
      const policyContext: PolicyContext | undefined = options.policyIdParam ? {
        policyId: (request.params as any)[options.policyIdParam],
      } : undefined;

      // Build permission check request
      const permissionRequest: PermissionCheckRequest = {
        userId: request.authContext.userId,
        permission,
        resourceType: options.resourceType,
        resourceId: resourceContext?.resourceId,
        context: {
          organizationId: request.authContext.organizationId,
          sessionId: request.authContext.sessionId,
          ipAddress: request.authContext.ipAddress,
          userAgent: request.authContext.userAgent,
          timestamp: request.authContext.timestamp,
        },
      };

      // Check permission
      const result = await request.authorizationService.checkPermission(
        permissionRequest,
        policyContext,
        resourceContext
      );

      if (!result.allowed) {
        logSecurityEvent('authorization_denied', 'medium', {
          userId: request.authContext.userId,
          permission,
          reason: result.reason,
          resourceType: options.resourceType,
          resourceId: resourceContext?.resourceId,
          url: request.url,
          method: request.method,
        });

        return reply.status(403).send({
          error: 'Forbidden',
          message: result.reason,
          permission,
          requiresApproval: result.requiresApproval,
        });
      }

      // Check if approval is required
      if (options.requireApproval || result.requiresApproval) {
        const approvalHeader = request.headers['x-approval-token'] as string;
        if (!approvalHeader) {
          return reply.status(202).send({
            error: 'Approval Required',
            message: 'This operation requires approval',
            permission,
            riskLevel: result.riskLevel,
            approvalWorkflowEndpoint: `/api/v1/approval/request`,
          });
        }

        // Validate approval token (simplified - in production would have proper approval validation)
        const isApprovalValid = await validateApprovalToken(
          approvalHeader,
          request.authContext.userId,
          permission,
          resourceContext?.resourceId
        );

        if (!isApprovalValid) {
          return reply.status(403).send({
            error: 'Invalid Approval',
            message: 'Approval token is invalid or expired',
          });
        }
      }

      // Log successful authorization for high-risk operations
      if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
        logSecurityEvent('authorization_granted', 'info', {
          userId: request.authContext.userId,
          permission,
          resourceType: options.resourceType,
          resourceId: resourceContext?.resourceId,
          riskLevel: result.riskLevel,
          source: result.source,
          url: request.url,
          method: request.method,
        });
      }

      // Add authorization metadata to request for downstream use
      (request as any).authorizationResult = result;

    } catch (error) {
      logSecurityEvent('authorization_error', 'high', {
        userId: request.authContext.userId,
        permission,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Authorization service error',
      });
    }
  };
}

/**
 * Policy-specific authorization middleware
 */
export function requirePolicyPermission(
  permission: string,
  options: {
    policyIdParam?: string;
    requireOwnership?: boolean;
    requireApproval?: boolean;
  } = {}
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser || !request.authorizationService || !request.authContext) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    try {
      const policyId = options.policyIdParam ? (request.params as any)[options.policyIdParam] : null;

      if (!policyId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Policy ID required',
        });
      }

      // Use policy-aware permission evaluation
      const result = await request.authorizationService.evaluatePermissionForPolicy(
        request.authContext.userId,
        permission,
        policyId,
        request.authContext
      );

      if (!result.allowed) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Access denied to this policy',
          permission,
          policyId,
        });
      }

      // Check ownership requirement
      if (options.requireOwnership && !result.delegated) {
        const policy = await request.server.prisma.policy.findUnique({
          where: { id: policyId },
          select: { ownerId: true, createdBy: true },
        });

        if (policy && policy.ownerId !== request.authContext.userId && policy.createdBy !== request.authContext.userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Policy ownership required',
          });
        }
      }

      // Handle approval workflow
      if (options.requireApproval || result.requiresApproval) {
        const approvalHeader = request.headers['x-approval-token'] as string;
        if (!approvalHeader) {
          // Create approval workflow
          const workflow = await request.authorizationService.createApprovalWorkflow(
            request.authContext.userId,
            permission,
            'policy',
            policyId,
            (request.body as any)?.justification || 'Policy operation approval required',
            request.authContext
          );

          return reply.status(202).send({
            error: 'Approval Required',
            message: 'This policy operation requires approval',
            workflowId: workflow.workflowId,
            requiredApprovers: workflow.requiredApprovers,
            approvalLevel: workflow.approvalLevel,
          });
        }
      }

      // Add policy authorization result to request
      (request as any).policyAuthorizationResult = result;

    } catch (error) {
      logSecurityEvent('policy_authorization_error', 'high', {
        userId: request.authContext.userId,
        permission,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Policy authorization error',
      });
    }
  };
}

/**
 * Bulk operations authorization middleware
 */
export function requireBulkPermission(
  permission: string,
  options: {
    maxBulkSize?: number;
    requireApproval?: boolean;
    resourceType?: string;
  } = {}
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser || !request.authorizationService || !request.authContext) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    try {
      const body = request.body as any;
      const operations = body?.operations || body?.items || [];

      // Check bulk operation limits
      if (options.maxBulkSize && operations.length > options.maxBulkSize) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Bulk operation size exceeds limit of ${options.maxBulkSize}`,
        });
      }

      // Check base permission
      const basePermissionResult = await request.authorizationService.checkPermission({
        userId: request.authContext.userId,
        permission,
        resourceType: options.resourceType,
        context: {
          organizationId: request.authContext.organizationId,
          sessionId: request.authContext.sessionId,
          ipAddress: request.authContext.ipAddress,
          userAgent: request.authContext.userAgent,
          timestamp: request.authContext.timestamp,
        },
      });

      if (!basePermissionResult.allowed) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: basePermissionResult.reason,
          permission,
        });
      }

      // For bulk operations involving multiple resources, check individual permissions
      if (operations.length > 1) {
        const resourceIds = operations.map((op: any) => op.id || op.resourceId).filter(Boolean);

        if (resourceIds.length > 0) {
          const permissions = resourceIds.map(() => permission);
          const permissionResults = await request.authorizationService.checkMultiplePermissions(
            request.authContext.userId,
            permissions,
            request.authContext,
            options.resourceType ? { resourceType: options.resourceType } : undefined
          );

          const deniedOperations = Object.entries(permissionResults)
            .filter(([, result]) => !result.allowed)
            .map(([perm]) => perm);

          if (deniedOperations.length > 0) {
            return reply.status(403).send({
              error: 'Partial Authorization Failure',
              message: 'Some operations are not authorized',
              deniedOperations,
            });
          }
        }
      }

      // Handle approval for bulk operations
      if (options.requireApproval || operations.length > 10) {
        const approvalHeader = request.headers['x-approval-token'] as string;
        if (!approvalHeader) {
          return reply.status(202).send({
            error: 'Approval Required',
            message: 'Bulk operations require approval',
            operationCount: operations.length,
            permission,
          });
        }
      }

      // Log bulk operation
      logSecurityEvent('bulk_operation_authorized', 'info', {
        userId: request.authContext.userId,
        permission,
        operationCount: operations.length,
        resourceType: options.resourceType,
        url: request.url,
        method: request.method,
      });

    } catch (error) {
      logSecurityEvent('bulk_authorization_error', 'high', {
        userId: request.authContext.userId,
        permission,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Bulk authorization error',
      });
    }
  };
}

/**
 * Role-based authorization for administrative operations
 */
export function requireAdminRole(
  minimumRole: 'policy_manager' | 'policy_administrator' | 'compliance_officer' = 'policy_manager'
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser || !request.authorizationService || !request.authContext) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    try {
      // Get user's effective roles
      const userPermissions = await request.authorizationService.getUserEffectivePermissions(
        request.authContext.userId,
        request.authContext.organizationId
      );

      const hasRequiredRole = userPermissions.roles.some(role => {
        switch (minimumRole) {
          case 'policy_administrator':
            return role.name === 'policy_administrator';
          case 'compliance_officer':
            return ['policy_administrator', 'compliance_officer'].includes(role.name);
          case 'policy_manager':
            return ['policy_administrator', 'compliance_officer', 'policy_manager'].includes(role.name);
          default:
            return false;
        }
      });

      if (!hasRequiredRole) {
        logSecurityEvent('admin_role_denied', 'medium', {
          userId: request.authContext.userId,
          requiredRole: minimumRole,
          userRoles: userPermissions.roles.map(r => r.name),
          url: request.url,
          method: request.method,
        });

        return reply.status(403).send({
          error: 'Forbidden',
          message: `Administrative role required: ${minimumRole}`,
          requiredRole: minimumRole,
        });
      }

    } catch (error) {
      logSecurityEvent('admin_role_check_error', 'high', {
        userId: request.authContext.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Role authorization error',
      });
    }
  };
}

/**
 * Context-aware authorization that adapts based on request context
 */
export function requireContextualPermission(
  basePermission: string,
  contextRules: {
    escalateFor?: string[]; // Conditions that require escalated permissions
    requireMfaFor?: string[]; // Conditions that require MFA
    denyFor?: string[]; // Conditions that deny access
  } = {}
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.jwtUser || !request.authorizationService || !request.authContext) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    try {
      // Analyze request context
      const context = {
        isOutsideBusinessHours: isOutsideBusinessHours(),
        isHighRiskIp: await isHighRiskIpAddress(request.authContext.ipAddress),
        isBulkOperation: Array.isArray((request.body as any)?.items) && (request.body as any).items.length > 5,
        isAdminEndpoint: request.url.includes('/admin/'),
        hasComplianceImpact: hasComplianceFrameworkImpact(request),
      };

      // Check deny conditions
      for (const condition of contextRules.denyFor || []) {
        if ((context as any)[condition]) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: `Access denied due to: ${condition}`,
            context: condition,
          });
        }
      }

      // Determine required permission level
      let requiredPermission = basePermission;
      let requiresApproval = false;

      for (const condition of contextRules.escalateFor || []) {
        if ((context as any)[condition]) {
          // Escalate from read to update, update to admin, etc.
          requiredPermission = escalatePermission(basePermission);
          requiresApproval = true;
          break;
        }
      }

      // Check permission
      const result = await request.authorizationService.checkPermission({
        userId: request.authContext.userId,
        permission: requiredPermission,
        context: {
          organizationId: request.authContext.organizationId,
          sessionId: request.authContext.sessionId,
          ipAddress: request.authContext.ipAddress,
          userAgent: request.authContext.userAgent,
          timestamp: request.authContext.timestamp,
        },
      });

      if (!result.allowed) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: result.reason,
          permission: requiredPermission,
          context,
        });
      }

      // Check MFA requirements
      for (const condition of contextRules.requireMfaFor || []) {
        if ((context as any)[condition]) {
          const mfaHeader = request.headers['x-mfa-token'] as string;
          if (!mfaHeader) {
            return reply.status(401).send({
              error: 'MFA Required',
              message: `Multi-factor authentication required due to: ${condition}`,
              context: condition,
            });
          }
        }
      }

      // Add context information to request
      (request as any).authorizationContext = context;

    } catch (error) {
      logSecurityEvent('contextual_authorization_error', 'high', {
        userId: request.authContext.userId,
        permission: basePermission,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Contextual authorization error',
      });
    }
  };
}

// Helper functions

async function validateApprovalToken(
  token: string,
  userId: string,
  permission: string,
  resourceId?: string
): Promise<boolean> {
  // Simplified approval token validation
  // In production, this would validate against an approval workflow system
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const data = JSON.parse(decoded);

    return data.userId === userId &&
           data.permission === permission &&
           (!resourceId || data.resourceId === resourceId) &&
           new Date(data.expiresAt) > new Date();
  } catch {
    return false;
  }
}

function isOutsideBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Weekend or outside 9 AM - 5 PM
  return day === 0 || day === 6 || hour < 9 || hour >= 17;
}

async function isHighRiskIpAddress(ipAddress?: string): Promise<boolean> {
  if (!ipAddress) return false;

  // Simplified high-risk IP detection
  // In production, would integrate with threat intelligence feeds
  const highRiskPatterns = ['10.0.0.', '192.168.', '127.0.0.'];
  return !highRiskPatterns.some(pattern => ipAddress.startsWith(pattern));
}

function hasComplianceFrameworkImpact(request: FastifyRequest): boolean {
  const body = request.body as any;
  const params = request.params as any;

  // Check if request involves compliance-sensitive data
  return !!(
    body?.complianceFrameworks?.length ||
    body?.riskLevel === 'critical' ||
    params?.policyId ||
    request.url.includes('/compliance/')
  );
}

function escalatePermission(basePermission: string): string {
  const escalationMap: Record<string, string> = {
    'policy_management:read:policy': 'policy_management:update:policy',
    'policy_management:update:policy': 'policy_management:manage:policy',
    'compliance:read:compliance_rule': 'compliance:update:compliance_rule',
    'audit:read:audit_log': 'audit:investigate:audit_log',
  };

  return escalationMap[basePermission] || basePermission;
}