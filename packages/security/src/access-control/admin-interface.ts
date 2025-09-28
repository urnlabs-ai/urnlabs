/**
 * Admin Interface for Access Control Matrix
 * REST API endpoints for managing users, roles, permissions, and policies
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  Role, 
  Permission, 
  User, 
  UserGroup, 
  AccessReview, 
  AccessCertificationCampaign,
  UserProvisioningRequest,
  UserDeprovisioningRequest,
  AccessRequest,
  EmergencyAccess
} from './types';
import { AccessControlMatrix } from './AccessControlMatrix';
import { RBACManager } from './RBACManager';
import { PermissionEngine } from './PermissionEngine';
import { UserManager } from './UserManager';
import { OPAIntegration } from './opa-integration';

export interface AdminInterfaceConfig {
  basePath: string;
  enableSwagger: boolean;
  requireAuth: boolean;
  adminRoles: string[];
}

export class AdminInterface {
  private accessMatrix: AccessControlMatrix;
  private rbacManager: RBACManager;
  private permissionEngine: PermissionEngine;
  private userManager: UserManager;
  private opaIntegration?: OPAIntegration;
  private config: AdminInterfaceConfig;

  constructor(
    accessMatrix: AccessControlMatrix,
    rbacManager: RBACManager,
    permissionEngine: PermissionEngine,
    userManager: UserManager,
    config: AdminInterfaceConfig,
    opaIntegration?: OPAIntegration
  ) {
    this.accessMatrix = accessMatrix;
    this.rbacManager = rbacManager;
    this.permissionEngine = permissionEngine;
    this.userManager = userManager;
    this.opaIntegration = opaIntegration;
    this.config = config;
  }

  /**
   * Register all admin routes with Fastify
   */
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    const prefix = this.config.basePath;

    // Authentication middleware
    if (this.config.requireAuth) {
      fastify.addHook('preHandler', this.authenticationHook.bind(this));
    }

    // User Management Routes
    await fastify.register(async (userRoutes) => {
      userRoutes.post('/users/provision', {
        schema: {
          tags: ['User Management'],
          summary: 'Provision new user',
          body: {
            type: 'object',
            required: ['email', 'firstName', 'lastName', 'requiredRoles', 'requestedBy', 'businessJustification'],
            properties: {
              email: { type: 'string', format: 'email' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              department: { type: 'string' },
              jobTitle: { type: 'string' },
              manager: { type: 'string' },
              startDate: { type: 'string', format: 'date' },
              endDate: { type: 'string', format: 'date' },
              requiredRoles: { type: 'array', items: { type: 'string' } },
              requiredGroups: { type: 'array', items: { type: 'string' } },
              attributes: { type: 'object' },
              requestedBy: { type: 'string' },
              businessJustification: { type: 'string' },
            },
          },
        },
      }, this.provisionUser.bind(this));

      userRoutes.post('/users/:userId/deprovision', {
        schema: {
          tags: ['User Management'],
          summary: 'Deprovision user',
          params: {
            type: 'object',
            properties: { userId: { type: 'string' } },
          },
          body: {
            type: 'object',
            required: ['reason', 'effectiveDate', 'requestedBy'],
            properties: {
              reason: { type: 'string', enum: ['TERMINATION', 'TRANSFER', 'LEAVE', 'SECURITY_INCIDENT'] },
              effectiveDate: { type: 'string', format: 'date' },
              dataRetentionPeriod: { type: 'number' },
              transferAssetsTo: { type: 'string' },
              requestedBy: { type: 'string' },
              securityClearanceRequired: { type: 'boolean' },
            },
          },
        },
      }, this.deprovisionUser.bind(this));

      userRoutes.get('/users/:userId', {
        schema: {
          tags: ['User Management'],
          summary: 'Get user details',
          params: {
            type: 'object',
            properties: { userId: { type: 'string' } },
          },
        },
      }, this.getUser.bind(this));

      userRoutes.put('/users/:userId/attributes', {
        schema: {
          tags: ['User Management'],
          summary: 'Update user attributes',
          params: {
            type: 'object',
            properties: { userId: { type: 'string' } },
          },
          body: {
            type: 'object',
            properties: {
              attributes: { type: 'object' },
              updatedBy: { type: 'string' },
            },
          },
        },
      }, this.updateUserAttributes.bind(this));

      userRoutes.get('/users/:userId/access-report', {
        schema: {
          tags: ['User Management'],
          summary: 'Generate user access report',
          params: {
            type: 'object',
            properties: { userId: { type: 'string' } },
          },
        },
      }, this.generateUserAccessReport.bind(this));
    }, { prefix: `${prefix}/admin` });

    // Role Management Routes
    await fastify.register(async (roleRoutes) => {
      roleRoutes.post('/roles', {
        schema: {
          tags: ['Role Management'],
          summary: 'Create new role',
          body: {
            type: 'object',
            required: ['id', 'name', 'description', 'permissions', 'createdBy'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              permissions: { type: 'array' },
              parentRoles: { type: 'array', items: { type: 'string' } },
              childRoles: { type: 'array', items: { type: 'string' } },
              validFrom: { type: 'string', format: 'date' },
              validTo: { type: 'string', format: 'date' },
              createdBy: { type: 'string' },
            },
          },
        },
      }, this.createRole.bind(this));

      roleRoutes.get('/roles', {
        schema: {
          tags: ['Role Management'],
          summary: 'List all roles',
          querystring: {
            type: 'object',
            properties: {
              isActive: { type: 'boolean' },
              parentRole: { type: 'string' },
            },
          },
        },
      }, this.listRoles.bind(this));

      roleRoutes.get('/roles/:roleId', {
        schema: {
          tags: ['Role Management'],
          summary: 'Get role details',
          params: {
            type: 'object',
            properties: { roleId: { type: 'string' } },
          },
        },
      }, this.getRole.bind(this));

      roleRoutes.put('/roles/:roleId', {
        schema: {
          tags: ['Role Management'],
          summary: 'Update role',
          params: {
            type: 'object',
            properties: { roleId: { type: 'string' } },
          },
          body: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              permissions: { type: 'array' },
              parentRoles: { type: 'array', items: { type: 'string' } },
              childRoles: { type: 'array', items: { type: 'string' } },
              isActive: { type: 'boolean' },
              updatedBy: { type: 'string' },
            },
          },
        },
      }, this.updateRole.bind(this));

      roleRoutes.delete('/roles/:roleId', {
        schema: {
          tags: ['Role Management'],
          summary: 'Delete role',
          params: {
            type: 'object',
            properties: { roleId: { type: 'string' } },
          },
          body: {
            type: 'object',
            properties: {
              deletedBy: { type: 'string' },
            },
          },
        },
      }, this.deleteRole.bind(this));

      roleRoutes.post('/roles/:roleId/assign/:userId', {
        schema: {
          tags: ['Role Management'],
          summary: 'Assign role to user',
          params: {
            type: 'object',
            properties: {
              roleId: { type: 'string' },
              userId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            properties: {
              assignedBy: { type: 'string' },
              validFrom: { type: 'string', format: 'date' },
              validTo: { type: 'string', format: 'date' },
            },
          },
        },
      }, this.assignRole.bind(this));

      roleRoutes.delete('/roles/:roleId/assign/:userId', {
        schema: {
          tags: ['Role Management'],
          summary: 'Remove role from user',
          params: {
            type: 'object',
            properties: {
              roleId: { type: 'string' },
              userId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            properties: {
              removedBy: { type: 'string' },
            },
          },
        },
      }, this.removeRole.bind(this));

      roleRoutes.get('/roles/statistics', {
        schema: {
          tags: ['Role Management'],
          summary: 'Get role statistics',
        },
      }, this.getRoleStatistics.bind(this));
    }, { prefix: `${prefix}/admin` });

    // Access Control Routes
    await fastify.register(async (accessRoutes) => {
      accessRoutes.post('/access/evaluate', {
        schema: {
          tags: ['Access Control'],
          summary: 'Evaluate access request',
          body: {
            type: 'object',
            required: ['userId', 'resource', 'action', 'context'],
            properties: {
              userId: { type: 'string' },
              resource: { type: 'string' },
              action: { type: 'string' },
              context: { type: 'object' },
              sessionId: { type: 'string' },
            },
          },
        },
      }, this.evaluateAccess.bind(this));

      accessRoutes.post('/access/evaluate-bulk', {
        schema: {
          tags: ['Access Control'],
          summary: 'Evaluate multiple access requests',
          body: {
            type: 'object',
            required: ['requests'],
            properties: {
              requests: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['userId', 'resource', 'action', 'context'],
                },
              },
            },
          },
        },
      }, this.evaluateAccessBulk.bind(this));

      accessRoutes.get('/access/matrix/:userId', {
        schema: {
          tags: ['Access Control'],
          summary: 'Get user access matrix',
          params: {
            type: 'object',
            properties: { userId: { type: 'string' } },
          },
          querystring: {
            type: 'object',
            properties: {
              forceRefresh: { type: 'boolean' },
            },
          },
        },
      }, this.getUserAccessMatrix.bind(this));

      accessRoutes.get('/access/cache/stats', {
        schema: {
          tags: ['Access Control'],
          summary: 'Get cache statistics',
        },
      }, this.getCacheStats.bind(this));
    }, { prefix: `${prefix}/admin` });

    // Access Review Routes
    await fastify.register(async (reviewRoutes) => {
      reviewRoutes.post('/reviews/campaigns', {
        schema: {
          tags: ['Access Reviews'],
          summary: 'Start access certification campaign',
          body: {
            type: 'object',
            required: ['name', 'targetUsers', 'reviewers', 'startDate', 'endDate'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              targetUsers: { type: 'array', items: { type: 'string' } },
              reviewers: { type: 'array', items: { type: 'string' } },
              startDate: { type: 'string', format: 'date' },
              endDate: { type: 'string', format: 'date' },
              settings: { type: 'object' },
            },
          },
        },
      }, this.startAccessCampaign.bind(this));

      reviewRoutes.get('/reviews/pending', {
        schema: {
          tags: ['Access Reviews'],
          summary: 'Get pending access reviews',
          querystring: {
            type: 'object',
            properties: {
              reviewerId: { type: 'string' },
            },
          },
        },
      }, this.getPendingReviews.bind(this));

      reviewRoutes.post('/reviews/:reviewId/complete', {
        schema: {
          tags: ['Access Reviews'],
          summary: 'Complete access review',
          params: {
            type: 'object',
            properties: { reviewId: { type: 'string' } },
          },
          body: {
            type: 'object',
            required: ['reviewerId', 'findings', 'recommendations'],
            properties: {
              reviewerId: { type: 'string' },
              findings: { type: 'array' },
              recommendations: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      }, this.completeAccessReview.bind(this));
    }, { prefix: `${prefix}/admin` });

    // Emergency Access Routes
    await fastify.register(async (emergencyRoutes) => {
      emergencyRoutes.post('/emergency/request', {
        schema: {
          tags: ['Emergency Access'],
          summary: 'Request emergency access',
          body: {
            type: 'object',
            required: ['userId', 'requestedBy', 'reason', 'permissions', 'validTo'],
            properties: {
              userId: { type: 'string' },
              requestedBy: { type: 'string' },
              reason: { type: 'string' },
              permissions: { type: 'array' },
              validTo: { type: 'string', format: 'date-time' },
              approvalRequired: { type: 'boolean' },
              breakGlassCode: { type: 'string' },
            },
          },
        },
      }, this.requestEmergencyAccess.bind(this));

      emergencyRoutes.post('/emergency/:accessId/approve', {
        schema: {
          tags: ['Emergency Access'],
          summary: 'Approve emergency access',
          params: {
            type: 'object',
            properties: { accessId: { type: 'string' } },
          },
          body: {
            type: 'object',
            required: ['approvedBy'],
            properties: {
              approvedBy: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      }, this.approveEmergencyAccess.bind(this));

      emergencyRoutes.post('/emergency/:accessId/revoke', {
        schema: {
          tags: ['Emergency Access'],
          summary: 'Revoke emergency access',
          params: {
            type: 'object',
            properties: { accessId: { type: 'string' } },
          },
          body: {
            type: 'object',
            required: ['revokedBy'],
            properties: {
              revokedBy: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      }, this.revokeEmergencyAccess.bind(this));

      emergencyRoutes.get('/emergency/active', {
        schema: {
          tags: ['Emergency Access'],
          summary: 'List active emergency access',
        },
      }, this.listActiveEmergencyAccess.bind(this));
    }, { prefix: `${prefix}/admin` });

    // OPA Integration Routes (if available)
    if (this.opaIntegration) {
      await fastify.register(async (opaRoutes) => {
        opaRoutes.post('/opa/sync', {
          schema: {
            tags: ['OPA Integration'],
            summary: 'Sync ACM data to OPA',
          },
        }, this.syncToOPA.bind(this));

        opaRoutes.get('/opa/validate', {
          schema: {
            tags: ['OPA Integration'],
            summary: 'Validate OPA policies',
          },
        }, this.validateOPAPolicies.bind(this));

        opaRoutes.post('/opa/evaluate', {
          schema: {
            tags: ['OPA Integration'],
            summary: 'Evaluate with OPA integration',
            body: {
              type: 'object',
              required: ['userId', 'resource', 'action', 'context'],
            },
          },
        }, this.evaluateWithOPA.bind(this));
      }, { prefix: `${prefix}/admin` });
    }
  }

  // Route Handlers

  private async authenticationHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Implementation would check JWT token and user roles
    const userRoles = request.user?.roles || [];
    const hasAdminRole = this.config.adminRoles.some(role => userRoles.includes(role));
    
    if (!hasAdminRole) {
      throw new Error('Insufficient permissions for admin interface');
    }
  }

  private async provisionUser(request: FastifyRequest, reply: FastifyReply): Promise<User> {
    const provisioningRequest = request.body as UserProvisioningRequest;
    return this.userManager.provisionUser(provisioningRequest);
  }

  private async deprovisionUser(request: FastifyRequest, reply: FastifyReply): Promise<{ success: boolean }> {
    const { userId } = request.params as { userId: string };
    const deprovisioningRequest = { userId, ...request.body } as UserDeprovisioningRequest;
    
    const success = await this.userManager.deprovisionUser(deprovisioningRequest);
    return { success };
  }

  private async getUser(request: FastifyRequest, reply: FastifyReply): Promise<User | null> {
    const { userId } = request.params as { userId: string };
    return this.userManager.getUserWithRelationships(userId);
  }

  private async updateUserAttributes(request: FastifyRequest, reply: FastifyReply): Promise<User> {
    const { userId } = request.params as { userId: string };
    const { attributes, updatedBy } = request.body as { attributes: Record<string, any>; updatedBy: string };
    
    return this.userManager.updateUserAttributes(userId, attributes, updatedBy);
  }

  private async generateUserAccessReport(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { userId } = request.params as { userId: string };
    return this.userManager.generateUserAccessReport(userId);
  }

  private async createRole(request: FastifyRequest, reply: FastifyReply): Promise<Role> {
    const roleData = request.body as Role;
    return this.rbacManager.createRole(roleData);
  }

  private async listRoles(request: FastifyRequest, reply: FastifyReply): Promise<Role[]> {
    const { isActive, parentRole } = request.query as { isActive?: boolean; parentRole?: string };
    return this.rbacManager.getRoles({ isActive, parentRole });
  }

  private async getRole(request: FastifyRequest, reply: FastifyReply): Promise<Role | null> {
    const { roleId } = request.params as { roleId: string };
    return this.rbacManager.getRole(roleId);
  }

  private async updateRole(request: FastifyRequest, reply: FastifyReply): Promise<Role> {
    const { roleId } = request.params as { roleId: string };
    const { updatedBy, ...updates } = request.body as Partial<Role> & { updatedBy: string };
    
    return this.rbacManager.updateRole(roleId, updates, updatedBy);
  }

  private async deleteRole(request: FastifyRequest, reply: FastifyReply): Promise<{ success: boolean }> {
    const { roleId } = request.params as { roleId: string };
    const { deletedBy } = request.body as { deletedBy: string };
    
    const success = await this.rbacManager.deleteRole(roleId, deletedBy);
    return { success };
  }

  private async assignRole(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { roleId, userId } = request.params as { roleId: string; userId: string };
    const { assignedBy, validFrom, validTo } = request.body as {
      assignedBy: string;
      validFrom?: string;
      validTo?: string;
    };
    
    return this.rbacManager.assignRoleToUser(userId, roleId, assignedBy, {
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validTo: validTo ? new Date(validTo) : undefined,
    });
  }

  private async removeRole(request: FastifyRequest, reply: FastifyReply): Promise<{ success: boolean }> {
    const { roleId, userId } = request.params as { roleId: string; userId: string };
    const { removedBy } = request.body as { removedBy: string };
    
    const success = await this.rbacManager.removeRoleFromUser(userId, roleId, removedBy);
    return { success };
  }

  private async getRoleStatistics(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    return this.rbacManager.getRoleStatistics();
  }

  private async evaluateAccess(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const accessRequest = {
      id: `req-${Date.now()}`,
      timestamp: new Date(),
      ...request.body,
    } as AccessRequest;
    
    return this.accessMatrix.evaluateAccess(accessRequest);
  }

  private async evaluateAccessBulk(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { requests } = request.body as { requests: any[] };
    
    const accessRequests = requests.map(req => ({
      id: `req-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      ...req,
    })) as AccessRequest[];
    
    return this.accessMatrix.evaluateAccessBulk(accessRequests);
  }

  private async getUserAccessMatrix(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { userId } = request.params as { userId: string };
    const { forceRefresh } = request.query as { forceRefresh?: boolean };
    
    return this.accessMatrix.computeAccessMatrix(userId, forceRefresh);
  }

  private async getCacheStats(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    return {
      matrix: this.accessMatrix.getCacheStats(),
      permissions: this.permissionEngine.getCacheStats(),
    };
  }

  private async startAccessCampaign(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const campaignData = {
      id: `campaign-${Date.now()}`,
      status: 'ACTIVE' as const,
      progress: {
        totalUsers: 0,
        reviewedUsers: 0,
        pendingUsers: 0,
        violationsFound: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...request.body,
    } as AccessCertificationCampaign;
    
    return this.userManager.startAccessCertificationCampaign(campaignData);
  }

  private async getPendingReviews(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { reviewerId } = request.query as { reviewerId?: string };
    return this.userManager.getPendingAccessReviews(reviewerId);
  }

  private async completeAccessReview(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { reviewId } = request.params as { reviewId: string };
    const { reviewerId, findings, recommendations } = request.body as {
      reviewerId: string;
      findings: any[];
      recommendations: string[];
    };
    
    return this.userManager.completeAccessReview(reviewId, reviewerId, findings, recommendations);
  }

  private async requestEmergencyAccess(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    // Implementation would create emergency access request
    return { message: 'Emergency access requested' };
  }

  private async approveEmergencyAccess(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    // Implementation would approve emergency access
    return { message: 'Emergency access approved' };
  }

  private async revokeEmergencyAccess(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    // Implementation would revoke emergency access
    return { message: 'Emergency access revoked' };
  }

  private async listActiveEmergencyAccess(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    // Implementation would list active emergency access
    return [];
  }

  private async syncToOPA(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    if (!this.opaIntegration) {
      throw new Error('OPA integration not available');
    }
    
    const roles = await this.rbacManager.getRoles({ isActive: true });
    const permissions: Permission[] = []; // Get all permissions
    
    await this.opaIntegration.syncToOPA(roles, permissions);
    
    return { message: 'Successfully synced to OPA', roles: roles.length, permissions: permissions.length };
  }

  private async validateOPAPolicies(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    if (!this.opaIntegration) {
      throw new Error('OPA integration not available');
    }
    
    const conflicts = await this.opaIntegration.validateOPAPolicies();
    
    return { conflicts, conflictCount: conflicts.length };
  }

  private async evaluateWithOPA(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    if (!this.opaIntegration) {
      throw new Error('OPA integration not available');
    }
    
    const accessRequest = {
      id: `req-opa-${Date.now()}`,
      timestamp: new Date(),
      ...request.body,
    } as AccessRequest;
    
    return this.opaIntegration.evaluateAccessWithOPA(accessRequest);
  }
}