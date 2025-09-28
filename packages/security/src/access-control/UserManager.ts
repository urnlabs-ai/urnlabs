/**
 * User Management System
 * Comprehensive user lifecycle management with provisioning, deprovisioning, and access review
 */

import Redis from 'ioredis';
import { 
  User, 
  UserRole, 
  UserGroup, 
  UserAttribute,
  AccessReview,
  ReviewFinding,
  EmergencyAccess,
  AccessAudit,
  ComplianceFramework
} from './types';
import { encryptionService } from '../services/encryption';

export interface UserProvisioningRequest {
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  jobTitle?: string;
  manager?: string;
  startDate: Date;
  endDate?: Date;
  requiredRoles: string[];
  requiredGroups: string[];
  attributes?: Record<string, any>;
  requestedBy: string;
  businessJustification: string;
}

export interface UserDeprovisioningRequest {
  userId: string;
  reason: 'TERMINATION' | 'TRANSFER' | 'LEAVE' | 'SECURITY_INCIDENT';
  effectiveDate: Date;
  dataRetentionPeriod?: number; // days
  transferAssetsTo?: string;
  requestedBy: string;
  securityClearanceRequired: boolean;
}

export interface AccessCertificationCampaign {
  id: string;
  name: string;
  description: string;
  targetUsers: string[];
  reviewers: string[];
  startDate: Date;
  endDate: Date;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  progress: {
    totalUsers: number;
    reviewedUsers: number;
    pendingUsers: number;
    violationsFound: number;
  };
  settings: {
    autoApproveNoChanges: boolean;
    escalationEnabled: boolean;
    reminderFrequency: number; // days
    complianceFrameworks: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface UserLifecycleEvent {
  id: string;
  userId: string;
  eventType: 'PROVISIONED' | 'DEPROVISIONED' | 'ROLE_CHANGED' | 'ACCESS_REVIEWED' | 'VIOLATION_DETECTED';
  details: Record<string, any>;
  performedBy: string;
  timestamp: Date;
  relatedObjects: string[];
}

export class UserManager {
  private redis: Redis;
  private userCache: Map<string, User>;
  private groupCache: Map<string, UserGroup>;
  private activeReviews: Map<string, AccessReview>;

  constructor(redis: Redis) {
    this.redis = redis;
    this.userCache = new Map();
    this.groupCache = new Map();
    this.activeReviews = new Map();
    
    this.initializeSystemGroups();
    this.startAutomatedTasks();
  }

  /**
   * Initialize default system groups
   */
  private async initializeSystemGroups(): Promise<void> {
    const systemGroups: UserGroup[] = [
      {
        id: 'administrators',
        name: 'System Administrators',
        description: 'Users with administrative privileges',
        type: 'SECURITY',
        members: [],
        roles: ['admin', 'security-admin'],
        permissions: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'managers',
        name: 'Managers',
        description: 'Team and department managers',
        type: 'ORGANIZATIONAL',
        members: [],
        roles: ['manager'],
        permissions: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'security-team',
        name: 'Security Team',
        description: 'Information security professionals',
        type: 'FUNCTIONAL',
        members: [],
        roles: ['security-admin', 'security-analyst'],
        permissions: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'developers',
        name: 'Development Team',
        description: 'Software developers and engineers',
        type: 'FUNCTIONAL',
        members: [],
        roles: ['operator'],
        permissions: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const group of systemGroups) {
      await this.createUserGroup(group);
    }
  }

  /**
   * Provision a new user with comprehensive setup
   */
  async provisionUser(request: UserProvisioningRequest): Promise<User> {
    // Validate provisioning request
    await this.validateProvisioningRequest(request);
    
    // Create user object
    const user: User = {
      id: encryptionService.generateUUID(),
      email: request.email.toLowerCase(),
      roles: [],
      groups: [],
      attributes: [
        { name: 'firstName', value: request.firstName, type: 'STRING', source: 'USER', updatedAt: new Date() },
        { name: 'lastName', value: request.lastName, type: 'STRING', source: 'USER', updatedAt: new Date() },
        { name: 'department', value: request.department, type: 'STRING', source: 'USER', updatedAt: new Date() },
        { name: 'jobTitle', value: request.jobTitle, type: 'STRING', source: 'USER', updatedAt: new Date() },
        { name: 'manager', value: request.manager, type: 'STRING', source: 'USER', updatedAt: new Date() },
        { name: 'startDate', value: request.startDate.toISOString(), type: 'STRING', source: 'SYSTEM', updatedAt: new Date() },
        { name: 'endDate', value: request.endDate?.toISOString(), type: 'STRING', source: 'SYSTEM', updatedAt: new Date() },
        ...Object.entries(request.attributes || {}).map(([name, value]) => ({
          name,
          value,
          type: this.inferAttributeType(value),
          source: 'USER' as const,
          updatedAt: new Date(),
        })),
      ],
      isActive: true,
      mfaEnabled: false,
      riskScore: 25, // Initial risk score
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Store user
    await this.redis.hset('users', user.id, JSON.stringify(user));
    await this.redis.hset('users:by-email', user.email, user.id);
    
    // Cache user
    this.userCache.set(user.id, user);
    
    // Assign required roles
    for (const roleId of request.requiredRoles) {
      await this.assignRoleToUser(user.id, roleId, request.requestedBy, {
        validFrom: request.startDate,
        validTo: request.endDate,
      });
    }
    
    // Add to required groups
    for (const groupId of request.requiredGroups) {
      await this.addUserToGroup(user.id, groupId, request.requestedBy);
    }
    
    // Log provisioning event
    await this.logLifecycleEvent({
      id: encryptionService.generateUUID(),
      userId: user.id,
      eventType: 'PROVISIONED',
      details: {
        email: user.email,
        roles: request.requiredRoles,
        groups: request.requiredGroups,
        requestedBy: request.requestedBy,
        businessJustification: request.businessJustification,
      },
      performedBy: request.requestedBy,
      timestamp: new Date(),
      relatedObjects: [...request.requiredRoles, ...request.requiredGroups],
    });
    
    // Schedule initial access review
    await this.scheduleAccessReview(user.id, 'USER', request.requestedBy, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days
    
    return user;
  }

  /**
   * Deprovision a user with comprehensive cleanup
   */
  async deprovisionUser(request: UserDeprovisioningRequest): Promise<boolean> {
    const user = await this.getUser(request.userId);
    if (!user) {
      throw new Error(`User ${request.userId} not found`);
    }
    
    // Create deprovisioning audit trail
    const deprovisioningId = encryptionService.generateUUID();
    
    // Disable user account
    const updatedUser: User = {
      ...user,
      isActive: false,
      updatedAt: new Date(),
      attributes: [
        ...user.attributes,
        { name: 'deprovisionedDate', value: request.effectiveDate.toISOString(), type: 'STRING', source: 'SYSTEM', updatedAt: new Date() },
        { name: 'deprovisioningReason', value: request.reason, type: 'STRING', source: 'SYSTEM', updatedAt: new Date() },
        { name: 'deprovisionedBy', value: request.requestedBy, type: 'STRING', source: 'SYSTEM', updatedAt: new Date() },
      ],
    };
    
    await this.redis.hset('users', user.id, JSON.stringify(updatedUser));
    this.userCache.set(user.id, updatedUser);
    
    // Remove from all groups
    for (const group of user.groups) {
      await this.removeUserFromGroup(user.id, group.id, request.requestedBy);
    }
    
    // Deactivate all role assignments
    await this.deactivateAllUserRoles(user.id, request.requestedBy);
    
    // Revoke emergency access
    await this.revokeAllEmergencyAccess(user.id, request.requestedBy);
    
    // Clear user permissions cache
    await this.redis.del(`user-permissions:${user.id}`);
    
    // Schedule data retention cleanup if specified
    if (request.dataRetentionPeriod) {
      await this.scheduleDataCleanup(user.id, request.dataRetentionPeriod);
    }
    
    // Log deprovisioning event
    await this.logLifecycleEvent({
      id: deprovisioningId,
      userId: user.id,
      eventType: 'DEPROVISIONED',
      details: {
        reason: request.reason,
        effectiveDate: request.effectiveDate,
        dataRetentionPeriod: request.dataRetentionPeriod,
        transferAssetsTo: request.transferAssetsTo,
        securityClearanceRequired: request.securityClearanceRequired,
      },
      performedBy: request.requestedBy,
      timestamp: new Date(),
      relatedObjects: [],
    });
    
    return true;
  }

  /**
   * Get user with all relationships loaded
   */
  async getUserWithRelationships(userId: string): Promise<User | null> {
    // Check cache first
    const cached = this.userCache.get(userId);
    if (cached) {
      return cached;
    }
    
    // Get from Redis
    const userData = await this.redis.hget('users', userId);
    if (!userData) {
      return null;
    }
    
    const user: User = JSON.parse(userData);
    
    // Load user roles
    user.roles = await this.getUserRoles(userId);
    
    // Load user groups
    user.groups = await this.getUserGroups(userId);
    
    // Cache the user
    this.userCache.set(userId, user);
    
    return user;
  }

  /**
   * Update user attributes
   */
  async updateUserAttributes(
    userId: string,
    attributes: Record<string, any>,
    updatedBy: string
  ): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Update attributes
    const updatedAttributes = [...user.attributes];
    
    for (const [name, value] of Object.entries(attributes)) {
      const existingIndex = updatedAttributes.findIndex(attr => attr.name === name);
      
      if (existingIndex >= 0) {
        updatedAttributes[existingIndex] = {
          ...updatedAttributes[existingIndex],
          value,
          updatedAt: new Date(),
        };
      } else {
        updatedAttributes.push({
          name,
          value,
          type: this.inferAttributeType(value),
          source: 'USER',
          updatedAt: new Date(),
        });
      }
    }
    
    const updatedUser: User = {
      ...user,
      attributes: updatedAttributes,
      updatedAt: new Date(),
    };
    
    // Store updated user
    await this.redis.hset('users', userId, JSON.stringify(updatedUser));
    this.userCache.set(userId, updatedUser);
    
    // Log attribute update
    await this.logLifecycleEvent({
      id: encryptionService.generateUUID(),
      userId,
      eventType: 'ROLE_CHANGED',
      details: {
        updatedAttributes: Object.keys(attributes),
        updatedBy,
      },
      performedBy: updatedBy,
      timestamp: new Date(),
      relatedObjects: [],
    });
    
    return updatedUser;
  }

  /**
   * Create user group
   */
  async createUserGroup(group: UserGroup): Promise<UserGroup> {
    // Validate group
    if (!group.id || !group.name) {
      throw new Error('Group must have id and name');
    }
    
    // Store group
    await this.redis.hset('user-groups', group.id, JSON.stringify(group));
    
    // Cache group
    this.groupCache.set(group.id, group);
    
    return group;
  }

  /**
   * Add user to group
   */
  async addUserToGroup(userId: string, groupId: string, addedBy: string): Promise<boolean> {
    const user = await this.getUser(userId);
    const group = await this.getUserGroup(groupId);
    
    if (!user || !group) {
      throw new Error('User or group not found');
    }
    
    // Add user to group members
    group.members.push(userId);
    await this.redis.hset('user-groups', groupId, JSON.stringify(group));
    this.groupCache.set(groupId, group);
    
    // Add group to user
    const userGroup = {
      id: groupId,
      name: group.name,
      description: group.description,
      type: group.type,
      members: group.members,
      roles: group.roles,
      permissions: group.permissions,
      isActive: group.isActive,
      createdAt: group.createdAt,
      updatedAt: new Date(),
    };
    
    user.groups.push(userGroup);
    await this.redis.hset('users', userId, JSON.stringify(user));
    this.userCache.set(userId, user);
    
    // Log group membership change
    await this.logLifecycleEvent({
      id: encryptionService.generateUUID(),
      userId,
      eventType: 'ROLE_CHANGED',
      details: {
        action: 'ADDED_TO_GROUP',
        groupId,
        groupName: group.name,
        addedBy,
      },
      performedBy: addedBy,
      timestamp: new Date(),
      relatedObjects: [groupId],
    });
    
    return true;
  }

  /**
   * Remove user from group
   */
  async removeUserFromGroup(userId: string, groupId: string, removedBy: string): Promise<boolean> {
    const user = await this.getUser(userId);
    const group = await this.getUserGroup(groupId);
    
    if (!user || !group) {
      return false;
    }
    
    // Remove user from group members
    group.members = group.members.filter(id => id !== userId);
    await this.redis.hset('user-groups', groupId, JSON.stringify(group));
    this.groupCache.set(groupId, group);
    
    // Remove group from user
    user.groups = user.groups.filter(g => g.id !== groupId);
    await this.redis.hset('users', userId, JSON.stringify(user));
    this.userCache.set(userId, user);
    
    // Log group membership change
    await this.logLifecycleEvent({
      id: encryptionService.generateUUID(),
      userId,
      eventType: 'ROLE_CHANGED',
      details: {
        action: 'REMOVED_FROM_GROUP',
        groupId,
        groupName: group.name,
        removedBy,
      },
      performedBy: removedBy,
      timestamp: new Date(),
      relatedObjects: [groupId],
    });
    
    return true;
  }

  /**
   * Start access certification campaign
   */
  async startAccessCertificationCampaign(campaign: AccessCertificationCampaign): Promise<AccessCertificationCampaign> {
    // Store campaign
    await this.redis.hset('access-campaigns', campaign.id, JSON.stringify(campaign));
    
    // Create individual reviews for each target user
    for (const userId of campaign.targetUsers) {
      for (const reviewerId of campaign.reviewers) {
        const review: AccessReview = {
          id: encryptionService.generateUUID(),
          type: 'USER',
          targetId: userId,
          reviewerId,
          status: 'PENDING',
          scheduledDate: campaign.startDate,
          findings: [],
          recommendations: [],
          nextReviewDate: new Date(campaign.endDate.getTime() + 365 * 24 * 60 * 60 * 1000), // Next year
          metadata: {
            campaignId: campaign.id,
            campaignName: campaign.name,
          },
        };
        
        await this.redis.hset('access-reviews', review.id, JSON.stringify(review));
        this.activeReviews.set(review.id, review);
      }
    }
    
    return campaign;
  }

  /**
   * Complete access review
   */
  async completeAccessReview(
    reviewId: string,
    reviewerId: string,
    findings: ReviewFinding[],
    recommendations: string[]
  ): Promise<AccessReview> {
    const review = await this.getAccessReview(reviewId);
    if (!review) {
      throw new Error(`Access review ${reviewId} not found`);
    }
    
    if (review.reviewerId !== reviewerId) {
      throw new Error('Unauthorized to complete this review');
    }
    
    const completedReview: AccessReview = {
      ...review,
      status: 'APPROVED',
      completedDate: new Date(),
      findings,
      recommendations,
    };
    
    // Store completed review
    await this.redis.hset('access-reviews', reviewId, JSON.stringify(completedReview));
    this.activeReviews.set(reviewId, completedReview);
    
    // Process findings
    await this.processFindingsAndRecommendations(completedReview);
    
    // Log review completion
    await this.logLifecycleEvent({
      id: encryptionService.generateUUID(),
      userId: review.targetId,
      eventType: 'ACCESS_REVIEWED',
      details: {
        reviewId,
        reviewerId,
        findings: findings.length,
        recommendations: recommendations.length,
        violationsFound: findings.filter(f => f.type === 'COMPLIANCE' && f.severity === 'HIGH').length,
      },
      performedBy: reviewerId,
      timestamp: new Date(),
      relatedObjects: [reviewId],
    });
    
    return completedReview;
  }

  /**
   * Generate user access report
   */
  async generateUserAccessReport(userId: string): Promise<any> {
    const user = await this.getUserWithRelationships(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Get user's effective permissions
    const permissions = await this.redis.get(`user-permissions:${userId}`);
    const effectivePermissions = permissions ? JSON.parse(permissions) : [];
    
    // Get recent access activity
    const recentActivity = await this.getUserAccessActivity(userId, 30); // Last 30 days
    
    // Get compliance status
    const complianceStatus = await this.getUserComplianceStatus(userId);
    
    // Get risk assessment
    const riskAssessment = await this.getUserRiskAssessment(userId);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        isActive: user.isActive,
        mfaEnabled: user.mfaEnabled,
        lastLoginAt: user.lastLoginAt,
        riskScore: user.riskScore,
      },
      roles: user.roles.map(role => ({
        roleId: role.roleId,
        assignedAt: role.assignedAt,
        validFrom: role.validFrom,
        validTo: role.validTo,
        source: role.source,
      })),
      groups: user.groups.map(group => ({
        id: group.id,
        name: group.name,
        type: group.type,
      })),
      effectivePermissions: effectivePermissions.length,
      recentActivity,
      complianceStatus,
      riskAssessment,
      lastReviewed: await this.getLastAccessReviewDate(userId),
      nextReviewDue: await this.getNextAccessReviewDate(userId),
      generatedAt: new Date(),
    };
  }

  // Helper methods...

  private async getUser(userId: string): Promise<User | null> {
    const userData = await this.redis.hget('users', userId);
    return userData ? JSON.parse(userData) : null;
  }

  private async getUserGroup(groupId: string): Promise<UserGroup | null> {
    const cached = this.groupCache.get(groupId);
    if (cached) return cached;
    
    const groupData = await this.redis.hget('user-groups', groupId);
    if (!groupData) return null;
    
    const group = JSON.parse(groupData);
    this.groupCache.set(groupId, group);
    return group;
  }

  private async getAccessReview(reviewId: string): Promise<AccessReview | null> {
    const cached = this.activeReviews.get(reviewId);
    if (cached) return cached;
    
    const reviewData = await this.redis.hget('access-reviews', reviewId);
    if (!reviewData) return null;
    
    const review = JSON.parse(reviewData);
    this.activeReviews.set(reviewId, review);
    return review;
  }

  private inferAttributeType(value: any): 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT' {
    if (typeof value === 'string') return 'STRING';
    if (typeof value === 'number') return 'NUMBER';
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (Array.isArray(value)) return 'ARRAY';
    return 'OBJECT';
  }

  private async validateProvisioningRequest(request: UserProvisioningRequest): Promise<void> {
    // Check if user already exists
    const existingUserId = await this.redis.hget('users:by-email', request.email.toLowerCase());
    if (existingUserId) {
      throw new Error(`User with email ${request.email} already exists`);
    }
    
    // Validate required roles exist
    for (const roleId of request.requiredRoles) {
      const roleExists = await this.redis.hexists('rbac:roles', roleId);
      if (!roleExists) {
        throw new Error(`Role ${roleId} does not exist`);
      }
    }
    
    // Validate required groups exist
    for (const groupId of request.requiredGroups) {
      const groupExists = await this.redis.hexists('user-groups', groupId);
      if (!groupExists) {
        throw new Error(`Group ${groupId} does not exist`);
      }
    }
  }

  private async assignRoleToUser(
    userId: string,
    roleId: string,
    assignedBy: string,
    options?: { validFrom?: Date; validTo?: Date }
  ): Promise<void> {
    const userRole: UserRole = {
      roleId,
      assignedAt: new Date(),
      assignedBy,
      validFrom: options?.validFrom,
      validTo: options?.validTo,
      isActive: true,
      source: 'MANUAL',
    };
    
    await this.redis.hset(`rbac:user-roles:${userId}`, roleId, JSON.stringify(userRole));
  }

  private async getUserRoles(userId: string): Promise<UserRole[]> {
    const userRoleData = await this.redis.hgetall(`rbac:user-roles:${userId}`);
    return Object.values(userRoleData).map(data => JSON.parse(data));
  }

  private async getUserGroups(userId: string): Promise<UserGroup[]> {
    const user = await this.getUser(userId);
    return user ? user.groups : [];
  }

  private async deactivateAllUserRoles(userId: string, deactivatedBy: string): Promise<void> {
    const userRoles = await this.getUserRoles(userId);
    
    for (const role of userRoles) {
      const deactivatedRole: UserRole = {
        ...role,
        isActive: false,
      };
      
      await this.redis.hset(`rbac:user-roles:${userId}`, role.roleId, JSON.stringify(deactivatedRole));
    }
  }

  private async revokeAllEmergencyAccess(userId: string, revokedBy: string): Promise<void> {
    const emergencyAccess = await this.redis.hgetall(`emergency:access:${userId}`);
    
    for (const [accessId, accessData] of Object.entries(emergencyAccess)) {
      const access: EmergencyAccess = JSON.parse(accessData);
      
      if (access.isActive) {
        access.isActive = false;
        access.updatedAt = new Date();
        
        await this.redis.hset(`emergency:access:${userId}`, accessId, JSON.stringify(access));
      }
    }
  }

  private async scheduleDataCleanup(userId: string, retentionDays: number): Promise<void> {
    const cleanupDate = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    
    await this.redis.zadd('scheduled:data-cleanup', cleanupDate.getTime(), userId);
  }

  private async scheduleAccessReview(
    targetId: string,
    type: 'USER' | 'ROLE' | 'PERMISSION',
    reviewerId: string,
    scheduledDate: Date
  ): Promise<void> {
    const review: AccessReview = {
      id: encryptionService.generateUUID(),
      type,
      targetId,
      reviewerId,
      status: 'PENDING',
      scheduledDate,
      findings: [],
      recommendations: [],
      nextReviewDate: new Date(scheduledDate.getTime() + 365 * 24 * 60 * 60 * 1000),
    };
    
    await this.redis.hset('access-reviews', review.id, JSON.stringify(review));
  }

  private async logLifecycleEvent(event: UserLifecycleEvent): Promise<void> {
    await this.redis.lpush('user:lifecycle:events', JSON.stringify(event));
    
    // Keep only recent events
    await this.redis.ltrim('user:lifecycle:events', 0, 9999);
  }

  private async processFindingsAndRecommendations(review: AccessReview): Promise<void> {
    // Process high-severity findings
    const criticalFindings = review.findings.filter(f => f.severity === 'CRITICAL');
    
    for (const finding of criticalFindings) {
      await this.logLifecycleEvent({
        id: encryptionService.generateUUID(),
        userId: review.targetId,
        eventType: 'VIOLATION_DETECTED',
        details: {
          reviewId: review.id,
          findingType: finding.type,
          severity: finding.severity,
          description: finding.description,
        },
        performedBy: review.reviewerId,
        timestamp: new Date(),
        relatedObjects: [review.id],
      });
    }
  }

  private async getUserAccessActivity(userId: string, days: number): Promise<any[]> {
    const logs = await this.redis.lrange('acm:audit:log', 0, -1);
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    return logs
      .map(log => JSON.parse(log))
      .filter(entry => 
        entry.userId === userId && 
        new Date(entry.timestamp) >= cutoffDate
      )
      .slice(0, 100); // Limit to recent 100 entries
  }

  private async getUserComplianceStatus(userId: string): Promise<any> {
    // Implementation would check against compliance frameworks
    return {
      status: 'COMPLIANT',
      frameworks: ['SOC2', 'ISO27001'],
      lastAssessed: new Date(),
      violations: 0,
    };
  }

  private async getUserRiskAssessment(userId: string): Promise<any> {
    const user = await this.getUser(userId);
    
    return {
      currentScore: user?.riskScore || 0,
      level: user?.riskScore ? (user.riskScore > 75 ? 'HIGH' : user.riskScore > 50 ? 'MEDIUM' : 'LOW') : 'LOW',
      lastCalculated: new Date(),
      factors: [],
    };
  }

  private async getLastAccessReviewDate(userId: string): Promise<Date | null> {
    const reviews = await this.redis.hgetall('access-reviews');
    
    const userReviews = Object.values(reviews)
      .map(data => JSON.parse(data))
      .filter(review => review.targetId === userId && review.status === 'APPROVED')
      .sort((a, b) => new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime());
    
    return userReviews.length > 0 ? new Date(userReviews[0].completedDate) : null;
  }

  private async getNextAccessReviewDate(userId: string): Promise<Date | null> {
    const reviews = await this.redis.hgetall('access-reviews');
    
    const pendingReviews = Object.values(reviews)
      .map(data => JSON.parse(data))
      .filter(review => review.targetId === userId && review.status === 'PENDING')
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    
    return pendingReviews.length > 0 ? new Date(pendingReviews[0].scheduledDate) : null;
  }

  private startAutomatedTasks(): void {
    // Run cleanup tasks every hour
    setInterval(async () => {
      await this.runScheduledDataCleanup();
      await this.sendAccessReviewReminders();
      await this.detectComplianceViolations();
    }, 60 * 60 * 1000);
  }

  private async runScheduledDataCleanup(): Promise<void> {
    const now = Date.now();
    const scheduledCleanups = await this.redis.zrangebyscore('scheduled:data-cleanup', 0, now);
    
    for (const userId of scheduledCleanups) {
      try {
        await this.performDataCleanup(userId);
        await this.redis.zrem('scheduled:data-cleanup', userId);
      } catch (error) {
        console.error(`Error cleaning up data for user ${userId}:`, error);
      }
    }
  }

  private async performDataCleanup(userId: string): Promise<void> {
    // Remove user data while preserving audit logs
    await this.redis.hdel('users', userId);
    await this.redis.del(`rbac:user-roles:${userId}`);
    await this.redis.del(`emergency:access:${userId}`);
    await this.redis.del(`user:attributes:${userId}`);
    await this.redis.del(`user:permissions:${userId}`);
    
    console.log(`Data cleanup completed for user ${userId}`);
  }

  private async sendAccessReviewReminders(): Promise<void> {
    const now = new Date();
    const reminderDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead
    
    const reviews = await this.redis.hgetall('access-reviews');
    
    for (const [reviewId, reviewData] of Object.entries(reviews)) {
      const review: AccessReview = JSON.parse(reviewData);
      
      if (review.status === 'PENDING' && new Date(review.scheduledDate) <= reminderDate) {
        // Send reminder (implementation would integrate with notification system)
        console.log(`Reminder: Access review ${reviewId} due for user ${review.targetId}`);
      }
    }
  }

  private async detectComplianceViolations(): Promise<void> {
    // Implementation would check for various compliance violations
    // Example: users without recent access reviews, excessive permissions, etc.
    console.log('Running compliance violation detection...');
  }
}