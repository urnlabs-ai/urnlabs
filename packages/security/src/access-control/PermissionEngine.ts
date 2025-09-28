/**
 * Permission Engine
 * Advanced permission evaluation with caching, inheritance, and context-aware decisions
 */

import Redis from 'ioredis';
import { 
  Permission, 
  ComputedPermission,
  AccessCondition,
  RequestContext,
  PermissionSource,
  RiskAssessment,
  TemporalAccess,
  EmergencyAccess,
  CacheEntry
} from './types';
import { AccessControlMatrixConfig } from './AccessControlMatrix';
import { encryptionService } from '../services/encryption';

export interface PermissionEvaluationResult {
  hasPermission: boolean;
  reason: string;
  appliedPolicies: any[];
  conditions: AccessCondition[];
  riskScore: number;
  recommendedActions: string[];
}

export interface PermissionContext {
  userId: string;
  sessionId?: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  attributes?: Record<string, any>;
}

export class PermissionEngine {
  private redis: Redis;
  private config: AccessControlMatrixConfig;
  private permissionCache: Map<string, CacheEntry<PermissionEvaluationResult>>;
  private temporalCache: Map<string, CacheEntry<boolean>>;
  private conditionEvaluators: Map<string, (condition: AccessCondition, context: PermissionContext) => Promise<boolean>>;

  constructor(redis: Redis, config: AccessControlMatrixConfig) {
    this.redis = redis;
    this.config = config;
    this.permissionCache = new Map();
    this.temporalCache = new Map();
    this.conditionEvaluators = new Map();
    
    this.initializeConditionEvaluators();
    this.startCacheCleanup();
  }

  /**
   * Initialize built-in condition evaluators
   */
  private initializeConditionEvaluators(): void {
    this.conditionEvaluators.set('temporal', this.evaluateTemporalCondition.bind(this));
    this.conditionEvaluators.set('context', this.evaluateContextCondition.bind(this));
    this.conditionEvaluators.set('attribute', this.evaluateAttributeCondition.bind(this));
    this.conditionEvaluators.set('location', this.evaluateLocationCondition.bind(this));
    this.conditionEvaluators.set('device', this.evaluateDeviceCondition.bind(this));
    this.conditionEvaluators.set('risk', this.evaluateRiskCondition.bind(this));
    this.conditionEvaluators.set('custom', this.evaluateCustomCondition.bind(this));
  }

  /**
   * Get all permissions for a user (direct + inherited)
   */
  async getUserPermissions(userId: string): Promise<ComputedPermission[]> {
    const cacheKey = `user-permissions:${userId}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const permissions: ComputedPermission[] = [];
    
    // Get direct permissions
    const directPermissions = await this.getDirectPermissions(userId);
    permissions.push(...directPermissions);
    
    // Get role-based permissions
    const rolePermissions = await this.getRoleBasedPermissions(userId);
    permissions.push(...rolePermissions);
    
    // Get group-based permissions
    const groupPermissions = await this.getGroupBasedPermissions(userId);
    permissions.push(...groupPermissions);
    
    // Get emergency access permissions
    const emergencyPermissions = await this.getEmergencyPermissions(userId);
    permissions.push(...emergencyPermissions);
    
    // Remove duplicates and sort by priority
    const uniquePermissions = this.deduplicatePermissions(permissions);
    const sortedPermissions = uniquePermissions.sort((a, b) => b.priority - a.priority);
    
    // Cache result
    await this.redis.setex(cacheKey, 300, JSON.stringify(sortedPermissions)); // 5 minutes cache
    
    return sortedPermissions;
  }

  /**
   * Evaluate permissions for a specific action and context
   */
  async evaluatePermissions(
    permissions: ComputedPermission[],
    action: string,
    context: PermissionContext
  ): Promise<PermissionEvaluationResult> {
    const cacheKey = this.generateEvaluationCacheKey(permissions, action, context);
    
    // Check cache
    const cached = this.permissionCache.get(cacheKey);
    if (cached && cached.validUntil > new Date()) {
      cached.hits++;
      cached.lastAccessed = new Date();
      return cached.data;
    }
    
    const startTime = Date.now();
    
    try {
      // Find permissions that match the action
      const matchingPermissions = permissions.filter(p => 
        this.actionMatches(p.action, action)
      );
      
      if (matchingPermissions.length === 0) {
        const result: PermissionEvaluationResult = {
          hasPermission: false,
          reason: `No permissions found for action: ${action}`,
          appliedPolicies: [],
          conditions: [],
          riskScore: 0,
          recommendedActions: ['Request access to this resource'],
        };
        
        this.cacheEvaluationResult(cacheKey, result);
        return result;
      }
      
      // Evaluate each matching permission
      const evaluationResults: any[] = [];
      
      for (const permission of matchingPermissions) {
        const evaluation = await this.evaluateSinglePermission(permission, context);
        evaluationResults.push({
          permission,
          evaluation,
        });
      }
      
      // Apply decision logic (highest priority wins)
      const finalDecision = this.applyPermissionDecisionLogic(evaluationResults);
      
      const result: PermissionEvaluationResult = {
        hasPermission: finalDecision.hasPermission,
        reason: finalDecision.reason,
        appliedPolicies: finalDecision.appliedPolicies,
        conditions: finalDecision.conditions,
        riskScore: finalDecision.riskScore,
        recommendedActions: finalDecision.recommendedActions,
      };
      
      // Cache the result
      this.cacheEvaluationResult(cacheKey, result);
      
      // Log evaluation for audit
      await this.logPermissionEvaluation(context.userId, action, result, Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      console.error('Error evaluating permissions:', error);
      
      // Return secure default (deny) on error
      const errorResult: PermissionEvaluationResult = {
        hasPermission: false,
        reason: `Permission evaluation failed: ${error.message}`,
        appliedPolicies: [],
        conditions: [],
        riskScore: 100,
        recommendedActions: ['Contact system administrator'],
      };
      
      return errorResult;
    }
  }

  /**
   * Evaluate a single permission with all its conditions
   */
  private async evaluateSinglePermission(
    permission: ComputedPermission,
    context: PermissionContext
  ): Promise<any> {
    // Check temporal validity
    if (!this.isTemporallyValid(permission)) {
      return {
        hasPermission: false,
        reason: 'Permission is not temporally valid',
        riskScore: 0,
      };
    }
    
    // Base permission check
    if (permission.effect === 'DENY') {
      return {
        hasPermission: false,
        reason: 'Explicit DENY permission',
        riskScore: 0,
      };
    }
    
    // Evaluate conditions
    if (permission.conditions && permission.conditions.length > 0) {
      const conditionResults = await this.evaluateConditions(permission.conditions, context);
      
      if (!conditionResults.allPassed) {
        return {
          hasPermission: false,
          reason: `Condition failed: ${conditionResults.failedConditions.join(', ')}`,
          riskScore: conditionResults.riskScore,
          conditions: permission.conditions,
        };
      }
      
      return {
        hasPermission: true,
        reason: 'Permission granted with conditions satisfied',
        riskScore: conditionResults.riskScore,
        conditions: permission.conditions,
      };
    }
    
    // No conditions, permission granted
    return {
      hasPermission: true,
      reason: 'Permission granted unconditionally',
      riskScore: 10, // Base risk for any permission
    };
  }

  /**
   * Check if permission is temporally valid
   */
  private isTemporallyValid(permission: ComputedPermission): boolean {
    const now = new Date();
    
    if (permission.validFrom && now < permission.validFrom) {
      return false;
    }
    
    if (permission.validTo && now > permission.validTo) {
      return false;
    }
    
    return true;
  }

  /**
   * Evaluate all conditions for a permission
   */
  private async evaluateConditions(
    conditions: AccessCondition[],
    context: PermissionContext
  ): Promise<{
    allPassed: boolean;
    failedConditions: string[];
    riskScore: number;
  }> {
    const failedConditions: string[] = [];
    let totalRiskScore = 0;
    
    for (const condition of conditions) {
      const evaluator = this.conditionEvaluators.get(condition.type);
      
      if (!evaluator) {
        console.warn(`No evaluator found for condition type: ${condition.type}`);
        failedConditions.push(`Unknown condition type: ${condition.type}`);
        continue;
      }
      
      try {
        const passed = await evaluator(condition, context);
        
        if (!passed) {
          failedConditions.push(`${condition.type}: ${condition.field} ${condition.operator} ${condition.value}`);
        }
        
        // Add risk score based on condition type and result
        totalRiskScore += this.calculateConditionRiskScore(condition, passed);
        
      } catch (error) {
        console.error(`Error evaluating condition ${condition.type}:`, error);
        failedConditions.push(`${condition.type}: evaluation error`);
      }
    }
    
    return {
      allPassed: failedConditions.length === 0,
      failedConditions,
      riskScore: totalRiskScore,
    };
  }

  /**
   * Evaluate temporal condition (time-based access)
   */
  private async evaluateTemporalCondition(
    condition: AccessCondition,
    context: PermissionContext
  ): Promise<boolean> {
    const cacheKey = `temporal:${JSON.stringify(condition)}:${context.timestamp.toISOString().slice(0, 10)}`;
    
    // Check cache
    const cached = this.temporalCache.get(cacheKey);
    if (cached && cached.validUntil > new Date()) {
      return cached.data;
    }
    
    let result = false;
    
    switch (condition.field) {
      case 'time':
        result = this.evaluateTimeCondition(condition, context.timestamp);
        break;
      case 'day_of_week':
        result = this.evaluateDayOfWeekCondition(condition, context.timestamp);
        break;
      case 'date_range':
        result = this.evaluateDateRangeCondition(condition, context.timestamp);
        break;
      default:
        console.warn(`Unknown temporal condition field: ${condition.field}`);
        return false;
    }
    
    // Cache the result (valid for the rest of the day)
    const tomorrow = new Date(context.timestamp);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    this.temporalCache.set(cacheKey, {
      data: result,
      computedAt: new Date(),
      validUntil: tomorrow,
      hits: 1,
      lastAccessed: new Date(),
    });
    
    return result;
  }

  /**
   * Evaluate time-of-day condition
   */
  private evaluateTimeCondition(condition: AccessCondition, timestamp: Date): boolean {
    const currentTime = `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}`;
    
    switch (condition.operator) {
      case 'between':
        const [startTime, endTime] = condition.value;
        return currentTime >= startTime && currentTime <= endTime;
      case 'equals':
        return currentTime === condition.value;
      case 'gt':
        return currentTime > condition.value;
      case 'lt':
        return currentTime < condition.value;
      default:
        return false;
    }
  }

  /**
   * Evaluate day of week condition
   */
  private evaluateDayOfWeekCondition(condition: AccessCondition, timestamp: Date): boolean {
    const dayOfWeek = timestamp.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    switch (condition.operator) {
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(dayOfWeek);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(dayOfWeek);
      case 'equals':
        return dayOfWeek === condition.value;
      default:
        return false;
    }
  }

  /**
   * Evaluate date range condition
   */
  private evaluateDateRangeCondition(condition: AccessCondition, timestamp: Date): boolean {
    const currentDate = timestamp.toISOString().slice(0, 10);
    
    switch (condition.operator) {
      case 'between':
        const [startDate, endDate] = condition.value;
        return currentDate >= startDate && currentDate <= endDate;
      case 'gt':
        return currentDate > condition.value;
      case 'lt':
        return currentDate < condition.value;
      default:
        return false;
    }
  }

  /**
   * Evaluate context condition (IP, user agent, etc.)
   */
  private async evaluateContextCondition(
    condition: AccessCondition,
    context: PermissionContext
  ): Promise<boolean> {
    const contextValue = this.getContextValue(condition.field, context);
    
    if (contextValue === undefined) {
      return false;
    }
    
    return this.evaluateValueCondition(condition.operator, contextValue, condition.value);
  }

  /**
   * Evaluate attribute condition (user attributes)
   */
  private async evaluateAttributeCondition(
    condition: AccessCondition,
    context: PermissionContext
  ): Promise<boolean> {
    // Get user attributes from Redis
    const userAttributes = await this.redis.hgetall(`user:attributes:${context.userId}`);
    const attributeValue = userAttributes[condition.field];
    
    if (attributeValue === undefined) {
      return false;
    }
    
    let parsedValue: any;
    try {
      parsedValue = JSON.parse(attributeValue);
    } catch {
      parsedValue = attributeValue;
    }
    
    return this.evaluateValueCondition(condition.operator, parsedValue, condition.value);
  }

  /**
   * Evaluate location condition
   */
  private async evaluateLocationCondition(
    condition: AccessCondition,
    context: PermissionContext
  ): Promise<boolean> {
    // Get location data from context or IP geolocation
    const location = context.attributes?.location || await this.getLocationFromIP(context.ip);
    
    if (!location) {
      return false;
    }
    
    const locationValue = location[condition.field];
    
    if (locationValue === undefined) {
      return false;
    }
    
    return this.evaluateValueCondition(condition.operator, locationValue, condition.value);
  }

  /**
   * Evaluate device condition
   */
  private async evaluateDeviceCondition(
    condition: AccessCondition,
    context: PermissionContext
  ): Promise<boolean> {
    // Get device data from context
    const device = context.attributes?.device;
    
    if (!device) {
      return false;
    }
    
    const deviceValue = device[condition.field];
    
    if (deviceValue === undefined) {
      return false;
    }
    
    return this.evaluateValueCondition(condition.operator, deviceValue, condition.value);
  }

  /**
   * Evaluate risk condition
   */
  private async evaluateRiskCondition(
    condition: AccessCondition,
    context: PermissionContext
  ): Promise<boolean> {
    // Get current risk score for user
    const riskScore = context.attributes?.riskScore || await this.getUserRiskScore(context.userId);
    
    switch (condition.operator) {
      case 'lt':
        return riskScore < condition.value;
      case 'gt':
        return riskScore > condition.value;
      case 'equals':
        return riskScore === condition.value;
      case 'between':
        const [min, max] = condition.value;
        return riskScore >= min && riskScore <= max;
      default:
        return false;
    }
  }

  /**
   * Evaluate custom condition (extensible)
   */
  private async evaluateCustomCondition(
    condition: AccessCondition,
    context: PermissionContext
  ): Promise<boolean> {
    // Custom conditions can be implemented by extending this method
    // For now, return false as a safe default
    console.warn(`Custom condition not implemented: ${condition.field}`);
    return false;
  }

  /**
   * Evaluate value condition with operator
   */
  private evaluateValueCondition(operator: string, actualValue: any, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      case 'contains':
        return typeof actualValue === 'string' && actualValue.includes(expectedValue);
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
      case 'gt':
        return actualValue > expectedValue;
      case 'lt':
        return actualValue < expectedValue;
      case 'between':
        const [min, max] = expectedValue;
        return actualValue >= min && actualValue <= max;
      case 'regex':
        return new RegExp(expectedValue).test(String(actualValue));
      case 'exists':
        return actualValue !== undefined && actualValue !== null;
      default:
        return false;
    }
  }

  /**
   * Get value from context by field name
   */
  private getContextValue(field: string, context: PermissionContext): any {
    switch (field) {
      case 'ip':
        return context.ip;
      case 'user_agent':
        return context.userAgent;
      case 'session_id':
        return context.sessionId;
      case 'environment':
        return context.environment;
      case 'timestamp':
        return context.timestamp;
      default:
        return context.attributes?.[field];
    }
  }

  /**
   * Calculate risk score for a condition
   */
  private calculateConditionRiskScore(condition: AccessCondition, passed: boolean): number {
    let baseScore = 0;
    
    // Risk scoring based on condition type
    switch (condition.type) {
      case 'temporal':
        baseScore = passed ? 0 : 15; // Off-hours access
        break;
      case 'location':
        baseScore = passed ? 0 : 25; // Geographic risk
        break;
      case 'device':
        baseScore = passed ? 0 : 20; // Device trust
        break;
      case 'risk':
        baseScore = passed ? 0 : 30; // Direct risk condition
        break;
      default:
        baseScore = passed ? 0 : 10; // Generic condition
    }
    
    return baseScore;
  }

  /**
   * Apply decision logic to multiple permission evaluations
   */
  private applyPermissionDecisionLogic(evaluationResults: any[]): any {
    // Sort by permission priority (highest first)
    const sortedResults = evaluationResults.sort((a, b) => 
      b.permission.priority - a.permission.priority
    );
    
    // Find highest priority DENY
    const denyResult = sortedResults.find(r => 
      r.permission.effect === 'DENY' && r.evaluation.hasPermission
    );
    
    if (denyResult) {
      return {
        hasPermission: false,
        reason: `Explicit DENY: ${denyResult.evaluation.reason}`,
        appliedPolicies: [denyResult.permission],
        conditions: denyResult.evaluation.conditions || [],
        riskScore: denyResult.evaluation.riskScore || 0,
        recommendedActions: ['Contact administrator for access'],
      };
    }
    
    // Find highest priority ALLOW
    const allowResult = sortedResults.find(r => 
      r.permission.effect === 'ALLOW' && r.evaluation.hasPermission
    );
    
    if (allowResult) {
      return {
        hasPermission: true,
        reason: `Permission granted: ${allowResult.evaluation.reason}`,
        appliedPolicies: [allowResult.permission],
        conditions: allowResult.evaluation.conditions || [],
        riskScore: allowResult.evaluation.riskScore || 10,
        recommendedActions: [],
      };
    }
    
    // No applicable permissions
    const allRiskScores = evaluationResults.map(r => r.evaluation.riskScore || 0);
    const maxRiskScore = Math.max(...allRiskScores, 0);
    
    return {
      hasPermission: false,
      reason: 'No matching permissions or conditions not met',
      appliedPolicies: [],
      conditions: [],
      riskScore: maxRiskScore,
      recommendedActions: ['Request appropriate permissions'],
    };
  }

  /**
   * Check if action matches permission action pattern
   */
  private actionMatches(permissionAction: string, requestedAction: string): boolean {
    if (permissionAction === '*') return true;
    if (permissionAction === requestedAction) return true;
    
    // Check comma-separated actions
    if (permissionAction.includes(',')) {
      const actions = permissionAction.split(',').map(a => a.trim());
      return actions.includes(requestedAction) || actions.includes('*');
    }
    
    // Check wildcard patterns
    const pattern = permissionAction.replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(requestedAction);
  }

  /**
   * Get direct permissions assigned to user
   */
  private async getDirectPermissions(userId: string): Promise<ComputedPermission[]> {
    const permissionsData = await this.redis.hgetall(`user:permissions:${userId}`);
    
    return Object.values(permissionsData).map(data => {
      const permission = JSON.parse(data);
      return {
        ...permission,
        source: {
          type: 'DIRECT',
          id: permission.id,
          name: 'Direct Assignment',
        } as PermissionSource,
      };
    });
  }

  /**
   * Get permissions from user's roles
   */
  private async getRoleBasedPermissions(userId: string): Promise<ComputedPermission[]> {
    // This would integrate with RBACManager
    // For now, return empty array
    return [];
  }

  /**
   * Get permissions from user's groups
   */
  private async getGroupBasedPermissions(userId: string): Promise<ComputedPermission[]> {
    const groupsData = await this.redis.smembers(`user:groups:${userId}`);
    const permissions: ComputedPermission[] = [];
    
    for (const groupId of groupsData) {
      const groupPermissions = await this.redis.hgetall(`group:permissions:${groupId}`);
      
      for (const [permissionId, permissionData] of Object.entries(groupPermissions)) {
        const permission = JSON.parse(permissionData);
        permissions.push({
          ...permission,
          source: {
            type: 'GROUP',
            id: groupId,
            name: `Group: ${groupId}`,
          } as PermissionSource,
        });
      }
    }
    
    return permissions;
  }

  /**
   * Get emergency access permissions
   */
  private async getEmergencyPermissions(userId: string): Promise<ComputedPermission[]> {
    const emergencyAccess = await this.redis.hgetall(`emergency:access:${userId}`);
    const permissions: ComputedPermission[] = [];
    
    for (const [accessId, accessData] of Object.entries(emergencyAccess)) {
      const access: EmergencyAccess = JSON.parse(accessData);
      
      // Check if emergency access is still valid
      if (access.isActive && new Date() >= access.validFrom && new Date() <= access.validTo) {
        for (const permission of access.permissions) {
          permissions.push({
            action: permission.action,
            effect: permission.effect,
            source: {
              type: 'EMERGENCY',
              id: accessId,
              name: 'Emergency Access',
            } as PermissionSource,
            priority: 999, // High priority for emergency access
            conditions: permission.conditions,
            validFrom: access.validFrom,
            validTo: access.validTo,
          });
        }
      }
    }
    
    return permissions;
  }

  /**
   * Remove duplicate permissions (keep highest priority)
   */
  private deduplicatePermissions(permissions: ComputedPermission[]): ComputedPermission[] {
    const permissionMap = new Map<string, ComputedPermission>();
    
    for (const permission of permissions) {
      const key = `${permission.action}:${permission.effect}`;
      const existing = permissionMap.get(key);
      
      if (!existing || permission.priority > existing.priority) {
        permissionMap.set(key, permission);
      }
    }
    
    return Array.from(permissionMap.values());
  }

  /**
   * Get location from IP address (simplified)
   */
  private async getLocationFromIP(ip: string): Promise<any> {
    // In production, integrate with a geolocation service
    return {
      country: 'US',
      region: 'CA',
      city: 'San Francisco',
    };
  }

  /**
   * Get user risk score
   */
  private async getUserRiskScore(userId: string): Promise<number> {
    const scoreData = await this.redis.get(`user:risk-score:${userId}`);
    return scoreData ? parseInt(scoreData, 10) : 0;
  }

  /**
   * Generate cache key for evaluation result
   */
  private generateEvaluationCacheKey(
    permissions: ComputedPermission[],
    action: string,
    context: PermissionContext
  ): string {
    const keyData = {
      permissionIds: permissions.map(p => p.source.id).sort(),
      action,
      userId: context.userId,
      ip: context.ip,
      timestamp: context.timestamp.toISOString().slice(0, 13), // Hour precision
    };
    
    return encryptionService.createHMAC(JSON.stringify(keyData), 'permission-eval');
  }

  /**
   * Cache evaluation result
   */
  private cacheEvaluationResult(key: string, result: PermissionEvaluationResult): void {
    this.permissionCache.set(key, {
      data: result,
      computedAt: new Date(),
      validUntil: new Date(Date.now() + this.config.cache.decisionTTL * 1000),
      hits: 1,
      lastAccessed: new Date(),
    });
    
    // Limit cache size
    if (this.permissionCache.size > this.config.cache.maxSize) {
      const oldestKey = Array.from(this.permissionCache.entries())
        .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime())[0][0];
      this.permissionCache.delete(oldestKey);
    }
  }

  /**
   * Start cache cleanup task
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = new Date();
    
    // Clean permission cache
    for (const [key, entry] of this.permissionCache.entries()) {
      if (entry.validUntil <= now) {
        this.permissionCache.delete(key);
      }
    }
    
    // Clean temporal cache
    for (const [key, entry] of this.temporalCache.entries()) {
      if (entry.validUntil <= now) {
        this.temporalCache.delete(key);
      }
    }
  }

  /**
   * Log permission evaluation for audit
   */
  private async logPermissionEvaluation(
    userId: string,
    action: string,
    result: PermissionEvaluationResult,
    duration: number
  ): Promise<void> {
    const logEntry = {
      id: encryptionService.generateUUID(),
      userId,
      action,
      hasPermission: result.hasPermission,
      reason: result.reason,
      riskScore: result.riskScore,
      duration,
      timestamp: new Date(),
    };
    
    await this.redis.lpush('permission:evaluation:log', JSON.stringify(logEntry));
    
    // Keep only recent logs
    await this.redis.ltrim('permission:evaluation:log', 0, 9999);
  }

  /**
   * Register custom condition evaluator
   */
  registerConditionEvaluator(
    type: string,
    evaluator: (condition: AccessCondition, context: PermissionContext) => Promise<boolean>
  ): void {
    this.conditionEvaluators.set(type, evaluator);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return {
      permission: {
        size: this.permissionCache.size,
        hitRate: this.calculateHitRate(this.permissionCache),
      },
      temporal: {
        size: this.temporalCache.size,
        hitRate: this.calculateHitRate(this.temporalCache),
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
      totalAccesses += entry.hits;
    }
    
    return totalAccesses > 0 ? totalHits / totalAccesses : 0;
  }
}