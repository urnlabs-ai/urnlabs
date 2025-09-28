import { z } from 'zod';
import { AgentSchema, AgentMetricsSchema } from './agent.js';
import { AgentTemplateSchema } from './template.js';

// Marketplace Category Enums
export const MarketplaceCategory = {
  FEATURED: 'featured',
  TRENDING: 'trending',
  NEW: 'new',
  POPULAR: 'popular',
  RECOMMENDED: 'recommended',
  ENTERPRISE: 'enterprise'
} as const;

export type MarketplaceCategoryType = typeof MarketplaceCategory[keyof typeof MarketplaceCategory];

// Deployment Status Enums
export const DeploymentStatus = {
  PENDING: 'pending',
  DEPLOYING: 'deploying',
  RUNNING: 'running',
  STOPPED: 'stopped',
  FAILED: 'failed',
  UPDATING: 'updating',
  SCALING: 'scaling'
} as const;

export type DeploymentStatusType = typeof DeploymentStatus[keyof typeof DeploymentStatus];

// Marketplace Item Schema
export const MarketplaceItemSchema = z.object({
  id: z.string(),
  type: z.enum(['agent', 'template']),
  agent: AgentSchema.optional(),
  template: AgentTemplateSchema.optional(),
  
  // Marketplace specific metadata
  featured: z.boolean().default(false),
  trending: z.boolean().default(false),
  verified: z.boolean().default(false),
  
  // Pricing information
  pricing: z.object({
    type: z.enum(['free', 'paid', 'freemium', 'enterprise']),
    cost: z.number().optional(), // per hour/month
    billingPeriod: z.enum(['hour', 'day', 'month', 'year']).optional(),
    freeTrialDays: z.number().optional(),
    features: z.object({
      free: z.array(z.string()).optional(),
      paid: z.array(z.string()).optional(),
      enterprise: z.array(z.string()).optional()
    }).optional()
  }).optional(),
  
  // Statistics
  stats: z.object({
    downloads: z.number().default(0),
    deployments: z.number().default(0),
    activeInstances: z.number().default(0),
    rating: z.number().min(0).max(5).optional(),
    reviewCount: z.number().default(0),
    lastUpdated: z.date()
  }),
  
  // Marketplace categories
  categories: z.array(z.enum([
    MarketplaceCategory.FEATURED,
    MarketplaceCategory.TRENDING,
    MarketplaceCategory.NEW,
    MarketplaceCategory.POPULAR,
    MarketplaceCategory.RECOMMENDED,
    MarketplaceCategory.ENTERPRISE
  ])).default([])
});

export type MarketplaceItem = z.infer<typeof MarketplaceItemSchema>;

// Agent Deployment Schema
export const AgentDeploymentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  agentId: z.string().optional(), // For existing agents
  templateId: z.string().optional(), // For template-based deployments
  organizationId: z.string(),
  
  // Deployment configuration
  config: z.object({
    replicas: z.number().min(1).default(1),
    autoScale: z.object({
      enabled: z.boolean().default(false),
      minReplicas: z.number().min(1).default(1),
      maxReplicas: z.number().min(1).default(10),
      targetCpuPercent: z.number().min(1).max(100).default(70),
      targetMemoryPercent: z.number().min(1).max(100).default(80)
    }).optional(),
    resources: z.object({
      cpu: z.string().optional(), // e.g., "0.5", "2"
      memory: z.string().optional(), // e.g., "512Mi", "2Gi"
      storage: z.string().optional() // e.g., "1Gi", "10Gi"
    }).optional(),
    environment: z.record(z.string()).optional(),
    secrets: z.record(z.string()).optional(),
    ports: z.array(z.object({
      name: z.string(),
      port: z.number(),
      targetPort: z.number().optional(),
      protocol: z.enum(['TCP', 'UDP']).default('TCP')
    })).optional()
  }),
  
  // Runtime information
  status: z.enum([
    DeploymentStatus.PENDING,
    DeploymentStatus.DEPLOYING,
    DeploymentStatus.RUNNING,
    DeploymentStatus.STOPPED,
    DeploymentStatus.FAILED,
    DeploymentStatus.UPDATING,
    DeploymentStatus.SCALING
  ]),
  
  // Container information
  containers: z.array(z.object({
    id: z.string(),
    image: z.string(),
    status: z.string(),
    restartCount: z.number().default(0),
    resources: z.object({
      cpuUsage: z.number().optional(),
      memoryUsage: z.number().optional()
    }).optional(),
    logs: z.array(z.string()).optional()
  })).optional(),
  
  // Health and metrics
  healthStatus: z.enum(['healthy', 'unhealthy', 'degraded', 'unknown']).default('unknown'),
  metrics: AgentMetricsSchema.optional(),
  
  // Deployment events
  events: z.array(z.object({
    timestamp: z.date(),
    type: z.enum(['info', 'warning', 'error']),
    message: z.string(),
    source: z.string().optional()
  })).optional(),
  
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  deployedAt: z.date().optional(),
  lastHealthCheck: z.date().optional()
});

export type AgentDeployment = z.infer<typeof AgentDeploymentSchema>;

// Marketplace Search Schema
export const MarketplaceSearchSchema = z.object({
  query: z.string().optional(),
  type: z.enum(['agent', 'template', 'all']).default('all'),
  category: z.enum([
    MarketplaceCategory.FEATURED,
    MarketplaceCategory.TRENDING,
    MarketplaceCategory.NEW,
    MarketplaceCategory.POPULAR,
    MarketplaceCategory.RECOMMENDED,
    MarketplaceCategory.ENTERPRISE
  ]).optional(),
  capabilities: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  pricing: z.enum(['free', 'paid', 'freemium', 'enterprise']).optional(),
  verified: z.boolean().optional(),
  minRating: z.number().min(0).max(5).optional(),
  sortBy: z.enum(['relevance', 'rating', 'downloads', 'updated', 'name']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

export type MarketplaceSearch = z.infer<typeof MarketplaceSearchSchema>;

// Agent Installation Schema
export const AgentInstallationSchema = z.object({
  marketplaceItemId: z.string(),
  name: z.string().min(1),
  organizationId: z.string(),
  configuration: z.record(z.any()).optional(),
  autoStart: z.boolean().default(true),
  license: z.object({
    type: z.string(),
    accepted: z.boolean(),
    acceptedBy: z.string(),
    acceptedAt: z.date()
  }).optional()
});

export type AgentInstallation = z.infer<typeof AgentInstallationSchema>;

// Agent Collection Schema (for grouping related agents)
export const AgentCollectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
  organizationId: z.string(),
  agentIds: z.array(z.string()),
  
  // Collection metadata
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  
  // Workflow information
  workflowTemplate: z.object({
    steps: z.array(z.object({
      agentId: z.string(),
      order: z.number(),
      config: z.record(z.any()).optional(),
      dependencies: z.array(z.string()).optional()
    }))
  }).optional(),
  
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string()
});

export type AgentCollection = z.infer<typeof AgentCollectionSchema>;