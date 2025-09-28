// Re-export all types for easy imports
export * from './agent.js';
export * from './template.js';
export * from './marketplace.js';

// Common response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  meta: {
    total: number;
    page: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  id?: string;
}

export interface AgentHealthUpdate extends WebSocketMessage {
  type: 'agent_health_update';
  data: {
    agentId: string;
    status: string;
    healthStatus: string;
    metrics?: any;
  };
}

export interface AgentRegistrationUpdate extends WebSocketMessage {
  type: 'agent_registration_update';
  data: {
    agentId: string;
    action: 'registered' | 'deregistered' | 'updated';
    agent?: any;
  };
}

export interface DeploymentStatusUpdate extends WebSocketMessage {
  type: 'deployment_status_update';
  data: {
    deploymentId: string;
    status: string;
    message?: string;
    progress?: number;
  };
}

// Error types
export class AgentRegistryError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AgentRegistryError';
  }
}

export class AgentNotFoundError extends AgentRegistryError {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`, 'AGENT_NOT_FOUND', 404);
  }
}

export class TemplateNotFoundError extends AgentRegistryError {
  constructor(templateId: string) {
    super(`Template not found: ${templateId}`, 'TEMPLATE_NOT_FOUND', 404);
  }
}

export class DeploymentError extends AgentRegistryError {
  constructor(message: string, deploymentId?: string) {
    super(
      deploymentId ? `Deployment ${deploymentId}: ${message}` : message,
      'DEPLOYMENT_ERROR',
      422
    );
  }
}

export class ValidationError extends AgentRegistryError {
  constructor(message: string, field?: string) {
    super(
      field ? `Validation error for ${field}: ${message}` : message,
      'VALIDATION_ERROR',
      400
    );
  }
}

// Health check types
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  details: {
    database?: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
    redis?: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
    docker?: {
      status: 'available' | 'unavailable';
      version?: string;
    };
    agents?: {
      total: number;
      healthy: number;
      unhealthy: number;
    };
  };
  version: string;
  uptime: number;
}