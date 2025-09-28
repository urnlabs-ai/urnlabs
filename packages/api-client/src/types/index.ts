import { z } from 'zod';

// Base types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user', 'viewer']),
  organizationId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().optional(),
  isActive: z.boolean(),
  avatar: z.string().url().optional()
});

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.enum(['starter', 'professional', 'enterprise']),
  settings: z.object({
    timezone: z.string(),
    dateFormat: z.string(),
    currency: z.string()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isActive: z.boolean(),
  limits: z.object({
    workflows: z.number(),
    executions: z.number(),
    users: z.number()
  })
});

// Workflow types
export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['trigger', 'action', 'condition', 'output']),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  data: z.record(z.any()),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional()
});

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  data: z.record(z.any()).optional()
});

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']),
  organizationId: z.string(),
  createdBy: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  settings: z.object({
    timeout: z.number(),
    retryAttempts: z.number(),
    concurrency: z.number(),
    webhookUrl: z.string().url().optional()
  }),
  version: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastExecutedAt: z.string().datetime().optional()
});

// Agent types
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['conversation', 'data-processing', 'integration', 'custom']),
  description: z.string().optional(),
  configuration: z.record(z.any()),
  status: z.enum(['active', 'inactive', 'error']),
  organizationId: z.string(),
  createdBy: z.string(),
  metrics: z.object({
    totalExecutions: z.number(),
    successRate: z.number(),
    averageResponseTime: z.number(),
    lastExecutedAt: z.string().datetime().optional()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Execution types
export const ExecutionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  agentId: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  duration: z.number().optional(),
  input: z.record(z.any()),
  output: z.record(z.any()).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional()
  }).optional(),
  logs: z.array(z.object({
    timestamp: z.string().datetime(),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
    metadata: z.record(z.any()).optional()
  })),
  cost: z.number().optional(),
  organizationId: z.string()
});

// Analytics types
export const MetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.any()).optional()
});

export const AnalyticsDataSchema = z.object({
  period: z.enum(['hour', 'day', 'week', 'month', 'year']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  metrics: z.array(MetricSchema),
  aggregations: z.object({
    total: z.number(),
    average: z.number(),
    minimum: z.number(),
    maximum: z.number(),
    trend: z.number()
  })
});

// API Response types
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional()
  }).optional(),
  meta: z.object({
    timestamp: z.string().datetime(),
    requestId: z.string(),
    version: z.string()
  })
});

export const PaginatedResponseSchema = z.object({
  data: z.array(z.any()),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrevious: z.boolean()
  }),
  meta: z.object({
    timestamp: z.string().datetime(),
    requestId: z.string(),
    version: z.string()
  })
});

// Export inferred types
export type User = z.infer<typeof UserSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type Execution = z.infer<typeof ExecutionSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;
export type ApiResponse<T = any> = z.infer<typeof ApiResponseSchema> & { data?: T };
export type PaginatedResponse<T = any> = z.infer<typeof PaginatedResponseSchema> & { data: T[] };

// Query parameters
export interface ListParams {
  page?: number;
  limit?: number;
  sort?: string;
  filter?: Record<string, any>;
  search?: string;
}

export interface AnalyticsParams {
  startDate: string;
  endDate: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'year';
  metrics?: string[];
  groupBy?: string;
}

// Authentication types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
}

// WebSocket types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  id: string;
}

export interface WorkflowExecutionUpdate {
  executionId: string;
  workflowId: string;
  status: Execution['status'];
  progress: number;
  currentNode?: string;
  logs?: Execution['logs'];
}

export interface SystemNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  action?: {
    label: string;
    url: string;
  };
  timestamp: string;
  read: boolean;
}