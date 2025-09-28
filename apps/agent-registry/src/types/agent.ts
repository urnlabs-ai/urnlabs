import { z } from 'zod';

// Agent Status Enums
export const AgentStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  MAINTENANCE: 'maintenance',
  UNHEALTHY: 'unhealthy',
  STARTING: 'starting',
  STOPPING: 'stopping',
  ERROR: 'error'
} as const;

export type AgentStatusType = typeof AgentStatus[keyof typeof AgentStatus];

// Agent Health Status
export const HealthStatus = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown'
} as const;

export type HealthStatusType = typeof HealthStatus[keyof typeof HealthStatus];

// Load Balancing Algorithms
export const LoadBalancingAlgorithm = {
  ROUND_ROBIN: 'round_robin',
  LEAST_CONNECTIONS: 'least_connections',
  CAPABILITY_BASED: 'capability_based',
  WEIGHTED_ROUND_ROBIN: 'weighted_round_robin',
  PERFORMANCE_BASED: 'performance_based'
} as const;

export type LoadBalancingAlgorithmType = typeof LoadBalancingAlgorithm[keyof typeof LoadBalancingAlgorithm];

// Agent Capability Schema
export const AgentCapabilitySchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  requiredTools: z.array(z.string()).optional(),
  supportedFormats: z.array(z.string()).optional()
});

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

// Agent Configuration Schema
export const AgentConfigSchema = z.object({
  maxConcurrency: z.number().min(1).default(1),
  timeout: z.number().min(1000).default(30000), // milliseconds
  retries: z.number().min(0).default(3),
  resources: z.object({
    cpu: z.string().optional(), // e.g., "0.5", "2"
    memory: z.string().optional(), // e.g., "512Mi", "2Gi"
    storage: z.string().optional() // e.g., "1Gi", "10Gi"
  }).optional(),
  environment: z.record(z.string()).optional(),
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    interval: z.number().default(30000), // milliseconds
    timeout: z.number().default(5000), // milliseconds
    retries: z.number().default(3)
  }).optional()
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Agent Performance Metrics Schema
export const AgentMetricsSchema = z.object({
  responseTime: z.number(), // milliseconds
  throughput: z.number(), // requests per second
  errorRate: z.number(), // percentage
  cpuUsage: z.number().optional(), // percentage
  memoryUsage: z.number().optional(), // percentage
  activeConnections: z.number().default(0),
  totalRequests: z.number().default(0),
  successfulRequests: z.number().default(0),
  failedRequests: z.number().default(0),
  lastUpdated: z.date()
});

export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;

// Agent Registration Schema
export const AgentRegistrationSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // semver format
  capabilities: z.array(AgentCapabilitySchema),
  specializations: z.array(z.string()).default([]),
  config: AgentConfigSchema.optional(),
  tools: z.array(z.string()).default([]),
  endpoint: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

// Extended Agent Schema (includes runtime information)
export const AgentSchema = AgentRegistrationSchema.extend({
  id: z.string(),
  organizationId: z.string(),
  status: z.enum([
    AgentStatus.ACTIVE,
    AgentStatus.INACTIVE,
    AgentStatus.MAINTENANCE,
    AgentStatus.UNHEALTHY,
    AgentStatus.STARTING,
    AgentStatus.STOPPING,
    AgentStatus.ERROR
  ]),
  healthStatus: z.enum([
    HealthStatus.HEALTHY,
    HealthStatus.UNHEALTHY,
    HealthStatus.DEGRADED,
    HealthStatus.UNKNOWN
  ]),
  metrics: AgentMetricsSchema.optional(),
  lastHeartbeat: z.date().optional(),
  registeredAt: z.date(),
  lastSeen: z.date().optional(),
  containerInfo: z.object({
    containerId: z.string().optional(),
    image: z.string().optional(),
    ports: z.array(z.number()).optional(),
    volumes: z.array(z.string()).optional()
  }).optional()
});

export type Agent = z.infer<typeof AgentSchema>;

// Agent Discovery Query Schema
export const AgentDiscoveryQuerySchema = z.object({
  capabilities: z.array(z.string()).optional(),
  type: z.string().optional(),
  status: z.array(z.enum([
    AgentStatus.ACTIVE,
    AgentStatus.INACTIVE,
    AgentStatus.MAINTENANCE,
    AgentStatus.UNHEALTHY,
    AgentStatus.STARTING,
    AgentStatus.STOPPING,
    AgentStatus.ERROR
  ])).optional(),
  healthStatus: z.array(z.enum([
    HealthStatus.HEALTHY,
    HealthStatus.UNHEALTHY,
    HealthStatus.DEGRADED,
    HealthStatus.UNKNOWN
  ])).optional(),
  specializations: z.array(z.string()).optional(),
  minVersion: z.string().optional(),
  maxVersion: z.string().optional(),
  organizationId: z.string().optional(),
  tags: z.record(z.string()).optional(),
  loadBalancing: z.enum([
    LoadBalancingAlgorithm.ROUND_ROBIN,
    LoadBalancingAlgorithm.LEAST_CONNECTIONS,
    LoadBalancingAlgorithm.CAPABILITY_BASED,
    LoadBalancingAlgorithm.WEIGHTED_ROUND_ROBIN,
    LoadBalancingAlgorithm.PERFORMANCE_BASED
  ]).optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0)
});

export type AgentDiscoveryQuery = z.infer<typeof AgentDiscoveryQuerySchema>;

// Agent Update Schema
export const AgentUpdateSchema = z.object({
  status: z.enum([
    AgentStatus.ACTIVE,
    AgentStatus.INACTIVE,
    AgentStatus.MAINTENANCE,
    AgentStatus.UNHEALTHY,
    AgentStatus.STARTING,
    AgentStatus.STOPPING,
    AgentStatus.ERROR
  ]).optional(),
  config: AgentConfigSchema.optional(),
  capabilities: z.array(AgentCapabilitySchema).optional(),
  specializations: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional()
});

export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;

// Heartbeat Schema
export const HeartbeatSchema = z.object({
  agentId: z.string(),
  timestamp: z.date(),
  status: z.enum([
    AgentStatus.ACTIVE,
    AgentStatus.INACTIVE,
    AgentStatus.MAINTENANCE,
    AgentStatus.UNHEALTHY,
    AgentStatus.STARTING,
    AgentStatus.STOPPING,
    AgentStatus.ERROR
  ]),
  healthStatus: z.enum([
    HealthStatus.HEALTHY,
    HealthStatus.UNHEALTHY,
    HealthStatus.DEGRADED,
    HealthStatus.UNKNOWN
  ]),
  metrics: AgentMetricsSchema.optional(),
  metadata: z.record(z.any()).optional()
});

export type Heartbeat = z.infer<typeof HeartbeatSchema>;