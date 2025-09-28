import { z } from 'zod';
import { AgentCapabilitySchema, AgentConfigSchema } from './agent.js';

// Template Category Enums
export const TemplateCategory = {
  CODE_REVIEW: 'code_review',
  DEPLOYMENT: 'deployment',
  TESTING: 'testing',
  MONITORING: 'monitoring',
  SECURITY: 'security',
  ANALYTICS: 'analytics',
  AUTOMATION: 'automation',
  CUSTOM: 'custom'
} as const;

export type TemplateCategoryType = typeof TemplateCategory[keyof typeof TemplateCategory];

// Template Complexity Levels
export const TemplateComplexity = {
  BASIC: 'basic',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert'
} as const;

export type TemplateComplexityType = typeof TemplateComplexity[keyof typeof TemplateComplexity];

// Template Parameter Schema
export const TemplateParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string(),
  required: z.boolean().default(false),
  defaultValue: z.any().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.any()).optional()
  }).optional(),
  sensitive: z.boolean().default(false) // For secrets/passwords
});

export type TemplateParameter = z.infer<typeof TemplateParameterSchema>;

// Template Dependencies Schema
export const TemplateDependencySchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  type: z.enum(['service', 'database', 'api', 'tool', 'library']),
  required: z.boolean().default(true),
  description: z.string().optional()
});

export type TemplateDependency = z.infer<typeof TemplateDependencySchema>;

// Template Schema
export const AgentTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string(),
  category: z.enum([
    TemplateCategory.CODE_REVIEW,
    TemplateCategory.DEPLOYMENT,
    TemplateCategory.TESTING,
    TemplateCategory.MONITORING,
    TemplateCategory.SECURITY,
    TemplateCategory.ANALYTICS,
    TemplateCategory.AUTOMATION,
    TemplateCategory.CUSTOM
  ]),
  complexity: z.enum([
    TemplateComplexity.BASIC,
    TemplateComplexity.INTERMEDIATE,
    TemplateComplexity.ADVANCED,
    TemplateComplexity.EXPERT
  ]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  
  // Template Definition
  agentType: z.string(),
  capabilities: z.array(AgentCapabilitySchema),
  specializations: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  
  // Configuration Template
  configTemplate: AgentConfigSchema,
  parameters: z.array(TemplateParameterSchema).default([]),
  dependencies: z.array(TemplateDependencySchema).default([]),
  
  // Deployment Information
  dockerImage: z.string().optional(),
  dockerTag: z.string().optional(),
  environmentVariables: z.record(z.string()).optional(),
  requiredPorts: z.array(z.number()).optional(),
  volumes: z.array(z.string()).optional(),
  
  // Documentation
  documentation: z.object({
    overview: z.string(),
    setup: z.string().optional(),
    usage: z.string().optional(),
    examples: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      code: z.string(),
      language: z.string().optional()
    })).optional(),
    troubleshooting: z.string().optional()
  }).optional(),
  
  // Metadata
  tags: z.array(z.string()).default([]),
  author: z.string().optional(),
  authorEmail: z.string().email().optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  
  // Usage Statistics
  downloadCount: z.number().default(0),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().default(0),
  
  // Status
  isPublic: z.boolean().default(true),
  isVerified: z.boolean().default(false),
  isDeprecated: z.boolean().default(false),
  
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  publishedAt: z.date().optional()
});

export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;

// Template Deployment Schema
export const TemplateDeploymentSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1),
  parameters: z.record(z.any()).default({}),
  organizationId: z.string(),
  
  // Override configurations
  configOverrides: AgentConfigSchema.optional(),
  environmentOverrides: z.record(z.string()).optional(),
  
  // Deployment options
  autoStart: z.boolean().default(true),
  replicas: z.number().min(1).default(1),
  
  // Resource allocation
  resources: z.object({
    cpu: z.string().optional(),
    memory: z.string().optional(),
    storage: z.string().optional()
  }).optional()
});

export type TemplateDeployment = z.infer<typeof TemplateDeploymentSchema>;

// Template Search Query Schema
export const TemplateSearchQuerySchema = z.object({
  query: z.string().optional(),
  category: z.enum([
    TemplateCategory.CODE_REVIEW,
    TemplateCategory.DEPLOYMENT,
    TemplateCategory.TESTING,
    TemplateCategory.MONITORING,
    TemplateCategory.SECURITY,
    TemplateCategory.ANALYTICS,
    TemplateCategory.AUTOMATION,
    TemplateCategory.CUSTOM
  ]).optional(),
  complexity: z.enum([
    TemplateComplexity.BASIC,
    TemplateComplexity.INTERMEDIATE,
    TemplateComplexity.ADVANCED,
    TemplateComplexity.EXPERT
  ]).optional(),
  tags: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  verified: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  author: z.string().optional(),
  minRating: z.number().min(0).max(5).optional(),
  sortBy: z.enum(['name', 'rating', 'downloads', 'created', 'updated']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

export type TemplateSearchQuery = z.infer<typeof TemplateSearchQuerySchema>;

// Template Review Schema
export const TemplateReviewSchema = z.object({
  id: z.string().optional(),
  templateId: z.string(),
  userId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TemplateReview = z.infer<typeof TemplateReviewSchema>;