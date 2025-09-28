/**
 * Access Control Matrix Implementation
 * Comprehensive RBAC/ABAC system with advanced features
 */

import Redis from 'ioredis';
import { 
  AccessMatrix, 
  ResourceAccess, 
  ComputedPermission, 
  AccessRequest, 
  AccessDecision,
  User,
  Role,
  Permission,
  PermissionInheritance,
  CacheEntry,
  PolicyConflict,
  RiskAssessment,
  AccessAudit
} from './types';
import { RBACManager } from './RBACManager';
import { PermissionEngine } from './PermissionEngine';
import { UserManager } from './UserManager';
import { encryptionService } from '../services/encryption';

export interface AccessControlMatrixConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  cache: {
    matrixTTL: number; // Matrix cache TTL in seconds
    decisionTTL: number; // Decision cache TTL in seconds
    maxSize: number; // Maximum cache size
  };
  security: {
    enableAuditLogging: boolean;
    enableRiskAssessment: boolean;
    maxRiskScore: number;
    emergencyAccessEnabled: boolean;
  };
  performance: {
    maxConcurrentRequests: number;
    requestTimeout: number;
    enableMetrics: boolean;
  };
}

export class AccessControlMatrix {
  private redis: Redis;
  private rbacManager: RBACManager;
  private permissionEngine: PermissionEngine;
  private userManager: UserManager;
  private matrixCache: Map<string, CacheEntry<AccessMatrix>>;
  private decisionCache: Map<string, CacheEntry<AccessDecision>>;
  private conflictCache: Map<string, PolicyConflict[]>;
  private config: AccessControlMatrixConfig;

  constructor(config: AccessControlMatrixConfig) {
    this.config = config;
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    this.rbacManager = new RBACManager(this.redis);
    this.permissionEngine = new PermissionEngine(this.redis, config);
    this.userManager = new UserManager(this.redis);
    
    this.matrixCache = new Map();
    this.decisionCache = new Map();
    this.conflictCache = new Map();

    this.initializeCleanupTasks();
  }

  /**
   * Initialize background cleanup tasks
   */
  private initializeCleanupTasks(): void {
    // Clean expired cache entries every 5 minutes
    setInterval(() => {
      this.cleanExpiredCache();
    }, 5 * 60 * 1000);

    // Refresh matrices for active users every hour
    setInterval(() => {
      this.refreshActiveUserMatrices();
    }, 60 * 60 * 1000);
  }

  /**
   * Compute comprehensive access matrix for a user
   */
  async computeAccessMatrix(userId: string, forceRefresh = false): Promise<AccessMatrix> {
    const cacheKey = `matrix:${userId}`;
    
    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cached = this.matrixCache.get(cacheKey);
      if (cached && cached.validUntil > new Date()) {
        cached.hits++;
        cached.lastAccessed = new Date();
        return cached.data;
      }
    }

    const startTime = Date.now();
    
    try {
      // Get user with all relationships
      const user = await this.userManager.getUserWithRelationships(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Get all roles (direct and inherited)
      const allRoles = await this.rbacManager.getUserRolesWithInheritance(userId);
      
      // Get all permissions from roles and direct assignments
      const allPermissions = await this.permissionEngine.getUserPermissions(userId);
      
      // Group permissions by resource
      const resourceMap = new Map<string, ComputedPermission[]>();
      const inheritanceMap = new Map<string, PermissionInheritance[]>();

      for (const permission of allPermissions) {
        if (!resourceMap.has(permission.resource)) {
          resourceMap.set(permission.resource, []);
          inheritanceMap.set(permission.resource, []);
        }

        const computedPermission: ComputedPermission = {
          action: permission.action,
          effect: permission.effect,
          source: permission.source,
          priority: permission.priority,
          conditions: permission.conditions,
          validFrom: permission.validFrom,
          validTo: permission.validTo,
        };

        resourceMap.get(permission.resource)!.push(computedPermission);

        // Track inheritance if permission came from role
        if (permission.source.type === 'ROLE' && permission.source.path) {
          const inheritance: PermissionInheritance = {
            fromRole: permission.source.id,
            throughPath: permission.source.path,
            permissions: [permission.id],
            level: permission.source.path.length,
          };
          inheritanceMap.get(permission.resource)!.push(inheritance);
        }
      }

      // Create resource access entries
      const resources: ResourceAccess[] = Array.from(resourceMap.entries()).map(([resource, permissions]) => ({
        resource,
        permissions: this.optimizePermissions(permissions),
        conditions: this.extractResourceConditions(permissions),
        inheritance: inheritanceMap.get(resource) || [],
        metadata: {
          computedAt: new Date(),
          permissionCount: permissions.length,
          inheritanceDepth: Math.max(...(inheritanceMap.get(resource) || []).map(i => i.level), 0),
        },
      }));

      // Calculate risk level
      const riskLevel = await this.calculateUserRiskLevel(user, resources);

      // Create access matrix
      const matrix: AccessMatrix = {
        userId,
        resources,
        computedAt: new Date(),
        validUntil: new Date(Date.now() + this.config.cache.matrixTTL * 1000),
        riskLevel,
        audit: [{
          id: encryptionService.generateUUID(),
          requestId: 'matrix-computation',
          userId,
          action: 'COMPUTE_MATRIX',
          resource: '*',
          decision: 'ALLOW',
          reason: 'Matrix computation completed',
          context: {
            ip: '127.0.0.1',
            userAgent: 'AccessControlMatrix',
            environment: 'PRODUCTION',
          } as any,
          appliedPolicies: allRoles.map(r => r.id),
          riskScore: this.getRiskScore(riskLevel),
          timestamp: new Date(),
          duration: Date.now() - startTime,
        }],
      };

      // Cache the matrix
      this.cacheMatrix(cacheKey, matrix);

      // Store in Redis for persistence
      await this.redis.setex(
        `acm:matrix:${userId}`,
        this.config.cache.matrixTTL,
        JSON.stringify(matrix)
      );

      return matrix;

    } catch (error) {
      console.error(`Error computing access matrix for user ${userId}:`, error);
      throw new Error(`Failed to compute access matrix: ${error.message}`);
    }
  }

  /**
   * Evaluate access request with comprehensive decision logic
   */
  async evaluateAccess(request: AccessRequest): Promise<AccessDecision> {
    const cacheKey = this.generateDecisionCacheKey(request);
    
    // Check decision cache
    const cached = this.decisionCache.get(cacheKey);
    if (cached && cached.validUntil > new Date()) {
      cached.hits++;
      cached.lastAccessed = new Date();
      return cached.data;
    }

    const startTime = Date.now();
    
    try {
      // Get user's access matrix
      const matrix = await this.computeAccessMatrix(request.userId);
      
      // Find relevant resource access
      const resourceAccess = this.findBestMatchingResource(matrix.resources, request.resource);
      
      // Evaluate permissions for the specific action
      const permissionResult = await this.permissionEngine.evaluatePermissions(
        resourceAccess?.permissions || [],
        request.action,
        request.context
      );

      // Perform risk assessment
      const riskAssessment = await this.assessRequestRisk(request, matrix, resourceAccess);

      // Check for policy conflicts
      const conflicts = await this.detectPolicyConflicts(request, resourceAccess);

      // Make final decision
      const decision = this.makeFinalDecision(permissionResult, riskAssessment, conflicts);

      // Create access decision
      const accessDecision: AccessDecision = {
        id: encryptionService.generateUUID(),
        decision: decision.result,
        reason: decision.reason,
        appliedPolicies: decision.appliedPolicies,
        conditions: decision.conditions,
        riskAssessment,
        recommendations: this.generateRecommendations(riskAssessment, conflicts),
        audit: {
          id: encryptionService.generateUUID(),
          requestId: request.id,
          userId: request.userId,
          action: request.action,
          resource: request.resource,
          decision: decision.result,
          reason: decision.reason,
          context: request.context,
          appliedPolicies: decision.appliedPolicies.map(p => p.id),
          riskScore: riskAssessment.totalScore,
          timestamp: new Date(),
          sessionId: request.sessionId,
          duration: Date.now() - startTime,
        },
        computedAt: new Date(),
        validUntil: new Date(Date.now() + this.config.cache.decisionTTL * 1000),
        requiresReview: riskAssessment.level === 'CRITICAL' || conflicts.length > 0,
      };

      // Cache the decision
      this.cacheDecision(cacheKey, accessDecision);

      // Log audit trail if enabled
      if (this.config.security.enableAuditLogging) {
        await this.logAccessAudit(accessDecision.audit);
      }

      return accessDecision;

    } catch (error) {
      console.error(`Error evaluating access request ${request.id}:`, error);
      
      // Return secure default (DENY) on error
      const errorDecision: AccessDecision = {
        id: encryptionService.generateUUID(),
        decision: 'DENY',
        reason: `Access evaluation failed: ${error.message}`,
        appliedPolicies: [],
        riskAssessment: {
          totalScore: 100,
          factors: [{
            type: 'PRIVILEGE',
            name: 'System Error',
            score: 100,
            weight: 1,
            description: 'Access denied due to system error',
          }],
          level: 'CRITICAL',
          mitigations: ['System maintenance required'],
          monitoring: true,
        },
        recommendations: ['Contact system administrator'],
        audit: {
          id: encryptionService.generateUUID(),
          requestId: request.id,
          userId: request.userId,
          action: request.action,
          resource: request.resource,
          decision: 'DENY',
          reason: `System error: ${error.message}`,
          context: request.context,
          appliedPolicies: [],
          riskScore: 100,
          timestamp: new Date(),
          sessionId: request.sessionId,
          duration: Date.now() - startTime,
        },
        computedAt: new Date(),
        requiresReview: true,
      };

      return errorDecision;
    }
  }

  /**
   * Bulk evaluate multiple access requests
   */
  async evaluateAccessBulk(requests: AccessRequest[]): Promise<AccessDecision[]> {
    const decisions: AccessDecision[] = [];
    
    // Process in batches to avoid overwhelming the system
    const batchSize = Math.min(this.config.performance.maxConcurrentRequests, 10);
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchPromises = batch.map(request => 
        this.evaluateAccess(request).catch(error => {
          console.error(`Error in bulk evaluation for request ${request.id}:`, error);
          return {
            id: encryptionService.generateUUID(),
            decision: 'DENY' as const,
            reason: `Bulk evaluation error: ${error.message}`,
            appliedPolicies: [],
            riskAssessment: {
              totalScore: 100,
              factors: [],
              level: 'CRITICAL' as const,
              mitigations: [],
              monitoring: true,
            },
            recommendations: [],
            audit: {
              id: encryptionService.generateUUID(),
              requestId: request.id,
              userId: request.userId,
              action: request.action,
              resource: request.resource,
              decision: 'DENY' as const,
              reason: `Bulk evaluation error: ${error.message}`,
              context: request.context,
              appliedPolicies: [],
              riskScore: 100,
              timestamp: new Date(),
              sessionId: request.sessionId,
            },
            computedAt: new Date(),
            requiresReview: true,
          };
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      decisions.push(...batchResults);
    }
    
    return decisions;
  }

  /**
   * Optimize permissions by removing redundant entries and resolving conflicts
   */
  private optimizePermissions(permissions: ComputedPermission[]): ComputedPermission[] {
    // Sort by priority (higher first)
    const sorted = permissions.sort((a, b) => b.priority - a.priority);
    
    // Group by action
    const byAction = new Map<string, ComputedPermission[]>();
    for (const permission of sorted) {
      if (!byAction.has(permission.action)) {
        byAction.set(permission.action, []);
      }
      byAction.get(permission.action)!.push(permission);
    }
    
    // For each action, keep only the highest priority permission
    const optimized: ComputedPermission[] = [];
    for (const [action, actionPermissions] of byAction) {
      const highest = actionPermissions[0]; // Already sorted by priority
      optimized.push(highest);
    }
    
    return optimized;
  }

  /**
   * Extract conditions that apply to the resource
   */
  private extractResourceConditions(permissions: ComputedPermission[]): any[] {
    const conditions = new Set();
    
    for (const permission of permissions) {
      if (permission.conditions) {
        for (const condition of permission.conditions) {
          conditions.add(JSON.stringify(condition));
        }
      }
    }
    
    return Array.from(conditions).map(c => JSON.parse(c as string));
  }

  /**
   * Calculate user risk level based on permissions and context
   */
  private async calculateUserRiskLevel(user: User, resources: ResourceAccess[]): Promise<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> {
    let riskScore = user.riskScore || 0;
    
    // Add risk based on permission scope
    const highPrivilegeResources = resources.filter(r => 
      r.resource.includes('admin') || 
      r.resource.includes('*') ||
      r.permissions.some(p => p.action === '*')
    );
    
    riskScore += highPrivilegeResources.length * 10;
    
    // Add risk based on inheritance depth
    const maxInheritanceDepth = Math.max(
      ...resources.map(r => Math.max(...r.inheritance.map(i => i.level), 0)),
      0
    );
    
    riskScore += maxInheritanceDepth * 5;
    
    // Determine risk level
    if (riskScore >= 80) return 'CRITICAL';
    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 30) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Find the best matching resource access for a request
   */
  private findBestMatchingResource(resources: ResourceAccess[], requestedResource: string): ResourceAccess | null {
    // First try exact match
    let exactMatch = resources.find(r => r.resource === requestedResource);
    if (exactMatch) return exactMatch;
    
    // Then try pattern matching (longest match wins)
    let bestMatch: ResourceAccess | null = null;
    let bestMatchLength = 0;
    
    for (const resource of resources) {
      if (this.resourceMatches(resource.resource, requestedResource)) {
        if (resource.resource.length > bestMatchLength) {
          bestMatch = resource;
          bestMatchLength = resource.resource.length;
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * Check if a resource pattern matches the requested resource
   */
  private resourceMatches(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;
    
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`).test(resource);
  }

  /**
   * Assess risk for a specific access request
   */
  private async assessRequestRisk(
    request: AccessRequest,
    matrix: AccessMatrix,
    resourceAccess: ResourceAccess | null
  ): Promise<RiskAssessment> {
    const factors: any[] = [];
    let totalScore = 0;

    // Base user risk
    if (matrix.riskLevel === 'CRITICAL') {
      factors.push({
        type: 'PRIVILEGE',
        name: 'High Privilege User',
        score: 30,
        weight: 1,
        description: 'User has critical privilege level',
      });
      totalScore += 30;
    }

    // Time-based risk
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      factors.push({
        type: 'TEMPORAL',
        name: 'Off-hours Access',
        score: 20,
        weight: 0.8,
        description: 'Access requested outside business hours',
      });
      totalScore += 16;
    }

    // Device risk
    if (request.context.device && !request.context.device.isTrusted) {
      factors.push({
        type: 'DEVICE',
        name: 'Untrusted Device',
        score: 25,
        weight: 1,
        description: 'Access from unmanaged or untrusted device',
      });
      totalScore += 25;
    }

    // Location risk (simplified)
    if (request.context.location && request.context.location.country !== 'US') {
      factors.push({
        type: 'LOCATION',
        name: 'Foreign Access',
        score: 15,
        weight: 0.7,
        description: 'Access from outside primary country',
      });
      totalScore += 10.5;
    }

    // Resource sensitivity
    if (resourceAccess?.resource.includes('admin') || resourceAccess?.resource.includes('secret')) {
      factors.push({
        type: 'DATA_SENSITIVITY',
        name: 'Sensitive Resource',
        score: 35,
        weight: 1,
        description: 'Access to sensitive administrative resource',
      });
      totalScore += 35;
    }

    // Session risk
    if (request.context.session && !request.context.session.mfaVerified) {
      factors.push({
        type: 'BEHAVIOR',
        name: 'No MFA Verification',
        score: 20,
        weight: 1,
        description: 'Session not verified with multi-factor authentication',
      });
      totalScore += 20;
    }

    // Determine risk level
    let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (totalScore >= 80) level = 'CRITICAL';
    else if (totalScore >= 60) level = 'HIGH';
    else if (totalScore >= 30) level = 'MEDIUM';
    else level = 'LOW';

    return {
      totalScore: Math.min(totalScore, 100),
      factors,
      level,
      mitigations: this.generateMitigations(factors),
      monitoring: level === 'HIGH' || level === 'CRITICAL',
    };
  }

  /**
   * Generate risk mitigation recommendations
   */
  private generateMitigations(factors: any[]): string[] {
    const mitigations: string[] = [];
    
    for (const factor of factors) {
      switch (factor.type) {
        case 'TEMPORAL':
          mitigations.push('Require additional approval for off-hours access');
          break;
        case 'DEVICE':
          mitigations.push('Require device registration and trust establishment');
          break;
        case 'LOCATION':
          mitigations.push('Implement geo-fencing and location verification');
          break;
        case 'BEHAVIOR':
          mitigations.push('Enforce multi-factor authentication');
          break;
        case 'DATA_SENSITIVITY':
          mitigations.push('Enable enhanced monitoring and audit logging');
          break;
      }
    }
    
    return [...new Set(mitigations)]; // Remove duplicates
  }

  /**
   * Detect policy conflicts for a request
   */
  private async detectPolicyConflicts(
    request: AccessRequest,
    resourceAccess: ResourceAccess | null
  ): Promise<PolicyConflict[]> {
    if (!resourceAccess) return [];
    
    const conflicts: PolicyConflict[] = [];
    const permissions = resourceAccess.permissions;
    
    // Check for conflicting permissions (ALLOW vs DENY for same action)
    const actionGroups = new Map<string, ComputedPermission[]>();
    
    for (const permission of permissions) {
      if (!actionGroups.has(permission.action)) {
        actionGroups.set(permission.action, []);
      }
      actionGroups.get(permission.action)!.push(permission);
    }
    
    for (const [action, actionPermissions] of actionGroups) {
      const allows = actionPermissions.filter(p => p.effect === 'ALLOW');
      const denies = actionPermissions.filter(p => p.effect === 'DENY');
      
      if (allows.length > 0 && denies.length > 0) {
        conflicts.push({
          id: encryptionService.generateUUID(),
          type: 'PERMISSION_CONFLICT',
          severity: 'HIGH',
          description: `Conflicting permissions for action ${action}: both ALLOW and DENY present`,
          conflictingPolicies: [...allows, ...denies].map(p => p.source.id),
          resolution: {
            strategy: 'PRIORITY',
            action: 'Use highest priority permission',
            rationale: 'Priority-based conflict resolution',
          },
          detectedAt: new Date(),
        });
      }
    }
    
    return conflicts;
  }

  /**
   * Make final access decision based on all factors
   */
  private makeFinalDecision(
    permissionResult: any,
    riskAssessment: RiskAssessment,
    conflicts: PolicyConflict[]
  ): any {
    // Default to DENY for security
    let result: 'ALLOW' | 'DENY' | 'CONDITIONAL' = 'DENY';
    let reason = 'No matching permissions found';
    const appliedPolicies: any[] = [];
    const conditions: any[] = [];

    // Check if we have explicit permission
    if (permissionResult.hasPermission) {
      result = 'ALLOW';
      reason = permissionResult.reason;
      appliedPolicies.push(...permissionResult.appliedPolicies);
    }

    // Apply risk-based restrictions
    if (riskAssessment.level === 'CRITICAL') {
      result = 'DENY';
      reason = 'Access denied due to critical risk level';
    } else if (riskAssessment.level === 'HIGH') {
      if (result === 'ALLOW') {
        result = 'CONDITIONAL';
        reason = 'Access allowed with additional conditions due to high risk';
        conditions.push({
          type: 'monitoring',
          description: 'Enhanced monitoring required',
          duration: 3600, // 1 hour
        });
      }
    }

    // Handle conflicts
    if (conflicts.length > 0) {
      const criticalConflicts = conflicts.filter(c => c.severity === 'CRITICAL');
      if (criticalConflicts.length > 0) {
        result = 'DENY';
        reason = 'Access denied due to critical policy conflicts';
      }
    }

    return {
      result,
      reason,
      appliedPolicies,
      conditions,
    };
  }

  /**
   * Generate recommendations based on assessment
   */
  private generateRecommendations(
    riskAssessment: RiskAssessment,
    conflicts: PolicyConflict[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Risk-based recommendations
    recommendations.push(...riskAssessment.mitigations);
    
    // Conflict-based recommendations
    for (const conflict of conflicts) {
      recommendations.push(`Resolve ${conflict.type}: ${conflict.description}`);
    }
    
    // General security recommendations
    if (riskAssessment.level === 'HIGH' || riskAssessment.level === 'CRITICAL') {
      recommendations.push('Consider implementing step-up authentication');
      recommendations.push('Enable enhanced audit logging for this user');
    }
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Cache access matrix
   */
  private cacheMatrix(key: string, matrix: AccessMatrix): void {
    this.matrixCache.set(key, {
      data: matrix,
      computedAt: new Date(),
      validUntil: matrix.validUntil,
      hits: 1,
      lastAccessed: new Date(),
    });
    
    // Limit cache size
    if (this.matrixCache.size > this.config.cache.maxSize) {
      const oldestKey = Array.from(this.matrixCache.entries())
        .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime())[0][0];
      this.matrixCache.delete(oldestKey);
    }
  }

  /**
   * Cache access decision
   */
  private cacheDecision(key: string, decision: AccessDecision): void {
    this.decisionCache.set(key, {
      data: decision,
      computedAt: new Date(),
      validUntil: decision.validUntil || new Date(Date.now() + this.config.cache.decisionTTL * 1000),
      hits: 1,
      lastAccessed: new Date(),
    });
    
    // Limit cache size
    if (this.decisionCache.size > this.config.cache.maxSize) {
      const oldestKey = Array.from(this.decisionCache.entries())
        .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime())[0][0];
      this.decisionCache.delete(oldestKey);
    }
  }

  /**
   * Generate cache key for access decision
   */
  private generateDecisionCacheKey(request: AccessRequest): string {
    const keyData = {
      userId: request.userId,
      resource: request.resource,
      action: request.action,
      ip: request.context.ip,
      sessionId: request.sessionId,
    };
    
    return encryptionService.createHMAC(JSON.stringify(keyData), 'decision-cache');
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = new Date();
    
    // Clean matrix cache
    for (const [key, entry] of this.matrixCache.entries()) {
      if (entry.validUntil <= now) {
        this.matrixCache.delete(key);
      }
    }
    
    // Clean decision cache
    for (const [key, entry] of this.decisionCache.entries()) {
      if (entry.validUntil <= now) {
        this.decisionCache.delete(key);
      }
    }
  }

  /**
   * Refresh matrices for active users
   */
  private async refreshActiveUserMatrices(): Promise<void> {
    // Get list of active users (implement based on your user tracking)
    // For now, refresh all cached matrices that are close to expiry
    
    const refreshThreshold = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    
    for (const [key, entry] of this.matrixCache.entries()) {
      if (entry.validUntil <= refreshThreshold) {
        const userId = key.replace('matrix:', '');
        try {
          await this.computeAccessMatrix(userId, true);
        } catch (error) {
          console.error(`Error refreshing matrix for user ${userId}:`, error);
        }
      }
    }
  }

  /**
   * Log audit trail to persistent storage
   */
  private async logAccessAudit(audit: AccessAudit): Promise<void> {
    try {
      await this.redis.lpush('acm:audit:log', JSON.stringify(audit));
      
      // Keep only recent audit logs (last 10000 entries)
      await this.redis.ltrim('acm:audit:log', 0, 9999);
    } catch (error) {
      console.error('Error logging audit trail:', error);
    }
  }

  /**
   * Get risk score from risk level
   */
  private getRiskScore(level: string): number {
    switch (level) {
      case 'LOW': return 25;
      case 'MEDIUM': return 50;
      case 'HIGH': return 75;
      case 'CRITICAL': return 100;
      default: return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return {
      matrix: {
        size: this.matrixCache.size,
        hitRate: this.calculateHitRate(this.matrixCache),
      },
      decision: {
        size: this.decisionCache.size,
        hitRate: this.calculateHitRate(this.decisionCache),
      },
    };
  }

  /**
   * Calculate cache hit rate
   */
  private calculateHitRate(cache: Map<string, CacheEntry<any>>): number {
    let totalHits = 0;
    let totalAccesses = 0;
    
    for (const entry of cache.values()) {
      totalHits += entry.hits;
      totalAccesses += entry.hits; // Simplified calculation
    }
    
    return totalAccesses > 0 ? totalHits / totalAccesses : 0;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.redis.quit();
    this.matrixCache.clear();
    this.decisionCache.clear();
    this.conflictCache.clear();
  }
}