import { z } from 'zod';
import { Logger } from '../lib/logger';
import type { CompleteEnhancedPolicy } from '../lib/schemas/enhanced-policy-schemas';
import type { PolicyConflict, PolicyImpactAnalysis } from './policy-conflict-detection';

// Visualization Schemas
export const PolicyGraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['POLICY', 'RULE', 'CONDITION', 'RESOURCE', 'USER_GROUP']),
  label: z.string(),
  metadata: z.object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'CONFLICTED', 'DEPRECATED']),
    priority: z.number().optional(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    complianceFrameworks: z.array(z.string()).optional(),
    lastModified: z.date().optional(),
    conflictCount: z.number().default(0),
    description: z.string().optional()
  }),
  position: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  style: z.object({
    color: z.string(),
    shape: z.enum(['circle', 'rectangle', 'diamond', 'triangle']),
    size: z.number(),
    borderColor: z.string().optional(),
    borderWidth: z.number().optional()
  })
});

export const PolicyGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.enum([
    'DEPENDS_ON',
    'CONFLICTS_WITH',
    'IMPLIES',
    'OVERRIDES',
    'APPLIES_TO',
    'INHERITS_FROM',
    'REFERENCES'
  ]),
  metadata: z.object({
    strength: z.number().min(0).max(1),
    conflictSeverity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    description: z.string().optional(),
    bidirectional: z.boolean().default(false)
  }),
  style: z.object({
    color: z.string(),
    width: z.number(),
    pattern: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
    arrowType: z.enum(['none', 'arrow', 'double_arrow']).default('arrow')
  })
});

export const PolicyVisualizationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  type: z.enum([
    'POLICY_OVERVIEW',
    'CONFLICT_ANALYSIS',
    'DEPENDENCY_GRAPH',
    'COMPLIANCE_MAP',
    'IMPACT_ANALYSIS',
    'TIMELINE_VIEW'
  ]),
  nodes: z.array(PolicyGraphNodeSchema),
  edges: z.array(PolicyGraphEdgeSchema),
  layout: z.object({
    algorithm: z.enum(['force_directed', 'hierarchical', 'circular', 'grid']),
    orientation: z.enum(['horizontal', 'vertical']).optional(),
    grouping: z.object({
      enabled: z.boolean(),
      criteria: z.enum(['compliance_framework', 'priority', 'status', 'conflict_severity'])
    }).optional()
  }),
  filters: z.object({
    showInactive: z.boolean().default(false),
    minPriority: z.number().optional(),
    conflictSeverity: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])).optional(),
    complianceFrameworks: z.array(z.string()).optional(),
    nodeTypes: z.array(PolicyGraphNodeSchema.shape.type).optional()
  }),
  metadata: z.object({
    createdAt: z.date(),
    updatedAt: z.date(),
    version: z.string(),
    autoRefresh: z.boolean().default(true),
    refreshInterval: z.number().default(300) // 5 minutes
  })
});

export const ConflictVisualizationSchema = z.object({
  conflictId: z.string(),
  visualization: PolicyVisualizationSchema,
  analysisData: z.object({
    affectedPolicies: z.array(z.string()),
    conflictType: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    resolutionStrategies: z.array(z.object({
      id: z.string(),
      name: z.string(),
      confidence: z.number(),
      visualizationHints: z.array(z.string())
    })),
    impactRadius: z.number(),
    criticalPath: z.array(z.string())
  })
});

export type PolicyGraphNode = z.infer<typeof PolicyGraphNodeSchema>;
export type PolicyGraphEdge = z.infer<typeof PolicyGraphEdgeSchema>;
export type PolicyVisualization = z.infer<typeof PolicyVisualizationSchema>;
export type ConflictVisualization = z.infer<typeof ConflictVisualizationSchema>;

interface VisualizationOptions {
  includeInactivePolicies?: boolean;
  maxDepth?: number;
  focusOnConflicts?: boolean;
  groupByFramework?: boolean;
  showImpactRadius?: boolean;
  layout?: 'force_directed' | 'hierarchical' | 'circular' | 'grid';
}

export class PolicyVisualizationService {
  private logger: Logger;
  private visualizationCache: Map<string, PolicyVisualization> = new Map();
  private colorSchemes = {
    status: {
      ACTIVE: '#10B981',     // Green
      INACTIVE: '#6B7280',   // Gray
      CONFLICTED: '#EF4444', // Red
      DEPRECATED: '#F59E0B'  // Amber
    },
    severity: {
      LOW: '#10B981',      // Green
      MEDIUM: '#F59E0B',   // Amber
      HIGH: '#EF4444',     // Red
      CRITICAL: '#7C2D12'  // Dark Red
    },
    priority: {
      1: '#7C2D12',  // Highest priority - Dark Red
      2: '#EF4444',  // High priority - Red
      3: '#F59E0B',  // Medium priority - Amber
      4: '#10B981',  // Low priority - Green
      5: '#6B7280'   // Lowest priority - Gray
    }
  };

  constructor() {
    this.logger = new Logger('PolicyVisualization');
  }

  /**
   * Generate policy overview visualization
   */
  async generatePolicyOverview(
    policies: CompleteEnhancedPolicy[],
    options: VisualizationOptions = {}
  ): Promise<PolicyVisualization> {
    try {
      const {
        includeInactivePolicies = false,
        groupByFramework = true,
        layout = 'force_directed'
      } = options;

      // Filter policies
      const activePolicies = policies.filter(policy =>
        includeInactivePolicies || policy.metadata.status === 'ACTIVE'
      );

      // Generate nodes
      const nodes = await this.generatePolicyNodes(activePolicies);

      // Generate edges for dependencies
      const edges = await this.generateDependencyEdges(activePolicies);

      // Create visualization
      const visualization: PolicyVisualization = {
        id: crypto.randomUUID(),
        title: 'Policy Overview',
        description: `Overview of ${activePolicies.length} policies and their relationships`,
        type: 'POLICY_OVERVIEW',
        nodes,
        edges,
        layout: {
          algorithm: layout,
          grouping: groupByFramework ? {
            enabled: true,
            criteria: 'compliance_framework'
          } : undefined
        },
        filters: {
          showInactive: includeInactivePolicies,
          nodeTypes: ['POLICY']
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          autoRefresh: true,
          refreshInterval: 300
        }
      };

      this.cacheVisualization(visualization);
      return visualization;

    } catch (error) {
      this.logger.error('Error generating policy overview', { error });
      throw error;
    }
  }

  /**
   * Generate conflict analysis visualization
   */
  async generateConflictVisualization(
    conflicts: PolicyConflict[],
    policies: CompleteEnhancedPolicy[],
    options: VisualizationOptions = {}
  ): Promise<ConflictVisualization[]> {
    try {
      const {
        focusOnConflicts = true,
        showImpactRadius = true,
        layout = 'force_directed'
      } = options;

      const conflictVisualizations: ConflictVisualization[] = [];

      for (const conflict of conflicts) {
        // Get affected policies
        const affectedPolicies = policies.filter(policy =>
          conflict.affectedPolicies.includes(policy.metadata.id)
        );

        // Generate nodes for affected policies and their neighbors
        const nodes = await this.generateConflictNodes(
          conflict,
          affectedPolicies,
          policies,
          showImpactRadius
        );

        // Generate edges showing conflicts and dependencies
        const edges = await this.generateConflictEdges(
          conflict,
          affectedPolicies,
          policies
        );

        // Create visualization
        const visualization: PolicyVisualization = {
          id: crypto.randomUUID(),
          title: `Conflict Analysis: ${conflict.type}`,
          description: conflict.description,
          type: 'CONFLICT_ANALYSIS',
          nodes,
          edges,
          layout: {
            algorithm: layout,
            grouping: {
              enabled: true,
              criteria: 'conflict_severity'
            }
          },
          filters: {
            showInactive: false,
            conflictSeverity: [conflict.severity]
          },
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            autoRefresh: true,
            refreshInterval: 60 // More frequent updates for conflicts
          }
        };

        // Calculate impact radius and critical path
        const impactRadius = this.calculateImpactRadius(conflict, policies);
        const criticalPath = this.findCriticalPath(conflict, affectedPolicies);

        const conflictVisualization: ConflictVisualization = {
          conflictId: conflict.id,
          visualization,
          analysisData: {
            affectedPolicies: conflict.affectedPolicies,
            conflictType: conflict.type,
            severity: conflict.severity,
            resolutionStrategies: conflict.resolutionStrategies.map(strategy => ({
              id: strategy.id,
              name: strategy.name,
              confidence: strategy.confidence,
              visualizationHints: this.generateVisualizationHints(strategy)
            })),
            impactRadius,
            criticalPath
          }
        };

        conflictVisualizations.push(conflictVisualization);
      }

      return conflictVisualizations;

    } catch (error) {
      this.logger.error('Error generating conflict visualization', { error });
      throw error;
    }
  }

  /**
   * Generate dependency graph visualization
   */
  async generateDependencyGraph(
    policies: CompleteEnhancedPolicy[],
    options: VisualizationOptions = {}
  ): Promise<PolicyVisualization> {
    try {
      const {
        maxDepth = 3,
        layout = 'hierarchical'
      } = options;

      // Generate nodes with dependency information
      const nodes = await this.generateDependencyNodes(policies, maxDepth);

      // Generate edges showing all dependency relationships
      const edges = await this.generateAllDependencyEdges(policies);

      // Detect circular dependencies
      const circularDependencies = this.detectCircularDependencies(policies);
      if (circularDependencies.length > 0) {
        // Add special styling for circular dependencies
        this.highlightCircularDependencies(nodes, edges, circularDependencies);
      }

      const visualization: PolicyVisualization = {
        id: crypto.randomUUID(),
        title: 'Policy Dependency Graph',
        description: `Dependency relationships between ${policies.length} policies`,
        type: 'DEPENDENCY_GRAPH',
        nodes,
        edges,
        layout: {
          algorithm: layout,
          orientation: 'horizontal'
        },
        filters: {
          showInactive: false,
          nodeTypes: ['POLICY']
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          autoRefresh: true,
          refreshInterval: 300
        }
      };

      this.cacheVisualization(visualization);
      return visualization;

    } catch (error) {
      this.logger.error('Error generating dependency graph', { error });
      throw error;
    }
  }

  /**
   * Generate compliance mapping visualization
   */
  async generateComplianceMap(
    policies: CompleteEnhancedPolicy[],
    frameworks: string[],
    options: VisualizationOptions = {}
  ): Promise<PolicyVisualization> {
    try {
      const { layout = 'grid' } = options;

      // Group policies by compliance framework
      const frameworkGroups = this.groupPoliciesByFramework(policies, frameworks);

      // Generate nodes for frameworks and policies
      const nodes: PolicyGraphNode[] = [];
      const edges: PolicyGraphEdge[] = [];

      // Create framework nodes
      for (const framework of frameworks) {
        nodes.push({
          id: `framework-${framework}`,
          type: 'RESOURCE',
          label: framework,
          metadata: {
            status: 'ACTIVE',
            description: `Compliance framework: ${framework}`,
            conflictCount: 0
          },
          style: {
            color: '#3B82F6',
            shape: 'rectangle',
            size: 40,
            borderColor: '#1E40AF',
            borderWidth: 2
          }
        });
      }

      // Create policy nodes and edges to frameworks
      for (const [framework, frameworkPolicies] of frameworkGroups.entries()) {
        for (const policy of frameworkPolicies) {
          const node: PolicyGraphNode = {
            id: policy.metadata.id,
            type: 'POLICY',
            label: policy.metadata.name,
            metadata: {
              status: policy.metadata.status as any,
              priority: policy.metadata.priority,
              riskLevel: this.calculatePolicyRiskLevel(policy),
              complianceFrameworks: policy.metadata.complianceFrameworks,
              lastModified: new Date(policy.metadata.lastModified),
              conflictCount: 0,
              description: policy.metadata.description
            },
            style: {
              color: this.colorSchemes.status[policy.metadata.status as keyof typeof this.colorSchemes.status],
              shape: 'circle',
              size: 25
            }
          };

          nodes.push(node);

          // Create edge to framework
          edges.push({
            id: `${policy.metadata.id}-${framework}`,
            source: policy.metadata.id,
            target: `framework-${framework}`,
            type: 'APPLIES_TO',
            metadata: {
              strength: 1.0,
              description: `Policy applies to ${framework} compliance`
            },
            style: {
              color: '#6B7280',
              width: 2,
              pattern: 'solid'
            }
          });
        }
      }

      const visualization: PolicyVisualization = {
        id: crypto.randomUUID(),
        title: 'Compliance Framework Mapping',
        description: `Policy mapping across ${frameworks.length} compliance frameworks`,
        type: 'COMPLIANCE_MAP',
        nodes,
        edges,
        layout: {
          algorithm: layout,
          grouping: {
            enabled: true,
            criteria: 'compliance_framework'
          }
        },
        filters: {
          showInactive: false,
          complianceFrameworks: frameworks
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          autoRefresh: true,
          refreshInterval: 600 // 10 minutes
        }
      };

      this.cacheVisualization(visualization);
      return visualization;

    } catch (error) {
      this.logger.error('Error generating compliance map', { error });
      throw error;
    }
  }

  /**
   * Generate impact analysis visualization
   */
  async generateImpactAnalysis(
    impactAnalysis: PolicyImpactAnalysis,
    policies: CompleteEnhancedPolicy[],
    options: VisualizationOptions = {}
  ): Promise<PolicyVisualization> {
    try {
      const { showImpactRadius = true, layout = 'force_directed' } = options;

      const targetPolicy = policies.find(p => p.metadata.id === impactAnalysis.policyId);
      if (!targetPolicy) {
        throw new Error(`Target policy ${impactAnalysis.policyId} not found`);
      }

      // Generate nodes showing impact areas
      const nodes: PolicyGraphNode[] = [];
      const edges: PolicyGraphEdge[] = [];

      // Central policy node
      nodes.push({
        id: targetPolicy.metadata.id,
        type: 'POLICY',
        label: targetPolicy.metadata.name,
        metadata: {
          status: 'ACTIVE',
          riskLevel: impactAnalysis.riskAssessment.overallRisk as any,
          description: `Target policy for ${impactAnalysis.changeType} operation`,
          conflictCount: impactAnalysis.predictedConflicts.length
        },
        style: {
          color: this.colorSchemes.severity[impactAnalysis.riskAssessment.overallRisk as keyof typeof this.colorSchemes.severity],
          shape: 'diamond',
          size: 35,
          borderColor: '#000000',
          borderWidth: 3
        }
      });

      // Impact area nodes
      for (const impactArea of impactAnalysis.impactAreas) {
        nodes.push({
          id: `impact-${impactArea.area}`,
          type: 'RESOURCE',
          label: impactArea.area.replace('_', ' '),
          metadata: {
            status: 'ACTIVE',
            riskLevel: impactArea.impactLevel as any,
            description: impactArea.description,
            conflictCount: 0
          },
          style: {
            color: this.colorSchemes.severity[impactArea.impactLevel as keyof typeof this.colorSchemes.severity],
            shape: 'rectangle',
            size: 30
          }
        });

        // Edge from policy to impact area
        edges.push({
          id: `${targetPolicy.metadata.id}-impact-${impactArea.area}`,
          source: targetPolicy.metadata.id,
          target: `impact-${impactArea.area}`,
          type: 'IMPLIES',
          metadata: {
            strength: this.getImpactStrength(impactArea.impactLevel),
            description: `Change will impact ${impactArea.area}`
          },
          style: {
            color: this.colorSchemes.severity[impactArea.impactLevel as keyof typeof this.colorSchemes.severity],
            width: this.getImpactStrength(impactArea.impactLevel) * 4,
            pattern: impactArea.mitigationRequired ? 'dashed' : 'solid'
          }
        });
      }

      // Predicted conflict nodes
      for (const conflict of impactAnalysis.predictedConflicts) {
        nodes.push({
          id: `conflict-${conflict.id}`,
          type: 'POLICY',
          label: `Conflict: ${conflict.type}`,
          metadata: {
            status: 'CONFLICTED',
            riskLevel: conflict.severity as any,
            description: conflict.description,
            conflictCount: 1
          },
          style: {
            color: this.colorSchemes.severity[conflict.severity as keyof typeof this.colorSchemes.severity],
            shape: 'triangle',
            size: 25
          }
        });

        // Edge from policy to conflict
        edges.push({
          id: `${targetPolicy.metadata.id}-conflict-${conflict.id}`,
          source: targetPolicy.metadata.id,
          target: `conflict-${conflict.id}`,
          type: 'CONFLICTS_WITH',
          metadata: {
            strength: 1.0,
            conflictSeverity: conflict.severity,
            description: `Predicted conflict: ${conflict.description}`
          },
          style: {
            color: '#EF4444',
            width: 3,
            pattern: 'dashed',
            arrowType: 'double_arrow'
          }
        });
      }

      const visualization: PolicyVisualization = {
        id: crypto.randomUUID(),
        title: `Impact Analysis: ${impactAnalysis.changeType} ${targetPolicy.metadata.name}`,
        description: `Impact analysis for ${impactAnalysis.changeType} operation on policy`,
        type: 'IMPACT_ANALYSIS',
        nodes,
        edges,
        layout: {
          algorithm: layout
        },
        filters: {
          showInactive: false
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          autoRefresh: false,
          refreshInterval: 0
        }
      };

      return visualization;

    } catch (error) {
      this.logger.error('Error generating impact analysis visualization', { error });
      throw error;
    }
  }

  // Private helper methods

  private async generatePolicyNodes(policies: CompleteEnhancedPolicy[]): Promise<PolicyGraphNode[]> {
    return policies.map(policy => ({
      id: policy.metadata.id,
      type: 'POLICY',
      label: policy.metadata.name,
      metadata: {
        status: policy.metadata.status as any,
        priority: policy.metadata.priority,
        riskLevel: this.calculatePolicyRiskLevel(policy),
        complianceFrameworks: policy.metadata.complianceFrameworks,
        lastModified: new Date(policy.metadata.lastModified),
        conflictCount: 0,
        description: policy.metadata.description
      },
      style: {
        color: this.colorSchemes.status[policy.metadata.status as keyof typeof this.colorSchemes.status],
        shape: 'circle',
        size: 20 + (policy.metadata.priority * 5)
      }
    }));
  }

  private async generateDependencyEdges(policies: CompleteEnhancedPolicy[]): Promise<PolicyGraphEdge[]> {
    const edges: PolicyGraphEdge[] = [];

    for (const policy of policies) {
      if (policy.metadata.dependencies) {
        for (const depId of policy.metadata.dependencies) {
          edges.push({
            id: `${policy.metadata.id}-depends-${depId}`,
            source: policy.metadata.id,
            target: depId,
            type: 'DEPENDS_ON',
            metadata: {
              strength: 1.0,
              description: `${policy.metadata.name} depends on policy ${depId}`
            },
            style: {
              color: '#6B7280',
              width: 2,
              pattern: 'solid'
            }
          });
        }
      }
    }

    return edges;
  }

  private async generateConflictNodes(
    conflict: PolicyConflict,
    affectedPolicies: CompleteEnhancedPolicy[],
    allPolicies: CompleteEnhancedPolicy[],
    showImpactRadius: boolean
  ): Promise<PolicyGraphNode[]> {
    const nodes: PolicyGraphNode[] = [];

    // Add directly affected policies
    for (const policy of affectedPolicies) {
      nodes.push({
        id: policy.metadata.id,
        type: 'POLICY',
        label: policy.metadata.name,
        metadata: {
          status: 'CONFLICTED',
          priority: policy.metadata.priority,
          riskLevel: conflict.severity as any,
          conflictCount: 1,
          description: policy.metadata.description
        },
        style: {
          color: this.colorSchemes.severity[conflict.severity as keyof typeof this.colorSchemes.severity],
          shape: 'circle',
          size: 30,
          borderColor: '#EF4444',
          borderWidth: 3
        }
      });
    }

    // Add impact radius nodes if requested
    if (showImpactRadius) {
      const impactedPolicies = this.findImpactedPolicies(affectedPolicies, allPolicies);
      for (const policy of impactedPolicies) {
        if (!affectedPolicies.includes(policy)) {
          nodes.push({
            id: policy.metadata.id,
            type: 'POLICY',
            label: policy.metadata.name,
            metadata: {
              status: policy.metadata.status as any,
              priority: policy.metadata.priority,
              riskLevel: 'MEDIUM',
              conflictCount: 0,
              description: 'Potentially impacted by conflict'
            },
            style: {
              color: '#F59E0B',
              shape: 'circle',
              size: 20
            }
          });
        }
      }
    }

    return nodes;
  }

  private async generateConflictEdges(
    conflict: PolicyConflict,
    affectedPolicies: CompleteEnhancedPolicy[],
    allPolicies: CompleteEnhancedPolicy[]
  ): Promise<PolicyGraphEdge[]> {
    const edges: PolicyGraphEdge[] = [];

    // Add conflict edges between affected policies
    for (let i = 0; i < affectedPolicies.length; i++) {
      for (let j = i + 1; j < affectedPolicies.length; j++) {
        edges.push({
          id: `conflict-${affectedPolicies[i].metadata.id}-${affectedPolicies[j].metadata.id}`,
          source: affectedPolicies[i].metadata.id,
          target: affectedPolicies[j].metadata.id,
          type: 'CONFLICTS_WITH',
          metadata: {
            strength: 1.0,
            conflictSeverity: conflict.severity,
            description: conflict.description
          },
          style: {
            color: this.colorSchemes.severity[conflict.severity as keyof typeof this.colorSchemes.severity],
            width: 4,
            pattern: 'dashed',
            arrowType: 'double_arrow'
          }
        });
      }
    }

    // Add dependency edges
    const dependencyEdges = await this.generateDependencyEdges(allPolicies);
    edges.push(...dependencyEdges);

    return edges;
  }

  private calculatePolicyRiskLevel(policy: CompleteEnhancedPolicy): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // Simple risk calculation based on policy characteristics
    let riskScore = 0;

    // High priority policies are higher risk
    if (policy.metadata.priority >= 9) riskScore += 3;
    else if (policy.metadata.priority >= 7) riskScore += 2;
    else if (policy.metadata.priority >= 5) riskScore += 1;

    // More rules = higher complexity = higher risk
    if (policy.rules.length > 10) riskScore += 2;
    else if (policy.rules.length > 5) riskScore += 1;

    // Multiple compliance frameworks = higher risk
    if (policy.metadata.complianceFrameworks.length > 2) riskScore += 1;

    if (riskScore >= 5) return 'CRITICAL';
    if (riskScore >= 3) return 'HIGH';
    if (riskScore >= 1) return 'MEDIUM';
    return 'LOW';
  }

  private calculateImpactRadius(conflict: PolicyConflict, policies: CompleteEnhancedPolicy[]): number {
    // Calculate how many policies are potentially affected
    const directlyAffected = conflict.affectedPolicies.length;
    const impactedPolicies = this.findImpactedPolicies(
      policies.filter(p => conflict.affectedPolicies.includes(p.metadata.id)),
      policies
    );
    return directlyAffected + impactedPolicies.length;
  }

  private findImpactedPolicies(
    affectedPolicies: CompleteEnhancedPolicy[],
    allPolicies: CompleteEnhancedPolicy[]
  ): CompleteEnhancedPolicy[] {
    const impacted: CompleteEnhancedPolicy[] = [];
    const affectedIds = new Set(affectedPolicies.map(p => p.metadata.id));

    for (const policy of allPolicies) {
      if (!affectedIds.has(policy.metadata.id)) {
        // Check if this policy depends on any affected policies
        if (policy.metadata.dependencies?.some(depId => affectedIds.has(depId))) {
          impacted.push(policy);
        }
      }
    }

    return impacted;
  }

  private findCriticalPath(conflict: PolicyConflict, affectedPolicies: CompleteEnhancedPolicy[]): string[] {
    // Simple implementation - return chain of highest priority policies
    return affectedPolicies
      .sort((a, b) => b.metadata.priority - a.metadata.priority)
      .map(p => p.metadata.id);
  }

  private generateVisualizationHints(strategy: PolicyConflict['resolutionStrategies'][0]): string[] {
    const hints: string[] = [];

    if (strategy.confidence > 80) {
      hints.push('high_confidence');
    }
    if (strategy.automatable) {
      hints.push('automatable');
    }
    if (strategy.estimatedImpact === 'LOW') {
      hints.push('low_impact');
    }
    if (strategy.rollbackPossible) {
      hints.push('reversible');
    }

    return hints;
  }

  private generateDependencyNodes(policies: CompleteEnhancedPolicy[], maxDepth: number): Promise<PolicyGraphNode[]> {
    return this.generatePolicyNodes(policies);
  }

  private generateAllDependencyEdges(policies: CompleteEnhancedPolicy[]): Promise<PolicyGraphEdge[]> {
    return this.generateDependencyEdges(policies);
  }

  private detectCircularDependencies(policies: CompleteEnhancedPolicy[]): string[][] {
    // Implementation of cycle detection
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const policy of policies) {
      if (!visited.has(policy.metadata.id)) {
        const cycle = this.detectCycleDFS(policy.metadata.id, policies, visited, recursionStack, []);
        if (cycle) {
          cycles.push(cycle);
        }
      }
    }

    return cycles;
  }

  private detectCycleDFS(
    policyId: string,
    policies: CompleteEnhancedPolicy[],
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[]
  ): string[] | null {
    visited.add(policyId);
    recursionStack.add(policyId);
    path.push(policyId);

    const policy = policies.find(p => p.metadata.id === policyId);
    if (policy && policy.metadata.dependencies) {
      for (const depId of policy.metadata.dependencies) {
        if (!visited.has(depId)) {
          const cycle = this.detectCycleDFS(depId, policies, visited, recursionStack, [...path]);
          if (cycle) return cycle;
        } else if (recursionStack.has(depId)) {
          // Found cycle
          const cycleStart = path.indexOf(depId);
          return path.slice(cycleStart);
        }
      }
    }

    recursionStack.delete(policyId);
    return null;
  }

  private highlightCircularDependencies(
    nodes: PolicyGraphNode[],
    edges: PolicyGraphEdge[],
    circularDependencies: string[][]
  ): void {
    const cyclePolicyIds = new Set(circularDependencies.flat());

    // Highlight nodes in cycles
    for (const node of nodes) {
      if (cyclePolicyIds.has(node.id)) {
        node.style.borderColor = '#DC2626';
        node.style.borderWidth = 3;
        node.metadata.status = 'CONFLICTED';
      }
    }

    // Highlight edges in cycles
    for (const edge of edges) {
      if (cyclePolicyIds.has(edge.source) && cyclePolicyIds.has(edge.target)) {
        edge.style.color = '#DC2626';
        edge.style.width = 4;
        edge.style.pattern = 'dashed';
      }
    }
  }

  private groupPoliciesByFramework(
    policies: CompleteEnhancedPolicy[],
    frameworks: string[]
  ): Map<string, CompleteEnhancedPolicy[]> {
    const groups = new Map<string, CompleteEnhancedPolicy[]>();

    for (const framework of frameworks) {
      groups.set(framework, []);
    }

    for (const policy of policies) {
      for (const framework of policy.metadata.complianceFrameworks) {
        if (groups.has(framework)) {
          groups.get(framework)!.push(policy);
        }
      }
    }

    return groups;
  }

  private getImpactStrength(impactLevel: string): number {
    const levels = { 'NONE': 0, 'LOW': 0.25, 'MEDIUM': 0.5, 'HIGH': 0.75, 'CRITICAL': 1.0 };
    return levels[impactLevel as keyof typeof levels] || 0.5;
  }

  private cacheVisualization(visualization: PolicyVisualization): void {
    this.visualizationCache.set(visualization.id, visualization);

    // Cleanup old visualizations (keep last 50)
    if (this.visualizationCache.size > 50) {
      const oldestKey = this.visualizationCache.keys().next().value;
      this.visualizationCache.delete(oldestKey);
    }
  }

  /**
   * Get cached visualization
   */
  getCachedVisualization(id: string): PolicyVisualization | undefined {
    return this.visualizationCache.get(id);
  }

  /**
   * Clear visualization cache
   */
  clearCache(): void {
    this.visualizationCache.clear();
    this.logger.info('Visualization cache cleared');
  }

  /**
   * Export visualization data for external tools
   */
  exportVisualization(visualization: PolicyVisualization, format: 'json' | 'graphml' | 'dot' = 'json'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(visualization, null, 2);

      case 'graphml':
        return this.convertToGraphML(visualization);

      case 'dot':
        return this.convertToDot(visualization);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private convertToGraphML(visualization: PolicyVisualization): string {
    // Basic GraphML conversion
    let graphml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    graphml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n';
    graphml += '  <graph id="policy-graph" edgedefault="directed">\n';

    // Add nodes
    for (const node of visualization.nodes) {
      graphml += `    <node id="${node.id}">\n`;
      graphml += `      <data key="label">${node.label}</data>\n`;
      graphml += `      <data key="type">${node.type}</data>\n`;
      graphml += `    </node>\n`;
    }

    // Add edges
    for (const edge of visualization.edges) {
      graphml += `    <edge source="${edge.source}" target="${edge.target}">\n`;
      graphml += `      <data key="type">${edge.type}</data>\n`;
      graphml += `    </edge>\n`;
    }

    graphml += '  </graph>\n';
    graphml += '</graphml>';

    return graphml;
  }

  private convertToDot(visualization: PolicyVisualization): string {
    let dot = `digraph "${visualization.title}" {\n`;
    dot += '  rankdir=TB;\n';

    // Add nodes
    for (const node of visualization.nodes) {
      const shape = node.style.shape === 'circle' ? 'circle' : 'box';
      dot += `  "${node.id}" [label="${node.label}", shape=${shape}, color="${node.style.color}"];\n`;
    }

    // Add edges
    for (const edge of visualization.edges) {
      const style = edge.style.pattern === 'dashed' ? 'dashed' : 'solid';
      dot += `  "${edge.source}" -> "${edge.target}" [style=${style}, color="${edge.style.color}"];\n`;
    }

    dot += '}';

    return dot;
  }
}