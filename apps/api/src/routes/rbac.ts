import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthorizationService } from '@/services/authorization-service.js';
import { RoleManagementService } from '@/services/role-management-service.js';
import {
  RoleSchema,
  UserRoleAssignmentSchema,
  BulkRoleAssignmentSchema,
  BulkPermissionGrantSchema,
  PermissionCheckRequestSchema,
  SYSTEM_ROLES,
} from '@/lib/schemas/rbac.js';
import {
  initAuthorizationService,
  requireEnhancedPermission,
  requireAdminRole,
  requireBulkPermission,
} from '@/middleware/authorization.js';
import { authMiddleware } from '@/middleware/auth.js';

// Request/Response schemas
const CreateRoleSchema = z.object({
  name: z.string().regex(/^[a-z_]+$/, 'Role name must be snake_case'),
  displayName: z.string().min(1).max(255),
  description: z.string().optional(),
  scope: z.enum(['global', 'organization', 'resource']),
  permissions: z.array(z.string()).min(1),
  conditions: z.object({
    requires_approval: z.boolean().optional(),
    scope: z.enum(['global', 'organization', 'own_policies', 'assigned_resources']).optional(),
    time_restrictions: z.object({
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      days_of_week: z.array(z.number().min(0).max(6)).optional(),
    }).optional(),
  }).optional(),
});

const AssignRoleSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  expiresAt: z.string().datetime().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  justification: z.string().min(10),
});

const PolicyRoleBindingSchema = z.object({
  roleId: z.string(),
  policyIds: z.array(z.string()).min(1),
  scope: z.enum(['read', 'manage', 'admin']),
  permissions: z.array(z.string()).optional(),
  conditions: z.object({}).optional(),
});

const RoleDelegationSchema = z.object({
  toUserId: z.string(),
  roleId: z.string(),
  permissions: z.array(z.string()).min(1),
  expiresAt: z.string().datetime(),
  justification: z.string().min(10),
  conditions: z.object({}).optional(),
});

const PermissionCheckSchema = z.object({
  permission: z.string(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  policyId: z.string().optional(),
});

export default async function rbacRoutes(fastify: FastifyInstance) {
  // Apply authentication and authorization initialization to all routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', initAuthorizationService());

  /**
   * Get system role definitions
   */
  fastify.get('/system-roles', {
    preHandler: [
      requireEnhancedPermission('administration:read:role'),
    ],
    schema: {
      description: 'Get available system role definitions',
      tags: ['rbac'],
      response: {
        200: {
          type: 'object',
          properties: {
            roles: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  displayName: { type: 'string' },
                  description: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return { roles: SYSTEM_ROLES };
  });

  /**
   * Initialize system roles for organization
   */
  fastify.post('/system-roles/initialize', {
    preHandler: [
      requireAdminRole('policy_administrator'),
    ],
    schema: {
      description: 'Initialize system roles for the organization',
      tags: ['rbac'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            initialized: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const roleService = new RoleManagementService(fastify.prisma);
    const organizationId = request.jwtUser!.organizationId;

    if (!organizationId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Organization context required',
      });
    }

    await roleService.initializeSystemRoles(organizationId);

    return {
      message: 'System roles initialized successfully',
      initialized: Object.keys(SYSTEM_ROLES).length,
    };
  });

  /**
   * Create custom role
   */
  fastify.post('/roles', {
    preHandler: [
      requireEnhancedPermission('administration:create:role', {
        requireApproval: true,
      }),
    ],
    schema: {
      description: 'Create a custom role with fine-grained permissions',
      tags: ['rbac'],
      body: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-z_]+$',
            description: 'Role name must be snake_case'
          },
          displayName: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string' },
          scope: { type: 'string', enum: ['global', 'organization', 'resource'] },
          permissions: { type: 'array', items: { type: 'string' }, minItems: 1 },
          conditions: {
            type: 'object',
            properties: {
              requires_approval: { type: 'boolean' },
              scope: { type: 'string', enum: ['global', 'organization', 'own_policies', 'assigned_resources'] },
              time_restrictions: {
                type: 'object',
                properties: {
                  start_time: { type: 'string' },
                  end_time: { type: 'string' },
                  days_of_week: { type: 'array', items: { type: 'number', minimum: 0, maximum: 6 } }
                }
              }
            }
          }
        },
        required: ['name', 'displayName', 'scope', 'permissions'],
        additionalProperties: false
      },
      response: {
        201: {
          type: 'object',
          properties: {
            role: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as z.infer<typeof CreateRoleSchema>;
    const roleService = new RoleManagementService(fastify.prisma);

    const role = await roleService.createRole(
      {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        scope: body.scope,
        organizationId: request.jwtUser!.organizationId,
        isSystemRole: false,
        isActive: true,
        createdBy: request.jwtUser!.userId,
      },
      body.permissions,
      request.jwtUser!.userId
    );

    return reply.status(201).send({
      role,
      message: 'Role created successfully',
    });
  });

  /**
   * Get organization roles
   */
  fastify.get('/roles', {
    preHandler: [
      requireEnhancedPermission('administration:read:role'),
    ],
    schema: {
      description: 'Get roles for the organization',
      tags: ['rbac'],
      querystring: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['global', 'organization', 'resource'] },
          isSystemRole: { type: 'boolean' },
          isActive: { type: 'boolean' },
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            roles: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                pages: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: request.jwtUser!.organizationId,
      ...(query.scope && { scope: query.scope }),
      ...(query.isSystemRole !== undefined && { isSystemRole: query.isSystemRole }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };

    const [roles, total] = await Promise.all([
      fastify.prisma.role.findMany({
        where,
        include: {
          permissions: true,
          _count: {
            select: { userRoles: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      fastify.prisma.role.count({ where }),
    ]);

    return {
      roles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  });

  /**
   * Get specific role details
   */
  fastify.get('/roles/:roleId', {
    preHandler: [
      requireEnhancedPermission('administration:read:role'),
    ],
    schema: {
      description: 'Get detailed role information',
      tags: ['rbac'],
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            role: { type: 'object' },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  permission: { type: 'string' },
                  resourceType: { type: 'string' },
                  conditions: { type: 'object' },
                },
              },
            },
            assignments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  userName: { type: 'string' },
                  assignedAt: { type: 'string' },
                  expiresAt: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { roleId } = request.params as { roleId: string };

    const role = await fastify.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: true,
        userRoles: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          where: { isActive: true },
        },
      },
    });

    if (!role) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Role not found',
      });
    }

    // Check organization access
    if (role.organizationId !== request.jwtUser!.organizationId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access denied to this role',
      });
    }

    const assignments = role.userRoles.map(ur => ({
      userId: ur.user.id,
      userName: `${ur.user.firstName} ${ur.user.lastName}`,
      assignedAt: ur.assignedAt.toISOString(),
      expiresAt: ur.expiresAt?.toISOString(),
      isActive: ur.isActive,
    }));

    return {
      role,
      permissions: role.permissions,
      assignments,
    };
  });

  /**
   * Assign role to user
   */
  fastify.post('/roles/:roleId/assign', {
    preHandler: [
      requireEnhancedPermission('administration:assign:role', {
        resourceType: 'role',
        resourceIdParam: 'roleId',
        requireApproval: true,
      }),
    ],
    schema: {
      description: 'Assign role to user',
      tags: ['rbac'],
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          roleId: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          justification: { type: 'string', minLength: 10 }
        },
        required: ['userId', 'roleId', 'justification'],
        additionalProperties: false
      },
      response: {
        201: {
          type: 'object',
          properties: {
            assignment: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { roleId } = request.params as { roleId: string };
    const body = request.body as z.infer<typeof AssignRoleSchema>;
    const roleService = new RoleManagementService(fastify.prisma);

    const assignment = await roleService.assignRoleToUser({
      userId: body.userId,
      roleId,
      assignedBy: request.jwtUser!.userId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
    });

    return reply.status(201).send({
      assignment,
      message: 'Role assigned successfully',
    });
  });

  /**
   * Bulk role assignments
   */
  fastify.post('/roles/bulk-assign', {
    preHandler: [
      requireBulkPermission('administration:assign:role', {
        maxBulkSize: 50,
        requireApproval: true,
      }),
    ],
    schema: {
      description: 'Bulk assign roles to users',
      tags: ['rbac'],
      body: {
        type: 'object',
        properties: {
          assignments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                roleId: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
                resourceType: { type: 'string' },
                resourceId: { type: 'string' },
                justification: { type: 'string', minLength: 10 }
              },
              required: ['userId', 'roleId', 'justification']
            },
            minItems: 1,
            maxItems: 50
          }
        },
        required: ['assignments'],
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            successful: { type: 'number' },
            failed: { type: 'number' },
            requiresApproval: { type: 'boolean' },
            results: {
              type: 'object',
              properties: {
                successful: { type: 'array', items: { type: 'object' } },
                failed: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      assignment: { type: 'object' },
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as z.infer<typeof BulkRoleAssignmentSchema>;
    const roleService = new RoleManagementService(fastify.prisma);

    const results = await roleService.bulkAssignRoles(body);

    return {
      successful: results.successful.length,
      failed: results.failed.length,
      requiresApproval: results.requiresApproval,
      results,
    };
  });

  /**
   * Create policy role binding
   */
  fastify.post('/policies/role-bindings', {
    preHandler: [
      requireEnhancedPermission('policy_management:assign:policy', {
        requireApproval: true,
      }),
    ],
    schema: {
      description: 'Create policy-specific role binding',
      tags: ['rbac'],
      body: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
          policyIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          scope: { type: 'string', enum: ['read', 'manage', 'admin'] },
          permissions: { type: 'array', items: { type: 'string' } },
          conditions: { type: 'object' }
        },
        required: ['roleId', 'policyIds', 'scope'],
        additionalProperties: false
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            binding: {
              type: 'object',
              properties: {
                roleId: { type: 'string' },
                policyCount: { type: 'number' },
                scope: { type: 'string' },
                permissions: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as z.infer<typeof PolicyRoleBindingSchema>;
    const roleService = new RoleManagementService(fastify.prisma);

    await roleService.createPolicyRoleBinding(body, request.jwtUser!.userId);

    return reply.status(201).send({
      message: 'Policy role binding created successfully',
      binding: {
        roleId: body.roleId,
        policyCount: body.policyIds.length,
        scope: body.scope,
        permissions: body.permissions || [],
      },
    });
  });

  /**
   * Create role delegation
   */
  fastify.post('/roles/:roleId/delegate', {
    preHandler: [
      requireEnhancedPermission('administration:delegate:role', {
        resourceType: 'role',
        resourceIdParam: 'roleId',
      }),
    ],
    schema: {
      description: 'Delegate role permissions temporarily',
      tags: ['rbac'],
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      body: {
        type: 'object',
        properties: {
          toUserId: { type: 'string' },
          roleId: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' }, minItems: 1 },
          expiresAt: { type: 'string', format: 'date-time' },
          justification: { type: 'string', minLength: 10 },
          conditions: { type: 'object' }
        },
        required: ['toUserId', 'roleId', 'permissions', 'expiresAt', 'justification'],
        additionalProperties: false
      },
      response: {
        201: {
          type: 'object',
          properties: {
            delegation: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                fromUserId: { type: 'string' },
                toUserId: { type: 'string' },
                roleId: { type: 'string' },
                delegatedPermissions: { type: 'array', items: { type: 'string' } },
                expiresAt: { type: 'string' },
                isActive: { type: 'boolean' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { roleId } = request.params as { roleId: string };
    const body = request.body as z.infer<typeof RoleDelegationSchema>;
    const roleService = new RoleManagementService(fastify.prisma);

    const delegation = await roleService.createRoleDelegation(
      request.jwtUser!.userId,
      body.toUserId,
      roleId,
      body.permissions,
      new Date(body.expiresAt),
      body.conditions
    );

    return reply.status(201).send({
      delegation,
      message: 'Role delegation created successfully',
    });
  });

  /**
   * Check user permissions
   */
  fastify.post('/permissions/check', {
    preHandler: [
      requireEnhancedPermission('administration:read:role'),
    ],
    schema: {
      description: 'Check user permissions for specific actions',
      tags: ['rbac'],
      body: {
        type: 'object',
        properties: {
          permission: { type: 'string' },
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          policyId: { type: 'string' }
        },
        required: ['permission'],
        additionalProperties: false
      },
      response: {
        200: {
          type: 'object',
          properties: {
            allowed: { type: 'boolean' },
            reason: { type: 'string' },
            source: { type: 'string' },
            requiresApproval: { type: 'boolean' },
            riskLevel: { type: 'string' },
            conditions: { type: 'object' },
            metadata: {
              type: 'object',
              properties: {
                checkTimestamp: { type: 'string' },
                evaluationTimeMs: { type: 'number' },
                rulesEvaluated: { type: 'number' },
                cacheHit: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as z.infer<typeof PermissionCheckSchema>;

    const permissionRequest = {
      userId: request.jwtUser!.userId,
      permission: body.permission,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      context: {
        organizationId: request.jwtUser!.organizationId,
        sessionId: request.authContext!.sessionId,
        ipAddress: request.authContext!.ipAddress,
        userAgent: request.authContext!.userAgent,
        timestamp: request.authContext!.timestamp,
      },
    };

    const policyContext = body.policyId ? { policyId: body.policyId } : undefined;

    const result = await request.authorizationService!.checkPermission(
      permissionRequest,
      policyContext
    );

    return result;
  });

  /**
   * Get user authorization profile
   */
  fastify.get('/users/:userId/authorization', {
    preHandler: [
      requireEnhancedPermission('administration:read:role'),
    ],
    schema: {
      description: 'Get complete user authorization profile',
      tags: ['rbac'],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            profile: {
              type: 'object',
              properties: {
                directPermissions: { type: 'array', items: { type: 'string' } },
                roleBasedPermissions: { type: 'array', items: { type: 'string' } },
                delegatedPermissions: { type: 'array', items: { type: 'string' } },
                temporaryPermissions: { type: 'array', items: { type: 'string' } },
                roles: { type: 'array', items: { type: 'object' } },
                summary: {
                  type: 'object',
                  properties: {
                    totalPermissions: { type: 'number' },
                    highRiskPermissions: { type: 'array', items: { type: 'string' } },
                    expiringPermissions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          permission: { type: 'string' },
                          expiresAt: { type: 'string' },
                        },
                      },
                    },
                    roleCount: { type: 'number' },
                    lastUpdated: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const roleService = new RoleManagementService(fastify.prisma);

    // Check if requesting own profile or has admin permissions
    if (userId !== request.jwtUser!.userId) {
      const adminCheck = await request.authorizationService!.checkPermission({
        userId: request.jwtUser!.userId,
        permission: 'administration:read:role',
        context: {
          organizationId: request.jwtUser!.organizationId,
          sessionId: request.authContext!.sessionId,
          ipAddress: request.authContext!.ipAddress,
          userAgent: request.authContext!.userAgent,
          timestamp: request.authContext!.timestamp,
        },
      });

      if (!adminCheck.allowed) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Cannot view other user authorization profiles',
        });
      }
    }

    const profile = await roleService.getUserAuthorizationProfile(
      userId,
      request.jwtUser!.organizationId
    );

    return { profile };
  });

  /**
   * Update role
   */
  fastify.put('/roles/:roleId', {
    preHandler: [
      requireEnhancedPermission('administration:update:role', {
        resourceType: 'role',
        resourceIdParam: 'roleId',
        requireApproval: true,
      }),
    ],
    schema: {
      description: 'Update role information and permissions',
      tags: ['rbac'],
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' }, minItems: 1 },
          isActive: { type: 'boolean' },
          conditions: { type: 'object' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            role: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { roleId } = request.params as { roleId: string };
    const body = request.body as any;
    const roleService = new RoleManagementService(fastify.prisma);

    // Check if role exists and user has access
    const existingRole = await fastify.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!existingRole) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Role not found',
      });
    }

    if (existingRole.organizationId !== request.jwtUser!.organizationId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access denied to this role',
      });
    }

    // System roles cannot be modified
    if (existingRole.isSystemRole) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'System roles cannot be modified',
      });
    }

    const updatedRole = await roleService.updateRole(
      roleId,
      body,
      request.jwtUser!.userId
    );

    return {
      role: updatedRole,
      message: 'Role updated successfully',
    };
  });

  /**
   * Delete role
   */
  fastify.delete('/roles/:roleId', {
    preHandler: [
      requireEnhancedPermission('administration:delete:role', {
        resourceType: 'role',
        resourceIdParam: 'roleId',
        requireApproval: true,
      }),
    ],
    schema: {
      description: 'Delete a role (soft delete)',
      tags: ['rbac'],
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            deleted: { type: 'boolean' },
            affectedUsers: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { roleId } = request.params as { roleId: string };

    // Check if role exists and user has access
    const role = await fastify.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        userRoles: { where: { isActive: true } },
      },
    });

    if (!role) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Role not found',
      });
    }

    if (role.organizationId !== request.jwtUser!.organizationId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access denied to this role',
      });
    }

    // System roles cannot be deleted
    if (role.isSystemRole) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'System roles cannot be deleted',
      });
    }

    // Soft delete role and deactivate all assignments
    await fastify.prisma.$transaction([
      fastify.prisma.role.update({
        where: { id: roleId },
        data: { isActive: false },
      }),
      fastify.prisma.userRole.updateMany({
        where: { roleId, isActive: true },
        data: { isActive: false },
      }),
    ]);

    return {
      message: 'Role deleted successfully',
      deleted: true,
      affectedUsers: role.userRoles.length,
    };
  });

  /**
   * Invalidate permission caches
   */
  fastify.post('/cache/invalidate', {
    preHandler: [
      requireEnhancedPermission('administration:manage:system'),
    ],
    schema: {
      description: 'Invalidate permission caches for users, roles, or organization',
      tags: ['rbac'],
      body: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['user', 'organization', 'role', 'all']
          },
          userId: { type: 'string' },
          roleId: { type: 'string' },
          organizationId: { type: 'string' },
        },
        required: ['type'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            invalidated: { type: 'boolean' },
            cacheType: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      type: 'user' | 'organization' | 'role' | 'all';
      userId?: string;
      roleId?: string;
      organizationId?: string;
    };

    const { PermissionCacheManager } = await import('@/lib/redis.js');

    try {
      switch (body.type) {
        case 'user':
          if (!body.userId) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: 'userId required for user cache invalidation',
            });
          }
          await PermissionCacheManager.invalidateUserCache(body.userId);
          break;

        case 'organization':
          const orgId = body.organizationId || request.jwtUser!.organizationId;
          if (!orgId) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: 'organizationId required for organization cache invalidation',
            });
          }
          await PermissionCacheManager.invalidateOrganizationCache(orgId);
          break;

        case 'role':
          if (!body.roleId) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: 'roleId required for role cache invalidation',
            });
          }
          await PermissionCacheManager.invalidateRoleCache(body.roleId);
          break;

        case 'all':
          await PermissionCacheManager.invalidateAllCaches();
          break;
      }

      return {
        message: `Cache invalidated successfully for ${body.type}`,
        invalidated: true,
        cacheType: body.type,
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to invalidate cache',
      });
    }
  });

  /**
   * Get cache statistics
   */
  fastify.get('/cache/stats', {
    preHandler: [
      requireEnhancedPermission('administration:read:system'),
    ],
    schema: {
      description: 'Get RBAC cache statistics',
      tags: ['rbac'],
      response: {
        200: {
          type: 'object',
          properties: {
            statistics: {
              type: 'object',
              properties: {
                totalPermissionChecks: { type: 'number' },
                totalUserPermissions: { type: 'number' },
                totalRolePermissions: { type: 'number' },
                memoryUsage: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { PermissionCacheManager } = await import('@/lib/redis.js');
      const statistics = await PermissionCacheManager.getCacheStats();

      return { statistics };
    } catch (error) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve cache statistics',
      });
    }
  });

  /**
   * Revoke role assignment
   */
  fastify.delete('/roles/:roleId/users/:userId', {
    preHandler: [
      requireEnhancedPermission('administration:assign:role', {
        resourceType: 'role',
        resourceIdParam: 'roleId',
      }),
    ],
    schema: {
      description: 'Revoke role assignment from user',
      tags: ['rbac'],
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
          userId: { type: 'string' },
        },
        required: ['roleId', 'userId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            revoked: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { roleId, userId } = request.params as { roleId: string; userId: string };

    const assignment = await fastify.prisma.userRole.findFirst({
      where: {
        userId,
        roleId,
        isActive: true,
      },
    });

    if (!assignment) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Role assignment not found',
      });
    }

    await fastify.prisma.userRole.update({
      where: { id: assignment.id },
      data: { isActive: false },
    });

    return {
      message: 'Role assignment revoked successfully',
      revoked: true,
    };
  });
}