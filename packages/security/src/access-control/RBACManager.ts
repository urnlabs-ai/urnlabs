/**
 * Role-Based Access Control Manager
 * Advanced RBAC with dynamic role assignment, inheritance, and temporal controls
 */

import Redis from 'ioredis';
import { 
  Role, 
  Permission, 
  User, 
  UserRole, 
  PermissionInheritance,
  AccessReview,
  TemporalAccess,
  AccessSchedule,
  PolicyConflict,
  ConflictResolution 
} from './types';
import { encryptionService } from '../services/encryption';

export interface RBACConfig {
  maxRoleDepth: number;
  enableTemporalAccess: boolean;
  enableRoleInheritance: boolean;
  enableConflictDetection: boolean;
  roleReviewFrequency: number; // days
}

export class RBACManager {
  private redis: Redis;
  private config: RBACConfig;
  private roleCache: Map<string, Role>;
  private inheritanceCache: Map<string, PermissionInheritance[]>;
  private conflictCache: Map<string, PolicyConflict[]>;

  constructor(redis: Redis, config?: Partial<RBACConfig>) {
    this.redis = redis;
    this.config = {
      maxRoleDepth: 10,
      enableTemporalAccess: true,
      enableRoleInheritance: true,
      enableConflictDetection: true,
      roleReviewFrequency: 90,
      ...config,
    };
    
    this.roleCache = new Map();
    this.inheritanceCache = new Map();
    this.conflictCache = new Map();
    
    this.initializeDefaultRoles();
  }

  /**
   * Initialize default system roles
   */
  private async initializeDefaultRoles(): Promise<void> {
    const defaultRoles: Role[] = [
      {
        id: 'super-admin',
        name: 'Super Administrator',
        description: 'Full system access with all permissions',
        permissions: [{
          id: 'super-admin-all',
          resource: '*',
          action: '*',
          effect: 'ALLOW',
          priority: 1000,
          isActive: true,
          scope: { type: 'GLOBAL' },
        }],
        parentRoles: [],
        childRoles: ['admin', 'security-admin'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Administrative access to most system functions',
        permissions: [
          {
            id: 'admin-users',
            resource: '/api/v1/users/*',
            action: '*',
            effect: 'ALLOW',
            priority: 800,
            isActive: true,
            scope: { type: 'GLOBAL' },
          },
          {
            id: 'admin-workflows',
            resource: '/api/v1/workflows/*',
            action: '*',
            effect: 'ALLOW',
            priority: 800,
            isActive: true,
            scope: { type: 'GLOBAL' },
          },
        ],
        parentRoles: ['super-admin'],
        childRoles: ['manager', 'operator'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'security-admin',
        name: 'Security Administrator',
        description: 'Security-focused administrative access',
        permissions: [
          {
            id: 'security-policies',
            resource: '/api/v1/security/*',
            action: '*',
            effect: 'ALLOW',
            priority: 900,
            isActive: true,
            scope: { type: 'GLOBAL' },
          },
          {
            id: 'security-audit',
            resource: '/api/v1/audit/*',
            action: '*',
            effect: 'ALLOW',
            priority: 900,
            isActive: true,
            scope: { type: 'GLOBAL' },
          },
        ],
        parentRoles: ['super-admin'],
        childRoles: ['security-analyst'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'manager',
        name: 'Manager',
        description: 'Management-level access to assigned resources',
        permissions: [
          {
            id: 'manager-team',
            resource: '/api/v1/teams/*',
            action: 'GET,POST,PUT',
            effect: 'ALLOW',
            priority: 600,
            isActive: true,
            scope: { type: 'ORGANIZATION' },
          },
          {
            id: 'manager-reports',
            resource: '/api/v1/reports/*',
            action: 'GET',
            effect: 'ALLOW',
            priority: 600,
            isActive: true,
            scope: { type: 'ORGANIZATION' },
          },
        ],
        parentRoles: ['admin'],
        childRoles: ['operator'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'operator',
        name: 'Operator',
        description: 'Operational access to execute workflows and view data',
        permissions: [
          {
            id: 'operator-workflows',
            resource: '/api/v1/workflows/*',
            action: 'GET,POST',
            effect: 'ALLOW',
            priority: 400,
            isActive: true,
            scope: { type: 'PROJECT' },
            conditions: [{
              type: 'temporal',
              operator: 'between',
              field: 'time',
              value: ['06:00', '22:00'],
            }],
          },
          {
            id: 'operator-agents',
            resource: '/api/v1/agents/*',
            action: 'GET',
            effect: 'ALLOW',
            priority: 400,
            isActive: true,
            scope: { type: 'PROJECT' },
          },
        ],
        parentRoles: ['manager'],
        childRoles: ['user'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'user',
        name: 'User',
        description: 'Basic user access to assigned resources',
        permissions: [
          {
            id: 'user-profile',
            resource: '/api/v1/users/me',
            action: 'GET,PUT',
            effect: 'ALLOW',
            priority: 200,
            isActive: true,
            scope: { type: 'RESOURCE' },
          },
          {
            id: 'user-workflows',
            resource: '/api/v1/workflows/my/*',
            action: 'GET',
            effect: 'ALLOW',
            priority: 200,
            isActive: true,
            scope: { type: 'RESOURCE' },
          },
        ],
        parentRoles: ['operator'],
        childRoles: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        id: 'security-analyst',
        name: 'Security Analyst',
        description: 'Security monitoring and analysis access',
        permissions: [
          {
            id: 'analyst-monitoring',
            resource: '/api/v1/security/monitoring/*',
            action: 'GET',
            effect: 'ALLOW',
            priority: 500,
            isActive: true,
            scope: { type: 'GLOBAL' },
          },
          {
            id: 'analyst-incidents',
            resource: '/api/v1/security/incidents/*',
            action: 'GET,POST,PUT',
            effect: 'ALLOW',
            priority: 500,
            isActive: true,
            scope: { type: 'GLOBAL' },
          },
        ],
        parentRoles: ['security-admin'],
        childRoles: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
    ];

    // Store default roles
    for (const role of defaultRoles) {
      await this.createRole(role);
    }
  }

  /**
   * Create a new role with validation and conflict detection
   */
  async createRole(role: Role): Promise<Role> {
    // Validate role structure
    this.validateRole(role);
    
    // Check for conflicts
    if (this.config.enableConflictDetection) {
      const conflicts = await this.detectRoleConflicts(role);
      if (conflicts.length > 0) {
        throw new Error(`Role conflicts detected: ${conflicts.map(c => c.description).join(', ')}`);
      }
    }
    
    // Store role in Redis
    await this.redis.hset('rbac:roles', role.id, JSON.stringify(role));
    
    // Cache the role
    this.roleCache.set(role.id, role);
    
    // Update inheritance relationships
    if (this.config.enableRoleInheritance) {
      await this.updateInheritanceChain(role.id);
    }
    
    // Log role creation
    await this.logRoleAction('CREATE', role.id, role.createdBy, 'Role created');
    
    return role;
  }

  /**
   * Update an existing role
   */
  async updateRole(roleId: string, updates: Partial<Role>, updatedBy: string): Promise<Role> {
    const existingRole = await this.getRole(roleId);
    if (!existingRole) {
      throw new Error(`Role ${roleId} not found`);
    }
    
    const updatedRole: Role = {
      ...existingRole,
      ...updates,
      updatedAt: new Date(),
    };
    
    // Validate updated role
    this.validateRole(updatedRole);
    
    // Check for conflicts
    if (this.config.enableConflictDetection) {
      const conflicts = await this.detectRoleConflicts(updatedRole);
      if (conflicts.length > 0) {
        throw new Error(`Role conflicts detected: ${conflicts.map(c => c.description).join(', ')}`);
      }
    }
    
    // Store updated role
    await this.redis.hset('rbac:roles', roleId, JSON.stringify(updatedRole));
    
    // Update cache
    this.roleCache.set(roleId, updatedRole);
    
    // Update inheritance if hierarchy changed
    if (updates.parentRoles || updates.childRoles) {
      await this.updateInheritanceChain(roleId);
    }
    
    // Log role update
    await this.logRoleAction('UPDATE', roleId, updatedBy, `Role updated: ${Object.keys(updates).join(', ')}`);
    
    return updatedRole;
  }

  /**
   * Delete a role (soft delete)
   */
  async deleteRole(roleId: string, deletedBy: string): Promise<boolean> {
    const role = await this.getRole(roleId);
    if (!role) {
      return false;
    }
    
    // Check if role is assigned to any users
    const assignedUsers = await this.getUsersWithRole(roleId);
    if (assignedUsers.length > 0) {
      throw new Error(`Cannot delete role ${roleId}: assigned to ${assignedUsers.length} users`);
    }
    
    // Soft delete by setting isActive to false
    const updatedRole: Role = {
      ...role,
      isActive: false,
      updatedAt: new Date(),
    };
    
    await this.redis.hset('rbac:roles', roleId, JSON.stringify(updatedRole));
    this.roleCache.set(roleId, updatedRole);
    
    // Update inheritance chain
    await this.updateInheritanceChain(roleId);
    
    // Log role deletion
    await this.logRoleAction('DELETE', roleId, deletedBy, 'Role deleted (soft)');
    
    return true;
  }

  /**
   * Get a role by ID
   */
  async getRole(roleId: string): Promise<Role | null> {
    // Check cache first
    const cached = this.roleCache.get(roleId);
    if (cached) {
      return cached;
    }
    
    // Get from Redis
    const roleData = await this.redis.hget('rbac:roles', roleId);
    if (!roleData) {
      return null;
    }
    
    const role = JSON.parse(roleData);
    
    // Cache the role
    this.roleCache.set(roleId, role);
    
    return role;
  }

  /**
   * Get all roles with optional filtering
   */
  async getRoles(filter?: { isActive?: boolean; parentRole?: string }): Promise<Role[]> {
    const allRoleData = await this.redis.hgetall('rbac:roles');
    const roles: Role[] = Object.values(allRoleData).map(data => JSON.parse(data));
    
    let filteredRoles = roles;
    
    if (filter?.isActive !== undefined) {
      filteredRoles = filteredRoles.filter(role => role.isActive === filter.isActive);
    }
    
    if (filter?.parentRole) {
      filteredRoles = filteredRoles.filter(role => 
        role.parentRoles.includes(filter.parentRole!)
      );
    }
    
    return filteredRoles;
  }

  /**
   * Assign role to user with optional temporal constraints
   */
  async assignRoleToUser(
    userId: string, 
    roleId: string, 
    assignedBy: string,
    options?: {
      validFrom?: Date;
      validTo?: Date;
      temporalAccess?: TemporalAccess;
    }
  ): Promise<UserRole> {
    // Validate role exists and is active
    const role = await this.getRole(roleId);
    if (!role || !role.isActive) {
      throw new Error(`Role ${roleId} not found or inactive`);
    }
    
    // Check for circular dependencies
    if (this.config.enableRoleInheritance) {
      const inheritance = await this.getRoleInheritance(roleId);
      const circularCheck = this.checkCircularDependency(roleId, inheritance);
      if (circularCheck) {
        throw new Error(`Circular dependency detected in role hierarchy`);
      }
    }
    
    const userRole: UserRole = {
      roleId,
      assignedAt: new Date(),
      assignedBy,
      validFrom: options?.validFrom,
      validTo: options?.validTo,
      isActive: true,
      source: 'MANUAL',
    };
    
    // Store user role assignment
    await this.redis.hset(`rbac:user-roles:${userId}`, roleId, JSON.stringify(userRole));
    
    // Store temporal access if provided
    if (options?.temporalAccess) {
      await this.redis.hset(
        `rbac:temporal-access:${userId}`,
        roleId,
        JSON.stringify(options.temporalAccess)
      );
    }
    
    // Clear user permission cache
    await this.clearUserPermissionCache(userId);
    
    // Log role assignment
    await this.logRoleAction('ASSIGN', roleId, assignedBy, `Role assigned to user ${userId}`);
    
    return userRole;
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: string, roleId: string, removedBy: string): Promise<boolean> {
    const userRoleData = await this.redis.hget(`rbac:user-roles:${userId}`, roleId);
    if (!userRoleData) {
      return false;
    }
    
    // Remove role assignment
    await this.redis.hdel(`rbac:user-roles:${userId}`, roleId);
    
    // Remove temporal access if exists
    await this.redis.hdel(`rbac:temporal-access:${userId}`, roleId);
    
    // Clear user permission cache
    await this.clearUserPermissionCache(userId);
    
    // Log role removal
    await this.logRoleAction('REMOVE', roleId, removedBy, `Role removed from user ${userId}`);
    
    return true;
  }

  /**
   * Get user roles with inheritance
   */
  async getUserRolesWithInheritance(userId: string): Promise<Role[]> {
    const directRoles = await this.getUserDirectRoles(userId);
    const allRoles: Role[] = [...directRoles];
    
    if (this.config.enableRoleInheritance) {
      // Get inherited roles
      for (const role of directRoles) {
        const inheritedRoles = await this.getInheritedRoles(role.id);
        allRoles.push(...inheritedRoles);
      }
    }
    
    // Remove duplicates and filter active roles
    const uniqueRoles = Array.from(
      new Map(allRoles.map(role => [role.id, role])).values()
    ).filter(role => role.isActive);
    
    return uniqueRoles;
  }

  /**
   * Get user's direct roles (not inherited)
   */
  async getUserDirectRoles(userId: string): Promise<Role[]> {
    const userRoleData = await this.redis.hgetall(`rbac:user-roles:${userId}`);
    const roles: Role[] = [];
    
    for (const [roleId, roleAssignmentData] of Object.entries(userRoleData)) {
      const roleAssignment: UserRole = JSON.parse(roleAssignmentData);
      
      // Check if role assignment is currently valid
      if (!this.isRoleAssignmentValid(roleAssignment)) {
        continue;
      }
      
      const role = await this.getRole(roleId);
      if (role && role.isActive) {
        roles.push(role);
      }
    }
    
    return roles;
  }

  /**
   * Get inherited roles for a given role
   */
  async getInheritedRoles(roleId: string, visited = new Set<string>()): Promise<Role[]> {
    if (visited.has(roleId)) {
      return []; // Prevent infinite recursion
    }
    
    visited.add(roleId);
    
    const role = await this.getRole(roleId);
    if (!role || !role.isActive) {
      return [];
    }
    
    const inheritedRoles: Role[] = [];
    
    // Get parent roles
    for (const parentRoleId of role.parentRoles) {
      const parentRole = await this.getRole(parentRoleId);
      if (parentRole && parentRole.isActive) {
        inheritedRoles.push(parentRole);
        
        // Recursively get inherited roles from parent
        const parentInherited = await this.getInheritedRoles(parentRoleId, visited);
        inheritedRoles.push(...parentInherited);
      }
    }
    
    return inheritedRoles;
  }

  /**
   * Get role inheritance chain
   */
  async getRoleInheritance(roleId: string): Promise<PermissionInheritance[]> {
    const cacheKey = `inheritance:${roleId}`;
    
    // Check cache
    const cached = this.inheritanceCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    const inheritance = await this.computeRoleInheritance(roleId);
    
    // Cache result
    this.inheritanceCache.set(cacheKey, inheritance);
    
    return inheritance;
  }

  /**
   * Compute role inheritance chain
   */
  private async computeRoleInheritance(roleId: string, path: string[] = []): Promise<PermissionInheritance[]> {
    if (path.length > this.config.maxRoleDepth) {
      throw new Error(`Role inheritance depth exceeded for role ${roleId}`);
    }
    
    const role = await this.getRole(roleId);
    if (!role) {
      return [];
    }
    
    const inheritance: PermissionInheritance[] = [];
    
    // Add current role permissions
    inheritance.push({
      fromRole: roleId,
      throughPath: [...path, roleId],
      permissions: role.permissions.map(p => p.id),
      level: path.length,
    });
    
    // Add parent role permissions
    for (const parentRoleId of role.parentRoles) {
      const parentInheritance = await this.computeRoleInheritance(
        parentRoleId,
        [...path, roleId]
      );
      inheritance.push(...parentInheritance);
    }
    
    return inheritance;
  }

  /**
   * Check if role assignment is currently valid
   */
  private isRoleAssignmentValid(roleAssignment: UserRole): boolean {
    const now = new Date();
    
    if (!roleAssignment.isActive) {
      return false;
    }
    
    if (roleAssignment.validFrom && now < roleAssignment.validFrom) {
      return false;
    }
    
    if (roleAssignment.validTo && now > roleAssignment.validTo) {
      return false;
    }
    
    return true;
  }

  /**
   * Validate role structure
   */
  private validateRole(role: Role): void {
    if (!role.id || !role.name) {
      throw new Error('Role must have id and name');
    }
    
    if (!Array.isArray(role.permissions)) {
      throw new Error('Role permissions must be an array');
    }
    
    if (!Array.isArray(role.parentRoles) || !Array.isArray(role.childRoles)) {
      throw new Error('Role parent and child roles must be arrays');
    }
    
    // Validate permissions
    for (const permission of role.permissions) {
      if (!permission.resource || !permission.action) {
        throw new Error('Permission must have resource and action');
      }
      
      if (!['ALLOW', 'DENY'].includes(permission.effect)) {
        throw new Error('Permission effect must be ALLOW or DENY');
      }
    }
  }

  /**
   * Detect role conflicts
   */
  private async detectRoleConflicts(role: Role): Promise<PolicyConflict[]> {
    const conflicts: PolicyConflict[] = [];
    
    // Check for conflicting permissions within the role
    const permissionGroups = new Map<string, Permission[]>();
    
    for (const permission of role.permissions) {
      const key = `${permission.resource}:${permission.action}`;
      if (!permissionGroups.has(key)) {
        permissionGroups.set(key, []);
      }
      permissionGroups.get(key)!.push(permission);
    }
    
    for (const [key, permissions] of permissionGroups) {
      if (permissions.length > 1) {
        const effects = new Set(permissions.map(p => p.effect));
        if (effects.size > 1) {
          conflicts.push({
            id: encryptionService.generateUUID(),
            type: 'PERMISSION_CONFLICT',
            severity: 'HIGH',
            description: `Conflicting permissions for ${key} in role ${role.id}`,
            conflictingPolicies: permissions.map(p => p.id),
            resolution: {
              strategy: 'PRIORITY',
              action: 'Use highest priority permission',
              rationale: 'Priority-based conflict resolution',
            },
            detectedAt: new Date(),
          });
        }
      }
    }
    
    return conflicts;
  }

  /**
   * Check for circular dependencies in role hierarchy
   */
  private checkCircularDependency(roleId: string, inheritance: PermissionInheritance[]): boolean {
    const visited = new Set<string>();
    
    for (const inherit of inheritance) {
      for (const pathRole of inherit.throughPath) {
        if (visited.has(pathRole)) {
          return true; // Circular dependency found
        }
        visited.add(pathRole);
      }
    }
    
    return false;
  }

  /**
   * Update inheritance chain when role hierarchy changes
   */
  private async updateInheritanceChain(roleId: string): Promise<void> {
    // Clear inheritance cache for affected roles
    this.inheritanceCache.clear();
    
    // Recompute inheritance for this role and dependent roles
    const inheritance = await this.computeRoleInheritance(roleId);
    this.inheritanceCache.set(`inheritance:${roleId}`, inheritance);
    
    // Update dependent roles
    const allRoles = await this.getRoles();
    for (const role of allRoles) {
      if (role.parentRoles.includes(roleId) || role.childRoles.includes(roleId)) {
        const roleInheritance = await this.computeRoleInheritance(role.id);
        this.inheritanceCache.set(`inheritance:${role.id}`, roleInheritance);
      }
    }
  }

  /**
   * Get users assigned to a specific role
   */
  private async getUsersWithRole(roleId: string): Promise<string[]> {
    const pattern = 'rbac:user-roles:*';
    const keys = await this.redis.keys(pattern);
    const users: string[] = [];
    
    for (const key of keys) {
      const userId = key.split(':')[2];
      const roleData = await this.redis.hget(key, roleId);
      
      if (roleData) {
        const roleAssignment: UserRole = JSON.parse(roleData);
        if (this.isRoleAssignmentValid(roleAssignment)) {
          users.push(userId);
        }
      }
    }
    
    return users;
  }

  /**
   * Clear user permission cache
   */
  private async clearUserPermissionCache(userId: string): Promise<void> {
    await this.redis.del(`rbac:user-permissions:${userId}`);
  }

  /**
   * Log role-related actions
   */
  private async logRoleAction(
    action: string,
    roleId: string,
    performedBy: string,
    description: string
  ): Promise<void> {
    const logEntry = {
      id: encryptionService.generateUUID(),
      action,
      roleId,
      performedBy,
      description,
      timestamp: new Date(),
    };
    
    await this.redis.lpush('rbac:audit:log', JSON.stringify(logEntry));
    
    // Keep only recent logs (last 10000 entries)
    await this.redis.ltrim('rbac:audit:log', 0, 9999);
  }

  /**
   * Get role assignment history for a user
   */
  async getRoleAssignmentHistory(userId: string): Promise<any[]> {
    const logs = await this.redis.lrange('rbac:audit:log', 0, -1);
    
    return logs
      .map(log => JSON.parse(log))
      .filter(entry => 
        (entry.action === 'ASSIGN' || entry.action === 'REMOVE') &&
        entry.description.includes(userId)
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Create scheduled access review
   */
  async createAccessReview(
    type: 'USER' | 'ROLE' | 'PERMISSION' | 'EMERGENCY',
    targetId: string,
    reviewerId: string,
    scheduledDate: Date
  ): Promise<AccessReview> {
    const review: AccessReview = {
      id: encryptionService.generateUUID(),
      type,
      targetId,
      reviewerId,
      status: 'PENDING',
      scheduledDate,
      findings: [],
      recommendations: [],
      nextReviewDate: new Date(scheduledDate.getTime() + this.config.roleReviewFrequency * 24 * 60 * 60 * 1000),
    };
    
    await this.redis.hset('rbac:access-reviews', review.id, JSON.stringify(review));
    
    return review;
  }

  /**
   * Get pending access reviews
   */
  async getPendingAccessReviews(reviewerId?: string): Promise<AccessReview[]> {
    const allReviews = await this.redis.hgetall('rbac:access-reviews');
    
    return Object.values(allReviews)
      .map(data => JSON.parse(data))
      .filter(review => {
        if (review.status !== 'PENDING') return false;
        if (reviewerId && review.reviewerId !== reviewerId) return false;
        return true;
      });
  }

  /**
   * Get role statistics
   */
  async getRoleStatistics(): Promise<any> {
    const roles = await this.getRoles();
    const activeRoles = roles.filter(r => r.isActive);
    
    const stats = {
      totalRoles: roles.length,
      activeRoles: activeRoles.length,
      inactiveRoles: roles.length - activeRoles.length,
      rolesByType: {
        system: activeRoles.filter(r => r.createdBy === 'system').length,
        custom: activeRoles.filter(r => r.createdBy !== 'system').length,
      },
      averagePermissionsPerRole: activeRoles.reduce((sum, r) => sum + r.permissions.length, 0) / activeRoles.length,
      maxInheritanceDepth: 0,
    };
    
    // Calculate max inheritance depth
    for (const role of activeRoles) {
      const inheritance = await this.getRoleInheritance(role.id);
      const maxDepth = Math.max(...inheritance.map(i => i.level));
      stats.maxInheritanceDepth = Math.max(stats.maxInheritanceDepth, maxDepth);
    }
    
    return stats;
  }

  /**
   * Cleanup expired role assignments
   */
  async cleanupExpiredAssignments(): Promise<number> {
    const pattern = 'rbac:user-roles:*';
    const keys = await this.redis.keys(pattern);
    let cleanedCount = 0;
    
    for (const key of keys) {
      const userRoles = await this.redis.hgetall(key);
      
      for (const [roleId, roleData] of Object.entries(userRoles)) {
        const roleAssignment: UserRole = JSON.parse(roleData);
        
        if (!this.isRoleAssignmentValid(roleAssignment)) {
          await this.redis.hdel(key, roleId);
          cleanedCount++;
        }
      }
    }
    
    return cleanedCount;
  }
}