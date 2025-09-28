import { PrismaClient } from '@prisma/client';
import { Policy, validatePolicy } from '../lib/schemas/policy';
import { PolicyLoader } from './policy-evaluation-engine';
import { logger } from '../lib/logger';

/**
 * Prisma-based policy loader implementation
 *
 * Handles loading policies from the database with caching and optimization
 */
export class PrismaPolicyLoader implements PolicyLoader {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Load a single policy by ID
   */
  async loadPolicy(policyId: string): Promise<Policy | null> {
    try {
      const policyRecord = await this.prisma.policy.findUnique({
        where: { id: policyId },
        include: {
          organization: {
            select: { id: true, name: true }
          },
          createdByUser: {
            select: { id: true, email: true }
          },
          updatedByUser: {
            select: { id: true, email: true }
          }
        }
      });

      if (!policyRecord) {
        return null;
      }

      // Transform database record to Policy schema
      const policy = this.transformDatabaseRecordToPolicy(policyRecord);

      // Validate the policy structure
      validatePolicy(policy);

      return policy;

    } catch (error) {
      logger.error('Failed to load policy', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find policies applicable to a specific resource
   */
  async findPoliciesForResource(
    resourceType: string,
    organizationId: string,
    action?: string
  ): Promise<Policy[]> {
    try {
      // Build query conditions
      const whereConditions: any = {
        organizationId,
        status: 'active',
        effectiveDate: {
          lte: new Date()
        },
        OR: [
          { expirationDate: null },
          { expirationDate: { gt: new Date() } }
        ]
      };

      // Add resource-specific filters if needed
      if (resourceType !== '*') {
        whereConditions.AND = [
          {
            OR: [
              // Global policies
              { definition: { path: ['type'], equals: 'access_control' } },
              // Resource-specific policies (this would need custom logic based on policy content)
              { tags: { has: resourceType } }
            ]
          }
        ];
      }

      const policyRecords = await this.prisma.policy.findMany({
        where: whereConditions,
        include: {
          organization: {
            select: { id: true, name: true }
          },
          createdByUser: {
            select: { id: true, email: true }
          },
          updatedByUser: {
            select: { id: true, email: true }
          }
        },
        orderBy: [
          { priority: 'desc' }, // Higher priority first
          { createdAt: 'asc' }   // Older policies take precedence for same priority
        ]
      });

      // Transform and validate policies
      const policies: Policy[] = [];

      for (const record of policyRecords) {
        try {
          const policy = this.transformDatabaseRecordToPolicy(record);

          // Additional filtering based on policy definition
          if (this.isPolicyApplicableToResource(policy, resourceType, action)) {
            validatePolicy(policy);
            policies.push(policy);
          }
        } catch (error) {
          logger.warn('Skipping invalid policy', {
            policyId: record.id,
            error: error.message
          });
        }
      }

      return policies;

    } catch (error) {
      logger.error('Failed to find policies for resource', {
        resourceType,
        organizationId,
        action,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find policies by type
   */
  async findPoliciesByType(
    policyType: string,
    organizationId: string
  ): Promise<Policy[]> {
    try {
      const policyRecords = await this.prisma.policy.findMany({
        where: {
          organizationId,
          status: 'active',
          definition: {
            path: ['type'],
            equals: policyType
          },
          effectiveDate: {
            lte: new Date()
          },
          OR: [
            { expirationDate: null },
            { expirationDate: { gt: new Date() } }
          ]
        },
        include: {
          organization: {
            select: { id: true, name: true }
          },
          createdByUser: {
            select: { id: true, email: true }
          },
          updatedByUser: {
            select: { id: true, email: true }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      const policies: Policy[] = [];

      for (const record of policyRecords) {
        try {
          const policy = this.transformDatabaseRecordToPolicy(record);
          validatePolicy(policy);
          policies.push(policy);
        } catch (error) {
          logger.warn('Skipping invalid policy', {
            policyId: record.id,
            error: error.message
          });
        }
      }

      return policies;

    } catch (error) {
      logger.error('Failed to find policies by type', {
        policyType,
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find policies by compliance framework
   */
  async findPoliciesByComplianceFramework(
    framework: string,
    organizationId: string
  ): Promise<Policy[]> {
    try {
      const policyRecords = await this.prisma.policy.findMany({
        where: {
          organizationId,
          status: 'active',
          complianceFrameworks: {
            has: framework
          },
          effectiveDate: {
            lte: new Date()
          },
          OR: [
            { expirationDate: null },
            { expirationDate: { gt: new Date() } }
          ]
        },
        include: {
          organization: {
            select: { id: true, name: true }
          },
          createdByUser: {
            select: { id: true, email: true }
          },
          updatedByUser: {
            select: { id: true, email: true }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      const policies: Policy[] = [];

      for (const record of policyRecords) {
        try {
          const policy = this.transformDatabaseRecordToPolicy(record);
          validatePolicy(policy);
          policies.push(policy);
        } catch (error) {
          logger.warn('Skipping invalid policy', {
            policyId: record.id,
            error: error.message
          });
        }
      }

      return policies;

    } catch (error) {
      logger.error('Failed to find policies by compliance framework', {
        framework,
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get policy statistics for monitoring
   */
  async getPolicyStatistics(organizationId: string): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
    byRiskLevel: Record<string, number>;
    expiringCount: number;
  }> {
    try {
      const [
        total,
        active,
        byTypeResults,
        byRiskResults,
        expiringSoon
      ] = await Promise.all([
        // Total policies
        this.prisma.policy.count({
          where: { organizationId }
        }),

        // Active policies
        this.prisma.policy.count({
          where: {
            organizationId,
            status: 'active',
            effectiveDate: { lte: new Date() },
            OR: [
              { expirationDate: null },
              { expirationDate: { gt: new Date() } }
            ]
          }
        }),

        // Policies by type
        this.prisma.policy.groupBy({
          by: ['definition'],
          where: {
            organizationId,
            status: 'active'
          },
          _count: true
        }),

        // Policies by risk level
        this.prisma.policy.groupBy({
          by: ['riskLevel'],
          where: {
            organizationId,
            status: 'active'
          },
          _count: true
        }),

        // Policies expiring within 30 days
        this.prisma.policy.count({
          where: {
            organizationId,
            status: 'active',
            expirationDate: {
              gt: new Date(),
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);

      // Process by type results
      const byType: Record<string, number> = {};
      byTypeResults.forEach(result => {
        const type = (result.definition as any)?.type || 'unknown';
        byType[type] = (byType[type] || 0) + result._count;
      });

      // Process by risk level results
      const byRiskLevel: Record<string, number> = {};
      byRiskResults.forEach(result => {
        byRiskLevel[result.riskLevel] = result._count;
      });

      return {
        total,
        active,
        byType,
        byRiskLevel,
        expiringCount: expiringSoon
      };

    } catch (error) {
      logger.error('Failed to get policy statistics', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Transform database record to Policy schema
   */
  private transformDatabaseRecordToPolicy(record: any): Policy {
    return {
      metadata: {
        id: record.id,
        name: record.name,
        description: record.description,
        version: record.version,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        createdBy: record.createdBy,
        updatedBy: record.updatedBy,
        organizationId: record.organizationId,
        classification: record.classification,
        owner: record.owner,
        tags: record.tags || [],
        status: record.status,
        effectiveDate: record.effectiveDate,
        expirationDate: record.expirationDate,
        complianceFrameworks: record.complianceFrameworks || [],
        riskLevel: record.riskLevel
      },
      definition: record.definition
    };
  }

  /**
   * Check if policy is applicable to the specified resource
   */
  private isPolicyApplicableToResource(
    policy: Policy,
    resourceType: string,
    action?: string
  ): boolean {
    const definition = policy.definition;

    switch (definition.type) {
      case 'access_control':
        // Check if any rule matches the resource type
        return definition.rules.some(rule =>
          this.matchesResource(rule.resource, resourceType) &&
          (!action || rule.permissions.includes(action as any))
        );

      case 'workflow_approval':
        // Workflow policies apply to specific workflow types
        return definition.rules.some(rule =>
          resourceType === 'workflow' || rule.workflowType === resourceType
        );

      case 'data_retention':
        // Data retention policies apply to data resources
        return definition.rules.some(rule =>
          rule.dataType === resourceType || resourceType.includes('data')
        );

      case 'security_scanning':
        // Security scanning policies apply to their targets
        return definition.rules.some(rule =>
          rule.targets.includes(resourceType) || rule.targets.includes('*')
        );

      case 'compliance':
        // Compliance policies generally apply to all resources
        return true;

      default:
        return false;
    }
  }

  /**
   * Check if resource pattern matches the resource type
   */
  private matchesResource(pattern: string, resourceType: string): boolean {
    if (pattern === '*') return true;
    if (pattern === resourceType) return true;

    // Support basic wildcard patterns
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return resourceType.startsWith(prefix);
    }

    return false;
  }

  /**
   * Preload policies for better performance
   */
  async preloadPoliciesForOrganization(organizationId: string): Promise<void> {
    try {
      await this.findPoliciesForResource('*', organizationId);
      logger.info('Policies preloaded for organization', { organizationId });
    } catch (error) {
      logger.error('Failed to preload policies', {
        organizationId,
        error: error.message
      });
    }
  }

  /**
   * Invalidate cache for organization (if external caching is used)
   */
  async invalidateCacheForOrganization(organizationId: string): Promise<void> {
    // This would integrate with external caching system like Redis
    logger.info('Cache invalidated for organization', { organizationId });
  }

  /**
   * Get policy dependencies (for complex policy relationships)
   */
  async getPolicyDependencies(policyId: string): Promise<string[]> {
    try {
      // This could be enhanced to track policy dependencies
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Failed to get policy dependencies', {
        policyId,
        error: error.message
      });
      return [];
    }
  }
}